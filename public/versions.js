import {RELEASES} from './releases.js';
export function initVersions({escape:esc,openSection}) {
  const $=id=>document.getElementById(id);const format=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Cuiaba',dateStyle:'long',timeStyle:'short'});
  const search=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const dayKey=value=>{const parts=new Intl.DateTimeFormat('en',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));const get=name=>parts.find(p=>p.type===name).value;return `${get('year')}-${get('month')}-${get('day')}`;};
  const days=[...new Set(RELEASES.map(r=>dayKey(r.recordedAt)))];
  for(const day of days){const option=document.createElement('option');option.value=day;option.textContent=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Cuiaba',dateStyle:'long'}).format(new Date(day+'T12:00:00Z'));$('versions-day').append(option);}
  $('versions-current').textContent=RELEASES[0].version;
  function render(){
    const query=search($('versions-search').value.trim());const day=$('versions-day').value;
    const rows=RELEASES.filter(r=>(day==='all'||dayKey(r.recordedAt)===day)&&search([r.title,...r.changes,r.version].join(' ')).includes(query));
    $('versions-count').textContent=`${rows.length} ${rows.length===1?'atualização encontrada':'atualizações encontradas'}.`;
    $('versions-list').innerHTML=rows.length?rows.map(r=>`<article class="panel version-card"><div class="version-meta"><span class="tag">${r===RELEASES[0]?'MAIS RECENTE · ':''}VERSÃO ${esc(r.version)}</span><time datetime="${esc(r.recordedAt)}">${esc(format.format(new Date(r.recordedAt)))} · Cuiabá</time></div><h3>${esc(r.title)}</h3><ul>${r.changes.map(c=>`<li>${esc(c)}</li>`).join('')}</ul><button class="outline-button" type="button" data-version-section="${esc(r.section)}">Ver esta área no painel</button></article>`).join(''):'<p class="empty">Nenhuma atualização encontrada. Tente outro termo ou outra data.</p>';
  }
  $('versions-search').addEventListener('input',render);$('versions-day').addEventListener('change',render);
  $('versions-list').addEventListener('click',e=>{const b=e.target.closest('[data-version-section]');if(b)openSection(b.dataset.versionSection);});render();
}
