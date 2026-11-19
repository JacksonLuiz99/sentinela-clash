import {CLANS,findClan} from './clans.js';
const DEVICE='tigers-push-device';
const urlKey=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export function notificationLink(search) {
  const params=new URLSearchParams(search);const tag=findClan(params.get('clan'))?.tag || null;
  const view=['overview','alerts','family','leadership'].includes(params.get('view'))?params.get('view'):null;
  return {tag,view,reminder:params.get('reminder')==='1'&&Boolean(tag)};
}
export function initPwa({apiBase,getSelectedClan,showSettings}) {
  const $=id=>document.getElementById(id);let deferredInstall=null;let registration=null;let configuration=null;let credentials=null;let subscribed=false;let busy=false;
  try{const saved=JSON.parse(localStorage.getItem(DEVICE));if(saved?.id&&saved?.token)credentials=saved;}catch{}
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const supported='serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const note=text=>$('push-message').textContent=text;
  const selected=()=>[...document.querySelectorAll('[name="push-clan"]:checked')].map(i=>i.value);
  const setSelected=tags=>document.querySelectorAll('[name="push-clan"]').forEach(i=>i.checked=tags.includes(i.value));
  const update=()=>{
    $('pwa-install').disabled=standalone();$('pwa-install').textContent=standalone()?'Aplicativo instalado':'Instalar aplicativo';
    $('pwa-install-note').textContent=standalone()?'Você está usando o aplicativo instalado.':ios?'No Safari: Compartilhar → Adicionar à Tela de Início. Depois abra o app pelo ícone para ativar os alertas.':deferredInstall?'Toque em Instalar aplicativo para adicionar o quartel ao seu aparelho.':'Abra o menu do navegador e escolha Instalar aplicativo ou Adicionar à tela inicial, se a opção estiver disponível.';
    const permission=typeof Notification==='undefined'?'unsupported':Notification.permission;
    $('push-state').textContent=permission==='denied'?'PERMISSÃO BLOQUEADA':subscribed?'ALERTAS INSCRITOS':'ALERTAS DESATIVADOS';
    $('push-enable').disabled=busy||!supported||!configuration?.configured||(ios&&!standalone())||permission==='denied';
    $('push-enable').textContent=subscribed?'Salvar clãs deste aparelho':'Ativar alertas neste aparelho';
    $('push-disable').disabled=busy||!subscribed;$('push-test').disabled=busy||!subscribed;
    $('push-support').textContent=!supported?'Este navegador não oferece notificações Web Push. Instale o aplicativo em um navegador compatível.':ios&&!standalone()?'No iPhone ou iPad, instale e abra pela Tela de Início antes de ativar.':permission==='denied'?'As notificações foram bloqueadas. Libere a permissão nas configurações do navegador ou do aparelho e tente novamente.':!configuration?.configured?'O serviço de alertas está sendo configurado.':'Lembretes por volta de 6h e 1h antes do término, somente quando a coleta confirma ataques disponíveis. Não é necessário deixar o painel aberto.';
  };
  async function request(path,body,method='POST'){
    const response=await fetch(apiBase()+path,{method,headers:{...(method==='POST'?{'Content-Type':'application/json'}:{}),...(credentials?{Authorization:'Bearer '+credentials.token}:{})},...(method==='POST'?{body:JSON.stringify({...body,deviceId:credentials?.id})}:{}),signal:AbortSignal.timeout(25000)});
    const data=await response.json();if(!response.ok){const error=new Error(data.error || 'Não foi possível atualizar os alertas.');error.status=response.status;throw error;}return data;
  }
  async function prepare(){
    try{
      const response=await fetch(apiBase()+'/api/push/config',{signal:AbortSignal.timeout(15000)});configuration=await response.json();
      if('serviceWorker' in navigator)registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      if(registration&&credentials){try{const data=await request('/api/push/status?deviceId='+encodeURIComponent(credentials.id),null,'GET');const browser=await registration.pushManager?.getSubscription();subscribed=Boolean(browser);setSelected(data.clans);$('push-last').textContent=data.lastAccepted?'Último aviso aceito pelo serviço: '+new Date(data.lastAccepted).toLocaleString('pt-BR')+'. Isso não confirma que foi visto no aparelho.':'Ainda não há envio aceito para este aparelho.';if(data.lastError)$('push-last').textContent+=' Há uma pendência de entrega. Confira a permissão e tente Enviar teste.';}catch(error){if(error.status!==404)note(error.message);}}
    }catch{note('Não foi possível consultar o serviço de notificações. Atualize o painel e tente novamente.');}finally{update();}
  }
  $('push-clans').replaceChildren(...CLANS.map(c=>{const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.name='push-clan';input.value=c.tag;label.append(input,document.createTextNode(c.label));return label;}));setSelected([getSelectedClan()]);
  addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;update();});addEventListener('appinstalled',()=>{deferredInstall=null;update();});
  $('pwa-install').addEventListener('click',async()=>{if(deferredInstall){const prompt=deferredInstall;deferredInstall=null;await prompt.prompt();await prompt.userChoice;update();}else note(ios?'No Safari, toque em Compartilhar e em Adicionar à Tela de Início.':'No menu do navegador, procure Instalar aplicativo ou Adicionar à tela inicial.');});
  $('open-pwa-settings').addEventListener('click',showSettings);
  $('push-enable').addEventListener('click',async()=>{
    if(busy)return;const clans=selected();if(!clans.length){note('Escolha pelo menos um clã para este aparelho.');return;}
    busy=true;update();note('Ativando notificações…');
    // A solicitação de permissão acontece diretamente no toque, antes de aguardar a rede.
    const permission=Notification.permission==='granted'?Promise.resolve('granted'):Notification.requestPermission();
    try{
      if(await permission!=='granted')throw new Error('A permissão não foi concedida. Você pode ativar nas configurações do aparelho.');
      if(!registration)registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;
      if(!credentials){credentials={id:crypto.randomUUID(),token:Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')};localStorage.setItem(DEVICE,JSON.stringify(credentials));}
      const subscription=await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlKey(configuration.publicKey)});
      await request('/api/push/subscribe',{clans,subscription:subscription.toJSON()});subscribed=true;note('Alertas inscritos para os clãs escolhidos. Use Enviar teste e confira o aviso no aparelho.');
    }catch(error){note(error instanceof DOMException?'O navegador não conseguiu ativar os alertas. Confira a permissão de notificações e se o aplicativo está instalado.':error.message || 'Não foi possível ativar as notificações.');}finally{busy=false;update();}
  });
  $('push-disable').addEventListener('click',async()=>{if(busy)return;busy=true;update();try{await request('/api/push/unsubscribe',{});const subscription=await registration?.pushManager.getSubscription();if(subscription)await subscription.unsubscribe();subscribed=false;localStorage.removeItem(DEVICE);credentials=null;note('Alertas desativados neste aparelho.');}catch(error){note(error.message);}finally{busy=false;update();}});
  $('push-test').addEventListener('click',async()=>{if(busy)return;busy=true;update();try{await request('/api/push/test',{});note('O serviço aceitou o teste. Confira a notificação no aparelho; o sistema operacional pode aplicar suas preferências de entrega.');}catch(error){note(error.message);}finally{busy=false;update();}});
  addEventListener('tow:section',e=>{if(e.detail==='alerts')update();});
  prepare();return {refresh:prepare};
}
