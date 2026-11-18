export function parseGameTime(value) {
  if (!value) return null;
  const n = Date.parse(value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
  return Number.isFinite(n) ? n : null;
}

export function performance(wars, { completedOnly = false } = {}) {
  const seen = new Set(); const players = new Map();
  for (const war of wars.filter(Boolean)) {
    if (!['inWar', 'warEnded'].includes(war.state) || (completedOnly && war.state !== 'warEnded')) continue;
    const key = `${war.startTime}:${war.endTime}:${war.opponent?.tag}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const limit = war.attacksPerMember ?? (war.kind === 'cwl' ? 1 : 2);
    const opponents = new Map((war.opponent?.members || []).map(m => [m.tag, m]));
    for (const m of war.clan?.members || []) {
      const p = players.get(m.tag) || { tag: m.tag, name: m.name, townHall: m.townhallLevel ?? m.townHallLevel, wars: 0, attacks: 0, expected: 0, stars: 0, triples: 0, damage: 0, seconds: 0, timed: 0, position: m.mapPosition, hits: [] };
      p.name = m.name; p.wars++; p.expected += limit;
      for (const a of m.attacks || []) {
        p.attacks++; p.stars += a.stars || 0; p.triples += a.stars === 3 ? 1 : 0; p.damage += a.destructionPercentage || 0;
        if (Number.isFinite(a.duration)) { p.seconds += a.duration; p.timed++; }
        const target = opponents.get(a.defenderTag);
        p.hits.push({ ...a, targetName: target?.name || a.defenderTag, targetPosition: target?.mapPosition, targetTH: target?.townhallLevel ?? target?.townHallLevel });
      }
      players.set(m.tag, p);
    }
  }
  return [...players.values()].map(p => ({ ...p, averageStars: p.attacks ? p.stars / p.attacks : 0, averageDamage: p.attacks ? p.damage / p.attacks : 0, tripleRate: p.attacks ? 100*p.triples/p.attacks : 0, participation: p.expected ? 100*p.attacks/p.expected : 0, averageDuration: p.timed ? p.seconds/p.timed : null }))
    .sort((a,b) => b.stars-a.stars || b.triples-a.triples || b.averageDamage-a.averageDamage || b.attacks-a.attacks || a.name.localeCompare(b.name, 'pt-BR'));
}

export function outcome(war) {
  if (war.result) return ({win:'Vitória',lose:'Derrota',tie:'Empate'})[war.result] || 'Encerrada';
  if (war.state !== 'warEnded') return ({inWar:'Em guerra',preparation:'Preparação'})[war.state] || 'Sem resultado';
  const diff = (war.clan.stars-war.opponent.stars) || (war.clan.destructionPercentage-war.opponent.destructionPercentage);
  return diff > 0 ? 'Vitória' : diff < 0 ? 'Derrota' : 'Empate';
}

export function mergedHistory(observed = [], log = []) {
  const map = new Map();
  for (const war of log) {
    if (!war.clan || !war.opponent) continue;
    const key = `${war.endTime}:${war.opponent.tag || war.opponent.name}`;
    map.set(key, { ...war, state: 'warEnded', source: 'api', kind: war.kind || (war.attacksPerMember === 1 ? 'cwl' : 'regular') });
  }
  for (const war of observed) {
    if (!war?.clan || !war.opponent) continue;
    const key = `${war.endTime}:${war.opponent.tag || war.opponent.name}`;
    map.set(key, { ...war, source: 'monitor' });
  }
  return [...map.values()].sort((a,b) => (parseGameTime(b.endTime) || 0)-(parseGameTime(a.endTime) || 0));
}

export function publicLinks(env) {
  const discord = env.DISCORD_PUBLIC_URL || '';
  const telegram = env.TELEGRAM_PUBLIC_URL || 'https://t.me/tigers_of_war4_alertas_bot';
  return {
    discord: /^https:\/\/(?:discord\.gg\/[A-Za-z0-9-]+|discord\.com\/(?:invite\/[A-Za-z0-9-]+|channels\/\d+\/\d+))$/.test(discord) ? discord : null,
    telegram: /^https:\/\/t\.me\/(?:[A-Za-z0-9_]+|\+[A-Za-z0-9_-]+)$/.test(telegram) ? telegram : null
  };
}
