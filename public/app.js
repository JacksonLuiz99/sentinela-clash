const $ = id => document.getElementById(id);
const number = value => Number(value || 0).toLocaleString('pt-BR');
const date = value => value ? new Date(value).toLocaleString('pt-BR',{timeZone:'America/Cuiaba',dateStyle:'short',timeStyle:'short'}) : '—';
const time = value => value ? Date.parse(value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,'$1-$2-$3T$4:$5:$6')) : null;
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles={leader:'Líder',coLeader:'Colíder',admin:'Ancião',member:'Membro'};
const states={preparation:'PREPARAÇÃO',inWar:'EM GUERRA',warEnded:'ENCERRADA'};
const icons={member_join:'+',member_leave:'−',war_start:'⚔',war_end:'⚑',war_reminder:'◷'};
let data=null;
function tab(name) {
  const names={overview:'Visão geral',members:'Membros',wars:'Guerras',alerts:'Alertas e atividade'};
  if (!names[name]) return;
  document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!==name);
  document.querySelectorAll('.nav').forEach(b=>{const selected=b.dataset.tab===name;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',selected);});
  $('page-name').textContent=names[name];
}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.open)));

function renderEvents(events,id) {
  $(id).classList.toggle('empty',!events.length);
  $(id).innerHTML=events.length ? events.map(e=>`<div class="event"><span class="event-icon">${icons[e.type] || '·'}</span><div><p>${escape(e.message)}</p><time>${date(e.created_at)} · Cuiabá</time></div></div>`).join('') : 'Nenhum evento registrado. A primeira coleta cria uma referência sem anunciar entradas antigas.';
}

function renderMembers() {
  const members=data?.current?.clan?.memberList || [];
  const search=$('search').value.toLocaleLowerCase('pt-BR');const sort=$('sort').value;
  const visible=members.filter(m=>`${m.name} ${m.tag}`.toLocaleLowerCase('pt-BR').includes(search));
  visible.sort((a,b)=>sort==='name' ? a.name.localeCompare(b.name,'pt-BR') : (b[sort] || 0)-(a[sort] || 0));
  const baseline=new Map((data?.baseline?.clan?.memberList || []).map(m=>[m.tag,m]));
  $('member-count').textContent=`${members.length} MEMBROS`;
  $('member-rows').innerHTML=visible.length ? visible.map(m=>{
    const old=baseline.get(m.tag); const diff=old ? (m.donations || 0)-(old.donations || 0) : null;
    const delta=diff===null ? '—' : diff<0 ? 'Contador reiniciado' : `+${number(diff)}`;
    return `<tr><td>${escape(m.name)}<small>${escape(m.tag)}</small></td><td>${escape(roles[m.role] || m.role)}</td><td>${number(m.townHallLevel)}</td><td>${number(m.trophies)}</td><td>${number(m.donations)}</td><td>${number(m.donationsReceived)}</td><td>${delta}</td></tr>`;
  }).join('') : '<tr><td colspan="7" class="empty">Nenhum jogador encontrado.</td></tr>';
}
$('search').addEventListener('input',renderMembers);$('sort').addEventListener('change',renderMembers);

function result(war) {
  if(war.state!=='warEnded') return states[war.state] || war.state;
  const diff=(war.clan.stars-war.opponent.stars)||(war.clan.destructionPercentage-war.opponent.destructionPercentage);
  return diff>0 ? 'Vitória' : diff<0 ? 'Derrota' : 'Empate';
}

function renderWar(war) {
  $('war-summary').classList.remove('empty');$('pending').replaceChildren();
  if (!war) { $('war-state').textContent='SEM GUERRA';$('war-summary').textContent='Nenhuma guerra disponível na última consulta.';return; }
  $('war-state').textContent=(war.kind==='cwl'?'LIGA · ':'')+(states[war.state] || war.state);
  const end=time(war.state==='preparation' ? war.startTime : war.endTime);
  const label=war.state==='preparation'?'Início':war.state==='warEnded'?'Encerrada':'Término';
  $('war-summary').innerHTML=`<div class="war-score"><div><span>${escape(war.clan.name)}</span><strong>${number(war.clan.stars)} ★</strong><span>${number(war.clan.destructionPercentage)}% de destruição</span></div><span class="vs">VS</span><div><span>${escape(war.opponent.name)}</span><strong>${number(war.opponent.stars)} ★</strong><span>${number(war.opponent.destructionPercentage)}% de destruição</span></div></div><p class="war-caption">${war.teamSize} × ${war.teamSize} · ${label}: ${date(end)} · Cuiabá</p>`;
  const limit=war.attacksPerMember ?? (war.kind==='cwl'?1:2);
  const pending=(war.clan.members || []).map(m=>({...m,remaining:Math.max(0,limit-(m.attacks?.length || 0))})).filter(m=>m.remaining>0).sort((a,b)=>a.mapPosition-b.mapPosition);
  if(war.state==='inWar') $('pending').innerHTML=`<div class="pending-head"><strong>Ataques pendentes</strong><span>${pending.reduce((n,m)=>n+m.remaining,0)} ataques · ${pending.length} jogadores</span></div><div class="pending-list">${pending.map(m=>`<div class="pending-item"><span>${number(m.mapPosition)}. ${escape(m.name)}</span><span>${m.remaining} restante${m.remaining===1?'':'s'}</span></div>`).join('') || '<p class="muted">Todos os ataques foram realizados.</p>'}</div>`;
}

function render(payload) {
  data=payload;const current=data.current;const clan=current?.clan;const health=data.health || {};
  $('setup').hidden=Boolean(clan);
  const messages={missing_clash_token:'Falta conectar a chave da API do Clash.',missing_database:'O banco D1 ainda não foi configurado.',database_not_ready:'O banco precisa receber as migrações.',awaiting_first_sync:'API configurada. Aguardando a primeira coleta.',api_http_403:'A API recusou o acesso. Confira a chave, o IP autorizado e a visibilidade da guerra.',api_http_404:'Dados não encontrados na API. Confira o clã.',api_http_429:'A API limitou as consultas. Nova tentativa na próxima coleta.',api_network:'A API está temporariamente inacessível.',cwl_partial:'Algumas partidas da Liga não puderam ser consultadas.'};
  const stale=current && Date.now()-current.capturedAt>15*60000;
  const warStale=current?.war && (!current.warCapturedAt || Date.now()-current.warCapturedAt>15*60000);
  const ok=health.code==='ok' && !stale;
  $('status').classList.toggle('warn',!ok || Boolean(warStale));
  $('status').textContent=clan ? `${ok?'Monitor conectado':messages[health.code] || 'Coleta com pendências'} · Última coleta: ${date(current.capturedAt)}${stale?' · Dados desatualizados':''}${warStale?' · Dados de guerra desatualizados':''}` : messages[health.code] || 'Conclua a configuração para iniciar as consultas.';
  if (clan) {
    $('clan-name').textContent=clan.name;$('side-name').textContent=clan.name;
    $('subtitle').textContent=`${clan.tag} · Clã nível ${clan.clanLevel} · ${clan.warLeague?.name || 'Liga não informada'}`;
    $('metric-members').textContent=`${clan.members}/50`;$('metric-trophies').textContent=number(clan.clanPoints);
    $('metric-donations').textContent=number(clan.memberList.reduce((n,m)=>n+(m.donations || 0),0));
    $('metric-wins').textContent=number(clan.warWins);$('metric-streak').textContent=`Sequência: ${number(clan.warWinStreak)} vitórias`;
    renderWar(current.war);renderMembers();
    const top=[...clan.memberList].sort((a,b)=>(b.donations || 0)-(a.donations || 0)).slice(0,5);
    const max=Math.max(1,...top.map(m=>m.donations || 0));$('donors').classList.remove('empty');
    $('donors').innerHTML=top.map((m,i)=>`<div class="donor"><span>0${i+1}</span><div><strong>${escape(m.name)}</strong><progress value="${Number(m.donations || 0)}" max="${max}" aria-label="${escape(m.name)}: ${number(m.donations)} doações"></progress></div><b>${number(m.donations)}</b></div>`).join('');
  }
  renderEvents(data.events || [],'events');renderEvents((data.events || []).slice(0,4),'recent');
  const wars=data.wars || []; $('war-history').classList.toggle('empty',!wars.length);
  $('war-history').innerHTML=wars.length ? wars.map(w=>`<div class="history-row"><div><strong>${escape(w.opponent.name)}</strong><small>${w.kind==='cwl'?'Liga de Guerra':'Guerra comum'} · ${date(time(w.endTime))}</small></div><div class="history-score"><strong>${escape(result(w))} · ${number(w.clan.stars)} × ${number(w.opponent.stars)}</strong><small>${number(w.clan.destructionPercentage)}% × ${number(w.opponent.destructionPercentage)}%</small></div></div>`).join('') : 'O histórico começa com a primeira guerra observada.';
  for(const channel of ['telegram','discord']) {
    const enabled=data.channels?.[channel];const delivery=data.delivery?.find(d=>d.channel===channel);
    $(`${channel}-state`).textContent=enabled?'CONFIGURADO':'NÃO CONFIGURADO';
    $(`${channel}-info`).textContent=enabled ? `${delivery?.last_sent?'Último envio: '+date(delivery.last_sent):'Nenhum envio confirmado ainda.'}${delivery?.retrying?' Há envios aguardando nova tentativa.':''}` : `Configure ${channel==='telegram'?'o bot e o chat':'o webhook do canal'} nos segredos do monitor.`;
  }
}

async function refresh() {
  $('refresh').disabled=true;
  try {
    const base=window.CLAN_CONFIG?.apiBase || '';
    const response=await fetch(`${base}/api/dashboard`,{signal:AbortSignal.timeout(12000)});
    const type=response.headers.get('Content-Type') || '';
    if(!type.includes('application/json')) throw new Error('configuration');
    const payload=await response.json();
    if(!response.ok && !payload.health) throw new Error('network');
    render(payload);
  } catch {
    $('status').classList.add('warn');$('status').textContent=data?.current ? `Monitor indisponível. Exibindo a coleta de ${date(data.current.capturedAt)}; tente atualizar em instantes.` : 'Monitor ainda não conectado. Configure PUBLIC_API_BASE na Vercel com a URL do Worker.';
    if(!data?.current) $('setup').hidden=false;
  } finally { $('refresh').disabled=false; }
}
$('refresh').addEventListener('click',refresh);
refresh();
setInterval(()=>{if(!document.hidden) refresh();},60000);
