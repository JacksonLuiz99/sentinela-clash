export function gameTime(value) {
  if (!value) return null;
  const d = value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6');
  const n = Date.parse(d);
  return Number.isFinite(n) ? n : null;
}

export function orientWar(war, tag) {
  if (!war || war.state === 'notInWar') return null;
  if (war.clan?.tag === tag) return war;
  if (war.opponent?.tag === tag) return { ...war, clan: war.opponent, opponent: war.clan };
  return null;
}

export function warId(war) {
  return war ? `${war.kind || 'regular'}:${war.startTime}:${war.opponent.tag}` : null;
}

export function pendingAttacks(war) {
  if (!war) return [];
  const limit = war.attacksPerMember ?? (war.kind === 'cwl' ? 1 : 2);
  return [...(war.clan.members || [])].sort((a,b) => a.mapPosition-b.mapPosition)
    .map(m => ({ tag: m.tag, name: m.name, position: m.mapPosition, remaining: Math.max(0, limit-(m.attacks?.length || 0)) }))
    .filter(m => m.remaining > 0);
}

export function warResult(war) {
  const a = war.clan; const b = war.opponent;
  const diff = (a.stars-b.stars) || (a.destructionPercentage-b.destructionPercentage);
  return diff > 0 ? 'Vitória' : diff < 0 ? 'Derrota' : 'Empate';
}

export function detectEvents(previous, current, now) {
  const result = [];
  const add = (id, type, message, expiresAt = null) => result.push({ id, type, message, createdAt: now, expiresAt });
  // A primeira leitura cria uma referência e não anuncia entradas ou guerras antigas.
  if (previous?.clan) {
    const old = new Map(previous.clan.memberList.map(m => [m.tag,m]));
    const fresh = new Map(current.clan.memberList.map(m => [m.tag,m]));
    const changes = [
      ['member_join', [...fresh].filter(([tag]) => !old.has(tag)).map(([,m]) => m)],
      ['member_leave', [...old].filter(([tag]) => !fresh.has(tag)).map(([,m]) => m)]
    ];
    for (const [type, members] of changes) if (members.length) {
      const label = type === 'member_join' ? 'Entraram no clã' : 'Saíram do clã';
      add(`${type}:${current.capturedAt}:${members.map(m => m.tag).sort().join(',')}`, type,
        `${label} ${current.clan.name}: ${members.map(m => `${m.name} (${m.tag})`).join(', ')}`);
    }
  }
  if (!previous) return result;
  const war = current.war;
  if (!war) return result;
  const key = warId(war); const same = warId(previous?.war) === key;
  const end = gameTime(war.endTime);
  if (previous && war.state === 'inWar' && (!same || previous.war.state !== 'inWar')) {
    add(`war_start:${key}`, 'war_start', `Guerra iniciada: ${war.clan.name} × ${war.opponent.name}. ${war.teamSize} participantes.`, end);
  }
  if (previous && war.state === 'warEnded' && (!same || previous.war.state !== 'warEnded')) {
    // Recupera resultado se a primeira coleta pós-início ocorrer depois do término.
    if (end && now-end < 24*3600000) add(`war_end:${key}`, 'war_end',
      `${warResult(war)}: ${war.clan.name} ${war.clan.stars} × ${war.opponent.stars} ${war.opponent.name}. Destruição: ${war.clan.destructionPercentage}% × ${war.opponent.destructionPercentage}%.`);
  }
  if (war.state === 'inWar' && end) {
    const pending = pendingAttacks(war);
    const left = end-now;
    // Janelas curtas evitam disparar lembretes vencidos quando o serviço volta.
    for (const hours of [6,1]) if (left > (hours*60-15)*60000 && left <= hours*3600000 && pending.length) {
      add(`war_reminder:${key}:${hours}`, 'war_reminder',
        `Faltam aproximadamente ${hours}h contra ${war.opponent.name}. Ataques pendentes: ${pending.map(m => `${m.name}: ${m.remaining}`).join('; ')}.`, end);
    }
  }
  return result;
}
