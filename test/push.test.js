import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {route} from '../worker/index.js';
import {stateStatement} from '../worker/monitor.js';
import {enqueuePush,deliverPush,validateSubscription,reminderPayload,sendWebPush} from '../worker/push.js';
import {notificationLink} from '../public/pwa.js';
const originalFetch=globalThis.fetch;afterEach(()=>globalThis.fetch=originalFetch);
const now=Date.now();const tag='#R0UPVVVY';const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const token='a'.repeat(64);
function database(){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const file of ['0001_init.sql','0002_management.sql','0003_push.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));const statement=(q,args=[])=>({bind(...a){return statement(q,a);},async first(){return sql.prepare(q).get(...args)||null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}};}});return {prepare:q=>statement(q),async batch(list){sql.exec('BEGIN');try{const result=[];for(const s of list)result.push(await s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}},close:()=>sql.close()};}
const b64=bytes=>Buffer.from(bytes).toString('base64url');
async function keys(){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);return {VAPID_PUBLIC_KEY:b64(await crypto.subtle.exportKey('raw',pair.publicKey)),VAPID_PRIVATE_KEY:jwk.d};}
async function subscription(){const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return {pair,subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/test-device',expirationTime:null,keys:{p256dh:b64(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:b64(crypto.getRandomValues(new Uint8Array(16)))}}};}
function snapshot(hours=6){return {clanTag:tag,health:{code:'ok'},current:{capturedAt:now,warCapturedAt:now,clan:{tag,name:'TIGERS OF WAR 4'},war:{state:'inWar',kind:'regular',teamSize:1,startTime:new Date(now-3600000).toISOString().replace(/[-:]/g,''),endTime:new Date(now+hours*3600000-60000).toISOString().replace(/[-:]/g,''),clan:{tag,name:'TIGERS OF WAR 4',stars:0,members:[{tag:'#98Q9LLG2P',name:'Ana',mapPosition:1,attacks:[]}]},opponent:{tag:'#28L88PQ2',name:'Adversário',stars:0}}}};}
const post=(path,body,secret=token)=>new Request('https://worker.test/api/push/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:JSON.stringify({deviceId:id,...body})});
async function setup(){const DB=database();const env={DB,CLAN_TAG:tag,...await keys()};const sub=await subscription();const r=await route(post('subscribe',{clans:[tag],subscription:sub.subscription}),env);assert.equal(r.status,200);return {DB,env,...sub};}

test('inscrição e status expõem somente preferências do próprio aparelho',async()=>{
 const {DB,env,subscription:sub}=await setup();const response=await route(new Request('https://worker.test/api/push/status?deviceId='+id,{headers:{Authorization:'Bearer '+token}}),env);assert.equal(response.status,200);const body=await response.text();assert.ok(!body.includes(sub.endpoint));assert.ok(!body.includes(env.VAPID_PRIVATE_KEY));assert.ok(!body.includes(token));assert.deepEqual(JSON.parse(body).clans,[tag]);
 const wrong=await route(new Request('https://worker.test/api/push/status?deviceId='+id,{headers:{Authorization:'Bearer '+'b'.repeat(64)}}),env);assert.equal(wrong.status,404);
 assert.equal((await route(post('subscribe',{clans:[tag],subscription:sub},'b'.repeat(64)),env)).status,409);DB.close();
});
test('destinos internos, domínios parecidos e chaves inválidas são rejeitados',async()=>{
 const {subscription:sub}=await subscription();
 for(const endpoint of ['http://fcm.googleapis.com/fcm/send/x','https://127.0.0.1/push','https://fcm.googleapis.com.attacker.test/push','https://fcm.googleapis.com:8443/push','https://user:pass@fcm.googleapis.com/push'])assert.throws(()=>validateSubscription({...sub,endpoint}));
 assert.throws(()=>validateSubscription({...sub,keys:{...sub.keys,auth:'x'}}));assert.equal(validateSubscription(sub).endpoint,sub.endpoint);
});
test('configuração pública nunca entrega a chave privada',async()=>{
 const {DB,env}=await setup();const response=await route(new Request('https://worker.test/api/push/config'),env);const body=await response.text();assert.ok(!body.includes(env.VAPID_PRIVATE_KEY));assert.equal(JSON.parse(body).publicKey,env.VAPID_PUBLIC_KEY);DB.close();
});
test('cada aparelho recebe no máximo um trabalho por guerra e janela, sem alterar os canais existentes',async()=>{
 const {DB,env}=await setup();await enqueuePush(env,snapshot(),now);await enqueuePush(env,snapshot(),now+1000);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM push_jobs').first()).n,1);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM deliveries').first()).n,0);
 await enqueuePush(env,snapshot(1),now);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM push_jobs').first()).n,2);DB.close();
});
test('guerra privada, parcial, desatualizada ou sem ataques não gera aviso',()=>{
 for(const patch of [{health:{code:'api_http_403'}},{health:{code:'cwl_partial'}}])assert.throws(()=>reminderPayload({...snapshot(),...patch},6,now));
 const old=snapshot();old.current.warCapturedAt=now-31*60000;assert.throws(()=>reminderPayload(old,6,now));
 const done=snapshot();done.current.war.clan.members[0].attacks=[{},{}];assert.throws(()=>reminderPayload(done,6,now));
 assert.equal(reminderPayload(snapshot(4),6,now),null);
});
test('fila revalida os ataques antes de enviar e cancela cobrança já resolvida',async()=>{
 const {DB,env}=await setup();const data=snapshot();await enqueuePush(env,data,now);data.current.war.clan.members[0].attacks=[{},{}];await stateStatement(DB,'current',data.current).run();await stateStatement(DB,'health',data.health).run();let sent=0;globalThis.fetch=async()=>{sent++;return new Response('',{status:201});};await deliverPush(env,now);assert.equal(sent,0);assert.equal((await DB.prepare('SELECT status FROM push_jobs').first()).status,'skipped');DB.close();
});
test('envio usa Web Push criptografado, TTL limitado e registra somente aceitação pelo serviço',async()=>{
 const {DB,env,subscription:sub}=await setup();const data=snapshot();await stateStatement(DB,'current',data.current).run();await stateStatement(DB,'health',data.health).run();await enqueuePush(env,data,now);
 let request;globalThis.fetch=async(url,options)=>{request={url,options};return new Response('',{status:201});};await deliverPush(env,now);
 assert.equal(request.url,sub.endpoint);assert.equal(request.options.redirect,'manual');assert.equal(request.options.headers['content-encoding'],'aes128gcm');assert.match(request.options.headers.authorization,/^vapid /);assert.equal(request.options.body.length,4096);assert.ok(!Buffer.from(request.options.body).toString('utf8').includes('TIGERS'));assert.ok(Number(request.options.headers.ttl)<=600);
 assert.equal((await DB.prepare('SELECT status FROM push_jobs').first()).status,'accepted');assert.ok((await DB.prepare('SELECT last_accepted_at FROM push_devices').first()).last_accepted_at);DB.close();
});
test('assinatura expirada é removida e falhas transitórias têm tentativas limitadas',async()=>{
 const {DB,env}=await setup();const data=snapshot();await stateStatement(DB,'current',data.current).run();await stateStatement(DB,'health',data.health).run();await enqueuePush(env,data,now);
 globalThis.fetch=async()=>new Response('',{status:500});await deliverPush(env,now);await deliverPush(env,now+60001);await deliverPush(env,now+180002);assert.equal((await DB.prepare('SELECT status FROM push_jobs').first()).status,'failed');
 await DB.prepare("UPDATE push_jobs SET status='pending',next_try=?").bind(now).run();globalThis.fetch=async()=>new Response('',{status:410});await deliverPush(env,now+180003);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM push_devices').first()).n,0);DB.close();
});
test('desativação exige o segredo do aparelho e remove seus trabalhos',async()=>{
 const {DB,env}=await setup();await enqueuePush(env,snapshot(),now);assert.equal((await route(post('unsubscribe',{},'b'.repeat(64)),env)).status,404);assert.equal((await route(post('unsubscribe',{}),env)).status,200);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM push_jobs').first()).n,0);DB.close();
});
test('links de notificações aceitam somente clãs e telas conhecidos',()=>{
 assert.deepEqual(notificationLink('?clan=%23r0upvvvy&view=overview&reminder=1'),{tag,view:'overview',reminder:true});assert.deepEqual(notificationLink('?clan=javascript:bad&view=https://evil.test&reminder=1'),{tag:null,view:null,reminder:false});
});
test('service worker não guarda consultas de dados e limita destinos de abertura ao próprio painel',async()=>{
 const handlers={};let opened;let shown;const context={URL,Date,caches:{},self:{location:{origin:'https://tigers-family-tow.vercel.app'},addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(title,options)=>{shown={title,...options};}},clients:{matchAll:async()=>[],openWindow:async url=>opened=url}}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 let intercepted=false;handlers.fetch({request:{url:'https://tigers-family-tow.vercel.app/api/dashboard',method:'GET'},respondWith(){intercepted=true;}});assert.equal(intercepted,false);
 const promises=[];handlers.push({data:{json:()=>({title:'Guerra',body:'Pendentes',url:'https://evil.test'})},waitUntil:p=>promises.push(p)});await Promise.all(promises);assert.equal(shown.title,'Guerra');handlers.notificationclick({notification:{close(){},data:{url:'https://evil.test'}},waitUntil:p=>promises.push(p)});await Promise.all(promises);assert.equal(opened,'https://tigers-family-tow.vercel.app/');
});

test('a fila limita o trabalho por minuto e uma trava impede envio concorrente',async()=>{
 const {DB,env,subscription:sub}=await setup();
 for(let i=1;i<6;i++){const deviceId='bbbbbbbb-bbbb-4bbb-8bbb-'+String(i).padStart(12,'0');const request=new Request('https://worker.test/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({deviceId,clans:[tag],subscription:{...sub,endpoint:sub.endpoint+'-'+i}})});assert.equal((await route(request,env)).status,200);}
 const data=snapshot();await stateStatement(DB,'current',data.current).run();await stateStatement(DB,'health',data.health).run();await enqueuePush(env,data,now);
 let sends=0;globalThis.fetch=async()=>{sends++;return new Response('',{status:201});};await deliverPush(env,now);assert.equal(sends,3);
 await DB.prepare("UPDATE leases SET until_ms=? WHERE id='web-push'").bind(now+90000).run();await deliverPush(env,now+60000);assert.equal(sends,3);
 await DB.prepare("UPDATE leases SET until_ms=0 WHERE id='web-push'").run();await deliverPush(env,now+60001);assert.equal(sends,6);DB.close();
});

test('teste de notificação tem intervalo mínimo mesmo se o provedor recusar',async()=>{
 const {DB,env}=await setup();let requests=0;globalThis.fetch=async()=>{requests++;return new Response('',{status:500});};
 assert.equal((await route(post('test',{}),env)).status,503);assert.equal((await route(post('test',{}),env)).status,429);assert.equal(requests,1);DB.close();
});
