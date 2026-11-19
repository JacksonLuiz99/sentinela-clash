import { parseGameTime, performance } from './stats.js';

export const PLAYER_KEY = 'tigers-player-tag';
const TAG_ALPHABET = '0289PYLQGRJCUV';
const ROLES = {leader:'Líder',coLeader:'Colíder',admin:'Ancião',member:'Membro'};
const MINUTE = 60000;

// Tags do Clash usam apenas este alfabeto; a letra O costuma ser digitada no lugar do zero.
export function normalizePlayerTag(value) {
  const body = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/^#/, '').replace(/O/g, '0');
  return body.length >= 3 && body.length <= 15 && [...body].every(c => TAG_ALPHABET.includes(c)) ? `#${body}` : null;
}

// Mesmas janelas da aba de atenção: 10 min para o clã principal e 30 min para os demais.
export function warIsRecent(clanTag, capturedAt, now, defaultTag) {
  const window = (clanTag === defaultTag ? 10 : 30) * MINUTE;
  return Number.isFinite(capturedAt) && capturedAt > 0 && capturedAt <= now + MINUTE && now - capturedAt <= window;
}

export function playerStatus({tag, clan, war, recent, now = Date.now()}) {
  if (!tag) return {kind:'choose'};
  if (!clan) return {kind:'noData'};
  const member = clan.memberList?.find(m => m.tag === tag);
  if (!member) return {kind:'notInClan', tag, clanName: clan.name};
  const base = {kind:'member', clanName: clan.name, member: {tag, name: member.name, townHallLevel: member.townHallLevel, role: member.role}};
  if (!war) return {...base, war:{state:'none'}};
  // Sem captura recente da guerra, não confirmamos ataques pendentes.
  if (!recent) return {...base, war:{state:'unconfirmed'}};
  if (war.state === 'preparation') return {...base, war:{state:'preparation', startAt: parseGameTime(war.startTime)}};
  if (war.state === 'warEnded') return {...base, war:{state:'ended'}};
  if (war.state !== 'inWar') return {...base, war:{state:'unconfirmed'}};
  const endAt = parseGameTime(war.endTime);
  if (!endAt || endAt <= now) return {...base, war:{state:'awaitingUpdate'}};
  const entry = (war.clan?.members || []).find(m => m.tag === tag);
  if (!entry) return {...base, war:{state:'notScheduled', endAt}};
  const limit = war.attacksPerMember ?? (war.kind === 'cwl' ? 1 : 2);
  const used = entry.attacks?.length || 0;
  return {...base, war:{state:'active', endAt, used, limit, remaining: Math.max(0, limit - used)}};
}

// Conquistas usam só o que o monitor coletou: nada é inferido de guerras ou períodos sem registro.
export function playerAchievements({tag, clan, war, wars = [], recent}) {
  const items = [];
  const entry = war?.clan?.members?.find(m => m.tag === tag);
  if (entry && recent && war.state === 'inWar') {
    const limit = war.attacksPerMember ?? (war.kind === 'cwl' ? 1 : 2);
    const attacks = entry.attacks || [];
    const triples = attacks.filter(a => a.stars === 3).length;
    if (attacks.length && attacks.length >= limit) items.push({title:'Ataques completos', detail:'Você usou todos os seus ataques nesta guerra.'});
    if (triples) items.push({title:`${triples} ${triples === 1 ? 'triplo' : 'triplos'} nesta guerra`, detail:'Três estrelas no ataque é o melhor resultado possível.'});
  }
  const donors = [...(clan?.memberList || [])].filter(m => (m.donations || 0) > 0).sort((a, b) => (b.donations || 0) - (a.donations || 0));
  const rank = donors.findIndex(m => m.tag === tag);
  if (rank >= 0 && rank < 5) items.push({title:`${rank + 1}º em doações nesta temporada`, detail:`${donors[rank].donations} tropas doadas. Estão entre os 5 que mais doaram.`});
  const history = performance(wars, {completedOnly: true}).find(p => p.tag === tag);
  if (history && history.wars > 0) {
    items.push({title:`${history.wars} ${history.wars === 1 ? 'guerra acompanhada' : 'guerras acompanhadas'}`, detail:`${history.attacks} ${history.attacks === 1 ? 'ataque registrado' : 'ataques registrados'}, ${history.stars} estrelas e ${history.triples} ${history.triples === 1 ? 'triplo' : 'triplos'} no total.`});
  }
  return items;
}

export function formatRemaining(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'encerrada';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / MINUTE);
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

// A tag fica só neste aparelho. Armazenamento indisponível não impede o uso da tela.
export function readPlayerTag(storage = globalThis.localStorage) {
  try { return normalizePlayerTag(storage.getItem(PLAYER_KEY)); } catch { return null; }
}
export function writePlayerTag(tag, storage = globalThis.localStorage) {
  try {
    if (tag) storage.setItem(PLAYER_KEY, tag); else storage.removeItem(PLAYER_KEY);
    return true;
  } catch { return false; }
}

export function initPlayer({getData, getSelectedClan, defaultTag, escape:esc, date, playerLink, openWar, apiBase = () => '', switchClan = () => {}, now = () => Date.now()}) {
  const $ = id => document.getElementById(id);
  const num = value => Number(value || 0).toLocaleString('pt-BR');
  let editing = false;
  let locate = {tag: null, state: 'idle', matches: [], error: ''};

  async function searchPlayer(tag) {
    locate = {tag, state: 'loading', matches: [], error: ''};
    render();
    try {
      const response = await fetch(`${apiBase()}/api/player-locate?player=${encodeURIComponent(tag)}`);
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      locate = {tag, state: 'done', matches: data.matches || [], error: ''};
    } catch {
      locate = {tag, state: 'error', matches: [], error: 'Não foi possível procurar agora. Tente de novo em instantes.'};
    }
    render();
  }

  function locateHtml(tag) {
    if (locate.tag !== tag) return '<button id="player-search" class="button" type="button">Procurar em todos os clãs</button>';
    if (locate.state === 'loading') return '<p class="coverage">Procurando nos clãs da família…</p>';
    if (locate.state === 'error') return `<p class="player-warning">${esc(locate.error)}</p><button id="player-search" class="outline-button" type="button">Tentar de novo</button>`;
    if (!locate.matches.length) return '<p class="coverage">Também não aparece em nenhum outro clã da família nas últimas coletas. Confira se a tag está correta no seu perfil do jogo.</p>';
    return `<ul class="player-locate-list">${locate.matches.map(m => `<li><span><strong>${esc(m.clanName)}</strong> · ${esc(ROLES[m.role] || m.role)}${m.capturedAt ? ` · coleta de ${esc(date(m.capturedAt))}` : ''}</span><button class="outline-button" type="button" data-switch-clan="${esc(m.clanTag)}">Ver neste clã</button></li>`).join('')}</ul><p class="coverage">Os dados vêm da última coleta de cada clã.</p>`;
  }
  const formArea = $('player-form-area');
  const status = $('player-status');

  function formHtml(tag, error, typed = '') {
    return `<form id="player-form" class="panel player-form"><h3>QUAL É A SUA TAG?</h3><p class="coverage">No jogo, abra seu perfil. A tag aparece abaixo do seu nome e começa com #. Ela fica guardada só neste aparelho.</p><label>Sua tag<input id="player-tag-input" maxlength="20" autocomplete="off" spellcheck="false" placeholder="#2PP822" value="${esc(typed)}" required></label><p class="player-error" role="alert"${error ? '' : ' hidden'}>${esc(error || '')}</p><div class="recruit-actions"><button class="button" type="submit">Salvar minha tag</button>${tag ? '<button type="button" class="outline-button" id="player-cancel">Cancelar</button>' : ''}</div></form>`;
  }

  function warBlock(w) {
    const dateText = value => value ? `${date(value)} (Cuiabá)` : '—';
    switch (w.state) {
      case 'active': {
        const remaining = now();
        return `<div class="player-missions"><div class="player-big"><strong>${num(w.remaining)}</strong><span>${w.remaining === 1 ? 'ataque para fazer' : 'ataques para fazer'}</span></div><p class="coverage">Você usou ${num(w.used)} de ${num(w.limit)}. A guerra termina em ${dateText(w.endAt)}, faltam ${esc(formatRemaining(w.endAt - remaining))}.</p>${w.remaining ? '' : '<p class="player-done">Seus ataques desta guerra estão feitos.</p>'}</div><button id="player-open-war" class="button" type="button">Ver a guerra</button>`;
      }
      case 'preparation': return `<p class="coverage">A guerra ainda está em preparação. Seus ataques aparecem quando ela começar, ${esc(dateText(w.startAt))}.</p>`;
      case 'notScheduled': return '<p class="coverage">Você não está na escalação desta guerra. Se for escalado depois, a lista aparece aqui na próxima atualização.</p>';
      case 'ended': return '<p class="coverage">A última guerra deste clã terminou. O resultado fica em Clã → Histórico.</p>';
      case 'none': return '<p class="coverage">Nenhuma guerra em andamento agora.</p>';
      case 'awaitingUpdate': return '<p class="coverage">A guerra já deveria ter terminado. Aguardando a próxima atualização da API.</p>';
      default: return '<p class="player-warning">Não confirmamos seus ataques agora: os dados da guerra estão antigos ou indisponíveis. Eles não são cobrados enquanto isso.</p>';
    }
  }

  function achievementsHtml(items = []) {
    if (!items.length) return '<p class="coverage player-achievements-empty">Suas conquistas aparecem aqui conforme as guerras forem acompanhadas pelo monitor.</p>';
    return `<section class="player-achievements" aria-label="Suas conquistas"><h4>SUAS CONQUISTAS</h4><ul>${items.map(a => `<li><strong>${esc(a.title)}</strong><span>${esc(a.detail)}</span></li>`).join('')}</ul><p class="coverage">Calculadas só com as guerras e coletas acompanhadas pelo monitor.</p></section>`;
  }

  function statusHtml(s) {
    if (s.kind === 'noData') return '<div class="panel empty">Aguardando os dados do clã selecionado.</div>';
    if (s.kind === 'choose') return '';
    if (s.kind === 'notInClan') return `<div class="panel player-card"><p class="player-warning">Não encontramos ${esc(s.tag)} em ${esc(s.clanName)}. Confira a tag no seu perfil ou escolha o clã certo no seletor do topo.</p>${locateHtml(s.tag)}<div class="player-actions"><button id="player-change" class="outline-button" type="button">Trocar tag</button><button id="player-forget" class="text-button" type="button">Remover deste aparelho</button></div></div>`;
    const m = s.member;
    return `<article class="panel player-card"><p class="eyebrow">${esc(s.clanName)}</p><h3>${esc(m.name)}</h3><p class="coverage">CV ${num(m.townHallLevel)} · ${esc(ROLES[m.role] || m.role)} · <a href="${esc(playerLink(m.tag))}" target="_blank" rel="noopener noreferrer">Abrir perfil no jogo ↗</a></p>${warBlock(s.war)}${achievementsHtml(s.achievements)}<div class="player-actions"><button id="player-change" class="outline-button" type="button">Trocar tag</button><button id="player-forget" class="text-button" type="button">Remover deste aparelho</button></div></article>`;
  }

  function render() {
    const tag = readPlayerTag();
    const payload = getData();
    const clan = payload?.current?.clan;
    const showForm = !tag || editing;
    formArea.hidden = !showForm;
    if (showForm) {
      if (!formArea.querySelector('#player-form')) formArea.innerHTML = formHtml(tag, '');
    } else {
      formArea.replaceChildren();
    }
    const current = payload?.current;
    const recent = Boolean(current?.warCapturedAt) && warIsRecent(getSelectedClan(), current.warCapturedAt, now(), defaultTag);
    const s = playerStatus({tag: showForm ? null : tag, clan, war: current?.war, recent, now: now()});
    if (s.kind === 'member') s.achievements = playerAchievements({tag, clan, war: current?.war, wars: payload?.wars || [], recent});
    status.innerHTML = statusHtml(s);
  }

  formArea.addEventListener('submit', event => {
    if (event.target.id !== 'player-form') return;
    event.preventDefault();
    const input = $('player-tag-input');
    const tag = normalizePlayerTag(input.value);
    if (!tag) {
      formArea.innerHTML = formHtml(readPlayerTag(), 'Tag inválida. Use somente 0, 2, 8, 9, P, Y, L, Q, G, R, J, C, U e V, como #2PP822. A letra O vale como zero.', input.value);
      return;
    }
    writePlayerTag(tag);
    editing = false;formArea.replaceChildren();render();
  });
  formArea.addEventListener('click', event => {
    if (event.target.closest('#player-cancel')) {editing = false;formArea.replaceChildren();render();}
  });
  status.addEventListener('click', event => {
    if (event.target.closest('#player-change')) {editing = true;formArea.innerHTML = formHtml(readPlayerTag(), '');render();$('player-tag-input')?.focus();}
    if (event.target.closest('#player-forget')) {writePlayerTag(null);editing = false;render();}
    if (event.target.closest('#player-open-war')) openWar();
    const search = event.target.closest('#player-search');
    if (search) {const tag = readPlayerTag(); if (tag) searchPlayer(tag);}
    const target = event.target.closest('[data-switch-clan]');
    if (target) {locate = {tag: null, state: 'idle', matches: [], error: ''}; switchClan(target.dataset.switchClan);}
  });
  setInterval(() => {if (!document.hidden && !editing) render();}, 30000);
  return {render};
}
