export const NAVIGATION = Object.freeze([
  {id:'family',label:'Família',sections:[{id:'family',label:'Visão dos 16 clãs'},{id:'operations',label:'Recrutamento e organização'},{id:'versions',label:'Novidades e versões'}]},
  {id:'clan',label:'Clã',defaultSection:'overview',sections:[{id:'player',label:'Meu início'},{id:'overview',label:'Campo de batalha'},{id:'wars',label:'Histórico'},{id:'rankings',label:'Elite de guerra'},{id:'members',label:'Nossa tropa'},{id:'capital',label:'Capital'},{id:'intelligence',label:'Inteligência'}]},
  {id:'leadership',label:'Liderança',sections:[{id:'leadership',label:'Metas e guerras manuais'},{id:'alerts',label:'Canais e avisos'}]}
]);
// Quem já salvou a tag do jogo começa em "Meu início"; os demais começam no campo de batalha.
export function homeSection(){
  try{return localStorage.getItem('tigers-player-tag')?'player':'overview';}catch{return 'overview';}
}
export const navigationGroup=section=>NAVIGATION.find(g=>g.sections.some(s=>s.id===section)) || null;
export function initNavigation() {
  const $=id=>document.getElementById(id);let selectedLabel='';let activeGroup='clan';const remembered=new Map(NAVIGATION.map(g=>[g.id,g.defaultSection||g.sections[0].id]));
  function show(section,scroll=false) {
    const group=navigationGroup(section);const panel=$(section);if(!group || !panel)return;
    activeGroup=group.id;remembered.set(group.id,section);dispatchEvent(new CustomEvent('tow:section',{detail:section}));
    document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!==section);
    const sectionButtonActive=Boolean(document.querySelector(`#mobile-bottom-nav [data-nav-section="${section}"]`));
    document.querySelectorAll('[data-nav-group]').forEach(b=>{const active=b.dataset.navGroup===group.id && !(sectionButtonActive && b.closest('#mobile-bottom-nav'));b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-nav-section]').forEach(b=>{const active=b.dataset.navSection===section;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('.section-navigation [data-tab]').forEach(b=>{const active=b.dataset.tab===section;b.hidden=navigationGroup(b.dataset.tab)?.id!==group.id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    const options=group.sections.map(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.label;return o;});
    $('section-select').replaceChildren(...options);$('section-select').value=section;
    $('section-nav').setAttribute('aria-label',`Seções de ${group.label}`);$('section-label').textContent=`Seção de ${group.label}${group.id==='family'||!selectedLabel?'':' · '+selectedLabel}`;
    if(scroll)document.querySelector('.command-bar').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }
  document.querySelectorAll('[data-nav-group]').forEach(b=>b.addEventListener('click',()=>{
    const section=remembered.get(b.dataset.navGroup);show(section);
    if(b.closest('#mobile-bottom-nav,#mobile-more'))requestAnimationFrame(()=>$(section)?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
  }));
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.tab)));
  const moreToggle=$('mobile-more-toggle'),moreMenu=$('mobile-more');
  if(moreToggle&&moreMenu){
    const setMore=open=>{moreMenu.hidden=!open;moreToggle.setAttribute('aria-expanded',String(open));};
    moreToggle.addEventListener('click',()=>setMore(moreMenu.hidden));
    moreMenu.addEventListener('click',e=>{if(e.target.closest('[data-nav-group]'))setMore(false);});
  }
  document.querySelectorAll('[data-nav-section]').forEach(b=>b.addEventListener('click',()=>{show(b.dataset.navSection);if(b.closest('#mobile-bottom-nav'))requestAnimationFrame(()=>$(b.dataset.navSection)?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));}));
  $('section-select').addEventListener('change',e=>show(e.target.value));
  document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>{show(b.dataset.open,true);if(b.dataset.scroll)$(b.dataset.scroll)?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}));
  // Ancoragens internas podem abrir uma seção que foi movida para outra área.
  document.addEventListener('click',e=>{const link=e.target.closest('a[href^="#"]');if(!link)return;const target=document.getElementById(link.getAttribute('href').slice(1));const section=target?.closest('.tab-panel');if(section?.hidden)show(section.id);});
  const bottomMenu=$('mobile-bottom-nav');
  if(bottomMenu && typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(()=>{const height=bottomMenu.getBoundingClientRect().height;if(height>0)document.documentElement.style.setProperty('--mobile-menu-height',`${Math.ceil(height)}px`);else document.documentElement.style.removeProperty('--mobile-menu-height');});observer.observe(bottomMenu);}
  show(homeSection());return {show,setClan(label){selectedLabel=label;$('navigation-clan').textContent=`Clã selecionado: ${label}`;const group=NAVIGATION.find(g=>g.id===activeGroup);$('section-label').textContent=`Seção de ${group.label}${activeGroup==='family'?'':' · '+label}`;}};
}
