import { CLANS, DEFAULT_CLAN, findClan, preferredClan } from './clans.js';
import { performance, mergedHistory, outcome, parseGameTime, publicLinks } from './stats.js';
const $ = id => document.getElementById(id);
const num = (value, digits = 0) => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('pt-BR', {maximumFractionDigits:digits});
const date = value => value ? new Date(value).toLocaleString('pt-BR', {timeZone:'America/Cuiaba',dateStyle:'short',timeStyle:'short'}) : '—';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles = {leader:'Líder',coLeader:'Colíder',admin:'Ancião',member:'Membro'};
const states = {preparation:'PREPARAÇÃO',inWar:'EM GUERRA',warEnded:'ENCERRADA'};
const icons = {member_join:'+',member_leave:'−',war_start:'⚔',war_end:'⚑',war_reminder:'◷',channel_test:'✓'};
const districtNames = {'Capital Peak':'Pico da Capital','Barbarian Camp':'Acampamento Bárbaro','Wizard Valley':'Vale dos Magos','Balloon Lagoon':'Lagoa dos Balões',"Builder's Workshop":'Oficina do Construtor','Dragon Cliffs':'Penhascos dos Dragões','Golem Quarry':'Pedreira de Golems','Skeleton Park':'Parque dos Esqueletos','Goblin Mines':'Minas dos Goblins'};
const empty = text => `<div class="empty">${esc(text)}</div>`;
const playerLink = tag => `https://link.clashofclans.com/pt?action=OpenPlayerProfile&tag=${encodeURIComponent((tag || '').replace('#',''))}`;
const badge = (url, alt = '') => /^https:\/\/api-assets\.clashofclans\.com\//.test(url || '') ? `<img src="${esc(url)}" alt="${esc(alt)}" width="65" height="72" loading="lazy">` : '<img src="/tiger.svg" alt="" width="65" height="72">';
let data = null; let busy = false;
const CLAN_STORAGE = 'tigers-last-clan';
let selectedClan = DEFAULT_CLAN;
try { selectedClan = preferredClan(localStorage.getItem(CLAN_STORAGE)); } catch { /* Funciona mesmo sem armazenamento local. */ }
let activeRequest = 0; let activeController = null;
const viewCache = new Map();
function setClanIdentity(clan = findClan(selectedClan)) {
  $('clan-select').value = selectedClan;
  $('observed-clan-name').textContent = clan?.name || selectedClan;
  $('observed-clan-tag').textContent = selectedClan;
  document.title = `${clan?.name || selectedClan} · Família TIGERS`;
  document.querySelectorAll('[data-clan-link]').forEach(a => a.href = `https://link.clashofclans.com/pt?action=OpenClanProfile&tag=${encodeURIComponent(selectedClan.slice(1))}`);
  $('clan-monitoring-note').textContent = selectedClan === DEFAULT_CLAN ? 'Monitoramento automático. Os avisos deste clã já estão configurados.' : 'Consulta no painel. Os avisos deste clã serão configurados depois; o histórico individual registra guerras consultadas.';
}
function clearClanData() {
  data = null;
  for (const id of ['metric-wins','metric-members','metric-trophies','metric-league','metric-level','metric-streak']) $(id).textContent = '—';
  $('clan-meta').replaceChildren();$('clan-description').textContent = '';$('clan-requirements').replaceChildren();$('donation-total').textContent = '';
  renderWar(null);$('war-state').textContent = 'CARREGANDO';$('war-summary').innerHTML = empty('Consultando a guerra deste clã…');
  renderMembers();$('member-count').textContent = '— GUERREIROS';renderRankings();renderHistory();renderCapital({});
  renderEvents([],'events');renderEvents([],'recent');$('donors').innerHTML = empty('Consultando doações deste clã…');
  for (const channel of ['telegram','discord']) {$(`${channel}-state`).textContent='CARREGANDO';$(`${channel}-state`).classList.remove('good');$(`${channel}-info`).textContent='Consultando a configuração deste clã…';}
  $('status').textContent = `CARREGANDO ${findClan(selectedClan)?.name || selectedClan} · Os dados são separados por clã.`;
  $('setup').hidden = true;
}
function switchClan(tag, persist = true) {
  const selected = findClan(tag);if(!selected) return;
  activeController?.abort();activeRequest++;busy = false;selectedClan = selected.tag;
  if(persist) {try {localStorage.setItem(CLAN_STORAGE, selectedClan);} catch { /* A troca continua funcionando. */ }}
  clearClanData();setClanIdentity();
  if(viewCache.has(selectedClan)) render(viewCache.get(selectedClan));
  refresh();
}
$('clan-select').replaceChildren(...CLANS.map(clan => {const option=document.createElement('option');option.value=clan.tag;option.textContent=`${clan.name} · ${clan.tag}`;return option;}));
$('clan-select').addEventListener('change',event=>switchClan(event.target.value));
addEventListener('storage',event=>{if(event.key===CLAN_STORAGE || event.key===null){let tag=DEFAULT_CLAN;try{tag=preferredClan(localStorage.getItem(CLAN_STORAGE));}catch{}if(tag!==selectedClan)switchClan(tag,false);}});
function tab(name, scroll = false) {
  const panel = $(name); if (!panel?.classList.contains('tab-panel')) return;
  document.querySelectorAll('.tab-panel').forEach(p => p.hidden = p.id !== name);
  document.querySelectorAll('.nav').forEach(b => {const selected = b.dataset.tab === name;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
  if (scroll) document.querySelector('.command-bar').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
}
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click',() => tab(b.dataset.tab)));
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click',() => {tab(b.dataset.open,true);if(b.dataset.scroll) $(b.dataset.scroll)?.scrollIntoView({block:'start',behavior:'smooth'});}));

function renderLinks(links) {
  const safe = publicLinks({DISCORD_PUBLIC_URL:links?.discord,TELEGRAM_PUBLIC_URL:links?.telegram});
  for (const channel of ['telegram','discord']) document.querySelectorAll(`[data-link="${channel}"]`).forEach(a => {a.hidden = !safe[channel];if(safe[channel]) a.href = safe[channel];});
  $('discord-link-note').hidden = Boolean(safe.discord);
}
function renderEvents(events,id) {
  $(id).classList.remove('empty');
  $(id).innerHTML = events.length ? events.map(e => `<div class="event"><span class="event-icon" aria-hidden="true">${icons[e.type] || '·'}</span><div><p>${esc(e.message)}</p><time>${date(e.created_at)} · Cuiabá</time></div></div>`).join('') : empty('Nenhum evento registrado neste período.');
}
function renderMembers() {
  const members = data?.current?.clan?.memberList || [];
  const search = $('search').value.trim().toLocaleLowerCase('pt-BR');const sort = $('sort').value;
  const visible = members.filter(m => `${m.name} ${m.tag}`.toLocaleLowerCase('pt-BR').includes(search));
  visible.sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name,'pt-BR') : (b[sort] || 0)-(a[sort] || 0));
  const baseline = new Map((data?.baseline?.clan?.memberList || []).map(m => [m.tag,m]));
  $('member-count').textContent = `${members.length} GUERREIROS`;
  $('member-rows').innerHTML = visible.length ? visible.map(m => {
    const old = baseline.get(m.tag);const diff = old ? (m.donations || 0)-(old.donations || 0) : null;
    const delta = diff === null ? '—' : diff < 0 ? 'Reiniciado' : `+${num(diff)}`;
    return `<tr><td class="player-name"><a href="${esc(playerLink(m.tag))}" target="_blank" rel="noopener noreferrer">${esc(m.name)} ↗</a><small>${esc(m.tag)}</small></td><td data-label="Cargo">${esc(roles[m.role] || m.role)}</td><td data-label="CV">${num(m.townHallLevel)}</td><td data-label="Troféus">${num(m.trophies)}</td><td data-label="Doadas">${num(m.donations)}</td><td data-label="Recebidas">${num(m.donationsReceived)}</td><td data-label="Variação 24h">${delta}</td></tr>`;
  }).join('') : '<tr><td colspan="7">Nenhum guerreiro encontrado.</td></tr>';
}
$('search').addEventListener('input',renderMembers);$('sort').addEventListener('change',renderMembers);

function rankingRows(players) {
  if (!players.length) return empty('Ainda não há ataques individuais registrados para este período. O ranking cresce com as guerras acompanhadas pelo monitor.');
  return `<table class="responsive-table rank-table"><thead><tr><th>Posição</th><th>Guerreiro</th><th>Estrelas</th><th>Ataques</th><th>Triplos</th><th>Média ★</th><th>Destruição média</th><th>Guerras</th></tr></thead><tbody>${players.map((p,i) => `<tr class="${i<3?'rank-top':''}"><td class="rank-number" data-label="Posição">${String(i+1).padStart(2,'0')}</td><td class="player-name"><a href="${esc(playerLink(p.tag))}" target="_blank" rel="noopener noreferrer">${esc(p.name)} ↗</a><small>${esc(p.tag)} · CV ${num(p.townHall)}</small></td><td data-label="Estrelas">${num(p.stars)} ★</td><td data-label="Ataques usados">${p.attacks}/${p.expected}</td><td data-label="Triplos">${num(p.triples)}</td><td data-label="Média ★">${num(p.averageStars,2)}</td><td data-label="Destruição média">${num(p.averageDamage,1)}%</td><td data-label="Guerras">${p.wars}</td></tr>`).join('')}</tbody></table>`;
}
function renderRankings() {
  const historical = $('ranking-scope').value === 'history';
  const wars = historical ? data?.wars || [] : [data?.current?.war];
  const players = performance(wars,{completedOnly:historical});
  $('ranking-table').innerHTML = rankingRows(players);
  $('ranking-note').textContent = historical ? 'Somente guerras encerradas com detalhes individuais salvos pelo monitor. Participação: ataques realizados / disponíveis.' : 'Ataques da guerra atual. O ranking pode mudar até o encerramento.';
  const top = performance([data?.current?.war]).filter(p => p.attacks > 0).slice(0,3);
  $('top-warriors').innerHTML = top.length ? top.map((p,i) => `<article class="warrior-card"><span class="warrior-rank" aria-hidden="true">0${i+1}</span><span class="warrior-label">${['PONTA DE LANÇA','FORÇA DE ATAQUE','PODER DE FOGO'][i]}</span><h3>${esc(p.name)}</h3><small>CV ${num(p.townHall)} · ${p.attacks}/${p.expected} ataques utilizados</small><div class="warrior-stats"><div><strong>${p.stars} ★</strong><span>ESTRELAS</span></div><div><strong>${p.triples}</strong><span>TRIPLOS</span></div><div><strong>${num(p.averageDamage,0)}%</strong><span>DESTRUIÇÃO MÉDIA</span></div></div></article>`).join('') : '<div class="panel">'+empty('A elite aparece após os primeiros ataques registrados nesta guerra.')+'</div>';
}
$('ranking-scope').addEventListener('change',renderRankings);
function updateClock() {
  const node = $('war-clock');if(!node) return;
  const war = data?.current?.war;const end = parseGameTime(war?.state === 'preparation' ? war.startTime : war?.endTime);
  const seconds = Math.max(0,Math.floor(((end || Date.now())-Date.now())/1000));
  if (war?.state === 'warEnded' || seconds === 0) {node.textContent = war?.state === 'warEnded' ? 'CONFRONTO ENCERRADO' : 'AGUARDANDO ATUALIZAÇÃO';return;}
  node.textContent = `${war.state === 'preparation'?'INÍCIO EM':'TERMINA EM'} ${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
function renderWar(war) {
  $('war-summary').classList.remove('empty');$('pending').replaceChildren();
  $('war-state').classList.toggle('live',war?.state === 'inWar');
  if (!war) {$('war-state').textContent = 'AGUARDANDO GUERRA';$('war-summary').innerHTML = empty('A tropa está se preparando. A próxima guerra aparecerá aqui quando estiver disponível.');return;}
  $('war-state').textContent = `${war.kind === 'cwl'?'LIGA · ':''}${states[war.state] || war.state}`;
  const max = Math.max(1,war.teamSize*3);const limit = war.attacksPerMember ?? (war.kind === 'cwl'?1:2);
  const players = performance([war]);const used = (war.clan.members || []).reduce((n,m) => n+(m.attacks?.length || 0),0);
  const expected = (war.clan.members?.length || war.teamSize)*limit;
  const pending = (war.clan.members || []).map(m => ({...m,remaining:Math.max(0,limit-(m.attacks?.length || 0))})).filter(m => m.remaining > 0).sort((a,b) => a.mapPosition-b.mapPosition);
  const triples = players.reduce((n,p) => n+p.triples,0);
  $('war-summary').innerHTML = `<div class="battle-meta"><span><strong>${war.teamSize} × ${war.teamSize}</strong> · ${war.kind === 'cwl'?'LIGA DE GUERRA':'GUERRA DE CLÃS'} · ${war.state === 'preparation'?'INÍCIO':'TÉRMINO'} ${date(parseGameTime(war.state === 'preparation'?war.startTime:war.endTime))}</span><span id="war-clock" class="battle-clock"></span></div><div class="war-score"><div class="war-team">${badge(war.clan.badgeUrls?.medium)}<div><div class="war-team-name">${esc(war.clan.name)}</div><div class="war-team-score">${num(war.clan.stars)}<span aria-label="estrelas"> ★</span></div><div class="war-team-meta">DE ${max} ESTRELAS POSSÍVEIS</div></div></div><span class="versus">VS</span><div class="war-team enemy">${badge(war.opponent.badgeUrls?.medium)}<div><div class="war-team-name">${esc(war.opponent.name)}</div><div class="war-team-score">${num(war.opponent.stars)} ★</div><div class="war-team-meta">DE ${max} ESTRELAS POSSÍVEIS</div></div></div></div><div class="war-progress"><label><span>DESTRUIÇÃO DOS TIGERS <b>${num(war.clan.destructionPercentage,2)}%</b></span><progress max="100" value="${Number(war.clan.destructionPercentage || 0)}" aria-label="Destruição causada pelos Tigers"></progress></label><label class="enemy"><span>DESTRUIÇÃO ADVERSÁRIA <b>${num(war.opponent.destructionPercentage,2)}%</b></span><progress max="100" value="${Number(war.opponent.destructionPercentage || 0)}" aria-label="Destruição causada pelo adversário"></progress></label></div><div class="war-mission"><div><strong>${used}/${expected}</strong><span>ATAQUES REALIZADOS</span></div><div><strong>${Math.max(0,expected-used)}</strong><span>ATAQUES DISPONÍVEIS</span></div><div><strong>${triples}</strong><span>ATAQUES DE TRÊS ESTRELAS</span></div></div>`;
  if (war.state === 'inWar') $('pending').innerHTML = `<div class="pending-head"><strong>⚔ A TROPA AINDA TEM PODER DE FOGO</strong><span>${pending.length} jogadores com ataques disponíveis</span></div><div class="pending-list">${pending.map(m => `<div class="pending-item"><span>#${m.mapPosition} · ${esc(m.name)}</span><b>${m.remaining} ataque${m.remaining===1?'':'s'}</b></div>`).join('') || empty('Missão cumprida. Todos os ataques foram utilizados.')}</div>`;
  const members = [...(war.clan.members || [])].sort((a,b) => a.mapPosition-b.mapPosition);
  $('pending').insertAdjacentHTML('beforeend',`<details class="details-heading"><summary>Ver os ${members.length} guerreiros escalados e seus ataques</summary><div class="war-participants">${members.map(m => `<details><summary>#${m.mapPosition} · ${esc(m.name)} · CV ${num(m.townhallLevel ?? m.townHallLevel)} · ${m.attacks?.length || 0}/${limit} ataques</summary>${(m.attacks || []).map(a => {const opponent = war.opponent.members?.find(o => o.tag === a.defenderTag);return `<div class="member-hit"><span class="hit-stars">${'★'.repeat(a.stars || 0)}${'☆'.repeat(Math.max(0,3-(a.stars || 0)))}</span> · ${num(a.destructionPercentage)}% · alvo #${num(opponent?.mapPosition)} ${esc(opponent?.name || a.defenderTag)} · ${num(a.duration)}s</div>`;}).join('') || '<p class="footnote">Nenhum ataque registrado.</p>'}${m.bestOpponentAttack?`<p class="footnote">Melhor ataque recebido: ${num(m.bestOpponentAttack.stars)} ★ · ${num(m.bestOpponentAttack.destructionPercentage)}%.</p>`:''}</details>`).join('')}</div></details>`);
  updateClock();
}

function historyRow(war, detailed = false) {
  const label = outcome(war);const type = label === 'Vitória'?'good':label === 'Derrota'?'bad':'neutral';
  const body = `<div class="history-row"><div class="history-opponent">${badge(war.opponent.badgeUrls?.small)}<div><strong>${esc(war.opponent.name)}</strong><small>${war.teamSize} × ${war.teamSize} · ${date(parseGameTime(war.endTime))}</small><small>${war.kind === 'cwl'?'LIGA':'GUERRA'} · ${war.source === 'api'?'REGISTRO DA API':'ACOMPANHADA PELO MONITOR'}</small></div></div><div class="history-score"><span class="tag ${type}">${esc(label)}</span><strong>${num(war.clan.stars)} × ${num(war.opponent.stars)}</strong><small>${num(war.clan.destructionPercentage,1)}% × ${num(war.opponent.destructionPercentage,1)}%</small></div></div>`;
  if (!detailed || !war.clan.members?.length) return body;
  return `<div>${body}<details class="history-detail"><summary>Desempenho individual deste confronto</summary><div class="table-wrap">${rankingRows(performance([war]))}</div></details></div>`;
}
function renderHistory() {
  const history = mergedHistory(data?.wars,data?.extras?.warLog?.items);
  const filter = $('war-filter').value;const visible = history.filter(w => filter === 'all' || outcome(w) === filter);
  $('war-history').innerHTML = visible.length ? visible.map(w => historyRow(w,true)).join('') : empty('Nenhum confronto disponível para este filtro. O histórico cresce com as guerras acompanhadas.');
  $('history-preview').classList.remove('empty');$('history-preview').innerHTML = history.length ? history.slice(0,3).map(w => historyRow(w)).join('') : empty('Os próximos confrontos ficarão registrados aqui.');
  const finished = history.filter(w => w.state === 'warEnded');const wins = finished.filter(w => outcome(w) === 'Vitória').length;const losses = finished.filter(w => outcome(w) === 'Derrota').length;
  $('history-metrics').innerHTML = metric('Confrontos registrados',num(history.length))+metric('Vitórias neste recorte',num(wins))+metric('Derrotas neste recorte',num(losses))+metric('Taxa de vitória',finished.length?`${num(100*wins/finished.length,1)}%`:'—');
  const log = data?.extras?.warLog;
  $('history-note').textContent = log?.items?.length ? `Resultados da API e confrontos acompanhados, sem duplicações. Histórico da API atualizado em ${date(log.updatedAt)}.` : log?.error ? 'O registro antigo está indisponível na API. Os confrontos acompanhados pelo monitor continuam disponíveis.' : 'Resultados acompanhados pelo monitor. O registro antigo será incluído quando disponível.';
}
$('war-filter').addEventListener('change',renderHistory);
function metric(label,value,text = false) {return `<article><span>${esc(label)}</span><strong${text?' class="metric-text"':''}>${esc(value)}</strong></article>`;}
function renderCapital(clan) {
  const cap = clan.clanCapital;
  $('capital-summary').innerHTML = metric('Capital nível',num(cap?.capitalHallLevel))+metric('Troféus da Capital',num(clan.clanCapitalPoints))+metric('Liga da Capital',clan.capitalLeague?.name || '—',true)+metric('Distritos',cap?.districts?num(cap.districts.length):'—');
  $('districts').classList.remove('empty');$('districts').innerHTML = cap?.districts?.length ? cap.districts.map(d => `<div class="district"><span>${esc(districtNames[d.name] || d.name)}</span><strong>NÍVEL ${num(d.districtHallLevel)}</strong></div>`).join('') : empty('Dados de distritos ainda não disponíveis.');
  const raids = data?.extras?.raids;const r = raids?.items?.[0];$('raid-summary').classList.remove('empty');
  $('raid-summary').innerHTML = r ? `<p class="footnote">${date(parseGameTime(r.startTime))} → ${date(parseGameTime(r.endTime))}</p><div class="raid-metrics"><div><strong>${num(r.capitalTotalLoot)}</strong><span>OURO SAQUEADO</span></div><div><strong>${num(r.totalAttacks)}</strong><span>ATAQUES</span></div><div><strong>${num(r.raidsCompleted)}</strong><span>CAPITAIS CONCLUÍDAS</span></div><div><strong>${num(r.enemyDistrictsDestroyed)}</strong><span>DISTRITOS DESTRUÍDOS</span></div></div><p class="footnote">Atualizado em ${date(raids.updatedAt)}${raids.error?' · Exibindo o último registro disponível.':''}</p>` : empty(raids?.error?'O histórico de ataques da Capital está indisponível na API. Níveis, distritos e liga acima continuam atualizados.':'Nenhum fim de semana de ataques disponível nesta coleta.');
}
function render(payload) {
  data = payload;const current = data.current;const clan = current?.clan;const health = data.health || {};
  $('setup').hidden = Boolean(clan);renderLinks(data.links);if(clan)setClanIdentity(clan);
  const stale = current && Date.now()-current.capturedAt > 15*60000;
  const warStale = current?.war && (!current.warCapturedAt || Date.now()-current.warCapturedAt > 15*60000);
  const ok = health.code === 'ok' && !stale;
  $('status').classList.toggle('warn',!ok || Boolean(warStale));
  $('status').textContent = clan ? `${ok?'MONITOR CONECTADO':'COLETA COM PENDÊNCIAS'} · ${date(current.capturedAt)} · horário de Cuiabá · ${data.monitoringMode === 'on_demand'?'consulta no painel, cache de até 5 min':'consultas a cada 5 min'}${stale?' · dados desatualizados':''}${warStale?' · guerra aguardando atualização':''}` : 'Aguardando conexão com o monitor do clã.';
  if (clan) {
    $('metric-wins').textContent = num(clan.warWins);$('metric-members').textContent = `${clan.members}/50`;
    $('metric-trophies').textContent = num(clan.clanPoints);$('metric-level').textContent = `CLÃ NÍVEL ${clan.clanLevel}`;
    const leagueNames = {'Champion League II':'CAMPEÃO II','Champion League I':'CAMPEÃO I','Champion League III':'CAMPEÃO III'};
    $('metric-league').textContent = leagueNames[clan.warLeague?.name] || clan.warLeague?.name || '—';
    const total = (clan.warWins || 0)+(clan.warLosses || 0)+(clan.warTies || 0);
    $('metric-streak').textContent = `Sequência: ${num(clan.warWinStreak)} · ${total?num(100*clan.warWins/total,1)+'% de vitórias':'registro do clã'}`;
    $('clan-meta').innerHTML = `<span>CLÃ NÍVEL ${num(clan.clanLevel)}</span><span>${esc(clan.location?.countryCode === 'BR'?'BRASIL':clan.location?.name || 'GLOBAL')}</span><span>${clan.warFrequency === 'always'?'GUERRA SEMPRE':'EM COMBATE'}</span>`;
    $('clan-description').textContent = clan.description || 'Respeito, educação e compromisso com a tropa.';
    $('clan-requirements').innerHTML = `<span>CV ${num(clan.requiredTownhallLevel)}+</span><span>${num(clan.requiredTrophies)}+ TROFÉUS</span><span>${clan.type === 'inviteOnly'?'ENTRADA POR CONVITE':clan.type === 'open'?'CLÃ ABERTO':'CLÃ FECHADO'}</span><span>${esc(clan.requiredLeagueTier?.name || 'LIGA DO CLÃ')}</span>`;
    renderWar(current.war);if(!current.war && health.code !== 'ok'){$('war-state').textContent='GUERRA INDISPONÍVEL';$('war-summary').innerHTML=empty('A API não disponibilizou os dados da guerra deste clã.');}renderMembers();renderCapital(clan);
    const top = [...clan.memberList].sort((a,b) => (b.donations || 0)-(a.donations || 0)).slice(0,5);const max = Math.max(1,...top.map(m => m.donations || 0));
    $('donors').classList.remove('empty');$('donors').innerHTML = top.map((m,i) => `<div class="donor"><span>0${i+1}</span><div><strong>${esc(m.name)}</strong><progress value="${Number(m.donations || 0)}" max="${max}" aria-label="${esc(m.name)}: ${num(m.donations)} doações"></progress></div><b>${num(m.donations)}</b></div>`).join('');
    $('donation-total').textContent = `${num(clan.memberList.reduce((n,m) => n+(m.donations || 0),0))} tropas doadas pelos membros atuais nesta temporada.`;
  }
  renderRankings();renderHistory();renderEvents(data.events || [],'events');renderEvents((data.events || []).slice(0,4),'recent');
  for (const channel of ['telegram','discord']) {
    const enabled = data.channels?.[channel];const delivery = data.delivery?.find(d => d.channel === channel);
    $(`${channel}-state`).textContent = enabled?'AVISOS ATIVOS':'AGUARDANDO CONEXÃO';
    $(`${channel}-state`).classList.toggle('good',Boolean(enabled));
    $(`${channel}-info`).textContent = enabled ? `${delivery?.last_sent?'Último envio confirmado: '+date(delivery.last_sent):'Canal configurado, aguardando o primeiro envio.'}${delivery?.retrying?' Há mensagens aguardando nova tentativa.':''}` : data.monitoringMode === 'on_demand' ? 'Os avisos deste clã serão configurados em uma próxima etapa.' : 'Este canal ainda não está conectado ao monitor.';
  }
}
async function refresh() {
  if (busy) return;busy = true;$('refresh').disabled = true;
  const requestId = ++activeRequest;const tag = selectedClan;
  activeController = new AbortController();
  const controller = activeController;const timer=setTimeout(()=>controller.abort(),25000);
  const openMembers = [...document.querySelectorAll('#pending details[open]')].map(d => d.querySelector('summary')?.textContent);
  try {
    const base = window.CLAN_CONFIG?.apiBase || '';
    const response = await fetch(`${base}/api/dashboard?clan=${encodeURIComponent(tag)}`,{signal:controller.signal});
    if (!(response.headers.get('Content-Type') || '').includes('application/json')) throw new Error('configuration');
    const payload = await response.json();if(!response.ok && !payload.health) throw new Error('network');
    if(requestId!==activeRequest || tag!==selectedClan) return;
    if(payload.clanTag!==tag || (payload.current?.clan && payload.current.clan.tag!==tag)) throw new Error('wrong_clan');
    viewCache.set(tag,payload);render(payload);
    document.querySelectorAll('#pending details').forEach(d => {if(openMembers.includes(d.querySelector('summary')?.textContent)) d.open = true;});
  } catch {
    if(requestId!==activeRequest || tag!==selectedClan) return;
    $('status').classList.add('warn');$('status').textContent = data?.current ? `CONSULTA TEMPORARIAMENTE INDISPONÍVEL · ${findClan(tag)?.name} · Últimos dados de ${date(data.current.capturedAt)}.` : `Não foi possível consultar ${findClan(tag)?.name || tag}. Tente atualizar ou selecione outro clã.`;
    if (!data?.current) $('setup').hidden = false;
  } finally {clearTimeout(timer);if(requestId===activeRequest){busy = false;$('refresh').disabled = false;}}
}
$('refresh').addEventListener('click',refresh);switchClan(selectedClan,false);
setInterval(() => {if(!document.hidden) refresh();},60000);setInterval(() => {if(!document.hidden) updateClock();},1000);
