const CACHE='tigers-offline-v1';
const OFFLINE=['/offline.html','/offline.css','/offline.js','/icons/pwa-192.png','/icons/pwa-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(OFFLINE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tigers-offline-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request;const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate')event.respondWith(fetch(request).catch(()=>caches.match('/offline.html')));
  else if(OFFLINE.includes(url.pathname))event.respondWith(caches.match(request).then(cached=>cached || fetch(request)));
});
self.addEventListener('push',event=>{
  let payload;try{payload=event.data?.json();}catch{}
  const old=payload?.endAt && Date.now()>=payload.endAt;
  event.waitUntil(self.registration.showNotification(payload?.title || 'TIGERS FAMILY',{body:old?'Este aviso é anterior ao término da guerra. Abra o painel para atualizar os dados.':payload?.body || 'Abra o quartel para consultar a guerra.',icon:'/icons/pwa-192.png',tag:payload?.tag || 'tigers-alert',data:{url:payload?.url || '/?view=alerts'},actions:[{action:'open',title:'Revisar e preparar cobrança'}]}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();let url;try{url=new URL(event.notification.data?.url || '/',self.location.origin);}catch{url=new URL('/',self.location.origin);}
  if(url.origin!==self.location.origin||url.pathname!=='/')url=new URL('/',self.location.origin);
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const existing=clients.find(c=>new URL(c.url).origin===self.location.origin);if(existing){try{await existing.navigate(url.href);return await existing.focus();}catch{/* O navegador pode exigir uma nova janela para este aviso. */}}return self.clients.openWindow(url.href);}));
});
