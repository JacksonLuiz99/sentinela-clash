import { DEFAULT_CLAN, findClan } from './clans.js';

const minutes=60000;const hours=3600000;
const fresh=(at,now,window)=>Number.isFinite(at)&&at>0&&at<=now+minutes&&now-at<=window;
export function attentionItems(clans=[],now=Date.now()) {
  const priorities=[];const coverage=[];let attacks=0;let warClans=0;let deadlines=0;let collection=0;
  for(const clan of clans){
    if(!findClan(clan.tag))continue;
    const base={clanTag:clan.tag,clanLabel:clan.label || findClan(clan.tag).label};
    const limit=(clan.tag===DEFAULT_CLAN?10:30)*minutes;const recent=fresh(clan.capturedAt,now,limit);
    const profileFailed=clan.lastAttempt>clan.capturedAt && clan.health && clan.health!=='ok';
    if(!recent || profileFailed){
      collection++;priorities.push({...base,id:clan.tag+':collection',kind:'collection',priority:4,at:clan.capturedAt,
        title:!clan.capturedAt?'Primeira coleta pendente':!recent?'Dados do clã desatualizados':'Falha na última coleta do clã',
        detail:!clan.capturedAt?'Aguardando dados para avaliar este clã.':'Consulte a última coleta antes de tomar decisões sobre este clã.',section:'overview'});
    }
    const war=clan.war;const warRecent=fresh(clan.warCapturedAt,now,limit);
    if(clan.health==='api_http_403'&&!profileFailed){coverage.push({...base,id:clan.tag+':restricted',title:'Guerra com acesso restrito',detail:'A API não permite confirmar placar, escalação ou ataques pendentes.',section:'overview'});}
    else if(recent && (clan.health && clan.health!=='ok' || !warRecent || (war?.state==='inWar'&&(!Number.isFinite(war.endAt)||war.endAt<=now)))){
      coverage.push({...base,id:clan.tag+':war',title:clan.health==='cwl_partial'?'Dados parciais da Liga':'Guerra aguardando atualização',detail:'Nenhum ataque é contado como pendente neste resumo até a guerra ser confirmada por uma coleta recente.',section:'overview'});
    }
    else if(recent && !profileFailed && clan.health==='ok' && warRecent && war?.state==='inWar' && Number.isFinite(war.endAt) && war.endAt>now && Number.isInteger(war.pending) && war.pending>0){
      attacks+=war.pending;warClans++;
      priorities.push({...base,id:clan.tag+':attacks',kind:'attacks',priority:war.endAt-now<=hours?0:war.endAt-now<=6*hours?1:2,at:clan.warCapturedAt,until:war.endAt,count:war.pending,
        title:`${war.pending} ataque${war.pending===1?'':'s'} pendente${war.pending===1?'':'s'}`,detail:`Contra ${war.opponent || 'adversário'}`,section:'overview',anchor:'battle'});
    }
    const goal=clan.goals;const start=Date.parse(goal?.startDate+'T00:00:00Z');const end=Date.parse(goal?.endDate+'T23:59:59.999Z');
    if(goal && (goal.donationTarget>0||goal.raidTarget>0) && Number.isFinite(start) && Number.isFinite(end) && start<=now && end>=now && end-now<=48*hours){
      deadlines++;priorities.push({...base,id:clan.tag+':goals',kind:'goals',priority:3,until:end,title:'Metas perto do fim da vigência',detail:'Revise o progresso antes do prazo. Este lembrete não afirma que a meta está incompleta.',section:'leadership',anchor:'clan-goals'});
    }
  }
  priorities.sort((a,b)=>a.priority-b.priority || (a.until || Infinity)-(b.until || Infinity) || a.clanLabel.localeCompare(b.clanLabel,'pt-BR'));
  return {priorities,coverage,attacks,warClans,deadlines,collection};
}
export function initAttention({escape:esc,date,openClanSection,showFamily}) {
  const $=id=>document.getElementById(id);let family=[];let receivedAt=null;let failed=false;let overrides=new Map();
  function render(){
    if(!receivedAt)return;
    const clans=family.map(c=>overrides.has(c.tag)?{...c,goals:overrides.get(c.tag)}:c);const result=attentionItems(clans);
    $('attention-attacks').textContent=String(result.attacks);$('attention-war-count').textContent=`em ${result.warClans} guerra${result.warClans===1?'':'s'} com coleta recente`;
    $('attention-goals').textContent=String(result.deadlines);$('attention-collection').textContent=String(result.collection);
    $('attention-status').textContent=`${failed?'Resumo preservado: a última consulta da família falhou. ':''}Família consultada em ${date(receivedAt)} (Cuiabá). Ataques: coletas de até 10 min no TOW 4 e 30 min nos demais. Guerras fora do prazo aguardam atualização.`;
    $('attention-count').textContent=String(result.priorities.length);$('attention-coverage-count').textContent=String(result.coverage.length);
    const filter=$('attention-filter').value;const rows=result.priorities.filter(r=>filter==='all'||r.kind===filter);
    const focused=document.activeElement?.closest('[data-attention-id]')?.dataset.attentionId;
    const row=r=>`<li class="attention-item"><div><span class="attention-clan">${esc(r.clanLabel)}</span><h3>${esc(r.title)}</h3><p>${r.kind==='attacks'?`Contra ${esc(clans.find(c=>c.tag===r.clanTag)?.war?.opponent || 'adversário')} · término ${date(r.until)} (Cuiabá).`:esc(r.detail)}${r.kind==='goals'?` Prazo: ${date(r.until)} (Cuiabá).`:''}</p>${r.at?`<small>Coleta: ${date(r.at)} · Cuiabá</small>`:''}</div><button class="outline-button" data-attention-id="${esc(r.id)}" data-attention-clan="${esc(r.clanTag)}" data-attention-section="${r.section}" ${r.anchor?`data-attention-anchor="${r.anchor}"`:''}>${r.kind==='goals'?'Revisar metas':r.kind==='attacks'?'Ver guerra':'Consultar clã'}</button></li>`;
    $('attention-list').innerHTML=rows.length?rows.map(row).join(''):'<li class="attention-empty">Nenhuma prioridade confirmada neste filtro. Confira também as limitações de consulta abaixo.</li>';
    $('attention-coverage-list').innerHTML=result.coverage.length?result.coverage.map(row).join(''):'<li class="attention-empty">Nenhuma limitação adicional de guerra identificada nas coletas recentes.</li>';
    if(focused)document.querySelector(`[data-attention-id="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
  }
  $('attention-filter').addEventListener('change',render);
  $('attention').addEventListener('click',e=>{const b=e.target.closest('[data-attention-clan]');if(b)openClanSection(b.dataset.attentionClan,b.dataset.attentionSection,b.dataset.attentionAnchor);});
  $('attention-family').addEventListener('click',showFamily);
  document.querySelectorAll('[data-attention-filter]').forEach(b=>b.addEventListener('click',()=>{$('attention-filter').value=b.dataset.attentionFilter;$('attention-priorities').open=true;render();$('attention-filter').focus({preventScroll:true});}));
  addEventListener('tow:family',e=>{family=e.detail.clans;receivedAt=e.detail.generatedAt || Date.now();failed=false;overrides=new Map();render();});
  addEventListener('tow:family-error',()=>{failed=true;if(receivedAt)render();else $('attention-status').textContent='Não foi possível consultar as prioridades da família. Atualize a visão da família para tentar novamente.';});
  addEventListener('tow:goals',e=>{overrides.set(e.detail.clanTag,e.detail.goals);render();});
  setInterval(()=>{if(!document.hidden)render();},30000);
  return {render};
}
