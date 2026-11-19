import { buildPushPayload } from '@block65/webcrypto-web-push';
import { readState } from './monitor.js';
import { DEFAULT_CLAN, findClan } from '../public/clans.js';
import { pendingMessage } from '../public/whatsapp.js';
import { warId } from './events.js';
const base='https://tigers-family-tow.vercel.app';
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('');
export class PushInputError extends Error {}
const invalid=message=>{throw new PushInputError(message);};
const validId=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
export const pushReady=env=>Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY);
export function validateSubscription(input) {
  if(!input||typeof input!=='object'||typeof input.endpoint!=='string')invalid('Inscrição de notificações inválida.');
  let url;try{url=new URL(input.endpoint);}catch{invalid('Endereço de notificações inválido.');}
  const allowed=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(url.hostname)||/^wns[a-z0-9-]*\.notify\.windows\.com$/.test(url.hostname);
  if(!allowed||url.protocol!=='https:'||url.port||url.username||url.password||url.hash||input.endpoint.length>2048||url.pathname==='/')invalid('Serviço de notificações não suportado.');
  const key=input.keys?.p256dh;const auth=input.keys?.auth;
  const decode=(value,length)=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]+={0,2}$/.test(value))invalid('Chaves da inscrição inválidas.');let raw;try{raw=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}catch{invalid('Chaves da inscrição inválidas.');}if(raw.length!==length)invalid('Chaves da inscrição inválidas.');return raw;};
  if(decode(key,65)[0]!==4)invalid('Chave de notificações inválida.');decode(auth,16);
  if(input.expirationTime!=null&&(!Number.isFinite(input.expirationTime)||input.expirationTime<=Date.now()))invalid('Inscrição expirada. Ative novamente no aparelho.');
  return {endpoint:url.href,expirationTime:input.expirationTime ?? null,keys:{p256dh:key,auth}};
}
function deviceCredentials(request,url,input) {
  const id=input?.deviceId || url.searchParams.get('deviceId');const token=(request.headers.get('Authorization') || '').replace(/^Bearer /,'');
  if(!validId(id)||!/^[A-Za-z0-9_-]{40,100}$/.test(token))invalid('Ative os alertas neste aparelho antes de continuar.');return {id,token};
}
async function device(env,id,token){const row=await env.DB.prepare('SELECT * FROM push_devices WHERE id=?').bind(id).first();return row && row.token_hash===await digest(token)?row:null;}
async function readBody(request){if(!(request.headers.get('Content-Type') || '').startsWith('application/json'))invalid('Formulário inválido.');const reader=request.body?.getReader();if(!reader)invalid('Formulário obrigatório.');const chunks=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();invalid('Inscrição muito grande.');}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{invalid('Formulário inválido.');}}
export async function pushRoute(request,env,url) {
  if(url.pathname==='/api/push/config'&&request.method==='GET')return {configured:pushReady(env),publicKey:env.VAPID_PUBLIC_KEY || null,windows:[6,1]};
  if(!pushReady(env))return {error:'As notificações estão sendo configuradas. Tente novamente em instantes.',status:503};
  if(url.pathname==='/api/push/status'&&request.method==='GET'){
    const {id,token}=deviceCredentials(request,url);const row=await device(env,id,token);if(!row)return {error:'Aparelho não inscrito.',status:404};
    return {subscribed:true,clans:JSON.parse(row.clans),lastAccepted:row.last_accepted_at,lastError:row.last_error,updatedAt:row.updated_at};
  }
  if(request.method!=='POST')return {error:'Método não permitido.',status:405};
  const input=await readBody(request);const {id,token}=deviceCredentials(request,url,input);const current=await device(env,id,token);const now=Date.now();
  if(url.pathname==='/api/push/subscribe'){
    if(!Array.isArray(input.clans)||input.clans.length<1||input.clans.length>16||new Set(input.clans).size!==input.clans.length||input.clans.some(t=>!findClan(t)||findClan(t).tag!==t))invalid('Escolha de um a 16 clãs da família.');
    const subscription=validateSubscription(input.subscription);const endpointHash=await digest(subscription.endpoint);const tokenHash=await digest(token);
    const matches=await env.DB.prepare('SELECT id FROM push_devices WHERE id=? OR endpoint_hash=?').bind(id,endpointHash).all();const existing=matches.results[0];
    if(matches.results.some(row=>row.id!==id)||(existing&&!current))return {error:'Esta inscrição já existe. Desative os alertas neste navegador e tente novamente.',status:409};
    if(!existing){
      const ip=request.headers.get('CF-Connecting-IP') || 'local';const bucket=await digest(env.VAPID_PRIVATE_KEY+':'+ip+':'+new Date(now).toISOString().slice(0,10));
      await env.DB.prepare('INSERT INTO push_rate_limits(bucket,count,created_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1').bind(bucket,now).run();
      const rate=await env.DB.prepare('SELECT count FROM push_rate_limits WHERE bucket=?').bind(bucket).first();if(rate.count>20)return {error:'Muitas ativações nesta conexão hoje. Tente novamente amanhã.',status:429};
      const result=await env.DB.prepare('INSERT OR IGNORE INTO push_devices(id,token_hash,endpoint_hash,subscription,clans,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM push_devices)<1000').bind(id,tokenHash,endpointHash,JSON.stringify(subscription),JSON.stringify(input.clans),now,now).run();
      if(!result.meta.changes)return {error:'Não foi possível cadastrar o aparelho agora. Tente novamente mais tarde.',status:409};
    }else{
      await env.DB.prepare('UPDATE push_devices SET endpoint_hash=?,subscription=?,clans=?,updated_at=?,last_error=NULL WHERE id=? AND token_hash=?').bind(endpointHash,JSON.stringify(subscription),JSON.stringify(input.clans),now,id,tokenHash).run();
    }
    return {subscribed:true,clans:input.clans};
  }
  if(!current)return {error:'Aparelho não inscrito.',status:404};
  if(url.pathname==='/api/push/unsubscribe'){await env.DB.batch([env.DB.prepare('DELETE FROM push_jobs WHERE device_id=?').bind(id),env.DB.prepare('DELETE FROM push_devices WHERE id=?').bind(id)]);return {subscribed:false};}
  if(url.pathname==='/api/push/test'){
    const permit=await env.DB.prepare('INSERT INTO push_rate_limits(bucket,count,created_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1,created_at=excluded.created_at WHERE push_rate_limits.created_at<?').bind('test:'+id,now,now-60000).run();
    if(!permit.meta.changes)return {error:'Aguarde um minuto antes de testar novamente.',status:429};
    const result=await sendWebPush(env,JSON.parse(current.subscription),{title:'TIGERS FAMILY · Alertas ativados',body:'Este aparelho está pronto para receber lembretes de ataques pendentes.',tag:'tigers-push-test',url:'/?view=alerts'},300);
    if(result.status===404||result.status===410){await env.DB.batch([env.DB.prepare('DELETE FROM push_jobs WHERE device_id=?').bind(id),env.DB.prepare('DELETE FROM push_devices WHERE id=?').bind(id)]);return {error:'A inscrição venceu. Ative os alertas novamente.',status:410};}
    await env.DB.prepare('UPDATE push_devices SET last_accepted_at=?,last_error=? WHERE id=?').bind(result.ok?now:current.last_accepted_at,result.ok?null:'push_http_'+result.status,id).run();
    return result.ok?{accepted:true}:{error:'O serviço de notificações não aceitou o teste. Tente novamente.',status:503};
  }
  return {error:'Rota não encontrada.',status:404};
}
export function reminderPayload(payload,hours,now=Date.now()) {
  const result=pendingMessage(payload,{now});const key=warId(payload.current.war);const end=result.endAt;const left=end-now;
  if(![6,1].includes(hours)||left>hours*3600000||left<=(hours*60-20)*60000)return null;
  const clan=findClan(result.clanTag);const collected=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Cuiaba',hour:'2-digit',minute:'2-digit'}).format(result.capturedAt);
  return {key,end,pending:result.attacks,data:{title:`${clan.label} · Ataques pendentes`,body:`Na coleta das ${collected} (Cuiabá): ${result.attacks} ataques de ${result.players} guerreiros. Faltam cerca de ${hours}h. Toque para revisar e preparar a cobrança.`,tag:`tigers:${clan.tag}:${payload.current.war.endTime}:${hours}`,url:`/?clan=${encodeURIComponent(clan.tag)}&view=overview&reminder=1`,clanTag:clan.tag,createdAt:now,endAt:end}};
}
export async function enqueuePush(env,payload,now=Date.now()) {
  if(!pushReady(env))return;
  for(const hours of [6,1]){
    let reminder;try{reminder=reminderPayload(payload,hours,now);}catch{continue;}if(!reminder)continue;
    const subscribers=await env.DB.prepare('SELECT id,clans FROM push_devices').all();
    const jobs=subscribers.results.filter(s=>JSON.parse(s.clans).includes(payload.clanTag)).map(s=>env.DB.prepare('INSERT OR IGNORE INTO push_jobs(id,device_id,clan_tag,war_key,window_hours,created_at,expires_at,next_try) VALUES (?,?,?,?,?,?,?,?)').bind(`${s.id}:${payload.clanTag}:${reminder.key}:${hours}`,s.id,payload.clanTag,reminder.key,hours,now,Math.min(reminder.end,now+20*60000),now));
    if(jobs.length)await env.DB.batch(jobs);
  }
}
export async function sendWebPush(env,subscription,message,ttl=600){
  const request=await buildPushPayload({data:JSON.stringify(message),options:{ttl,urgency:'high'}},subscription,{subject:base,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY});
  const response=await fetch(subscription.endpoint,{...request,redirect:'manual',signal:AbortSignal.timeout(10000)});return {ok:response.ok,status:response.status};
}
async function cachedDashboard(env,tag){
  if(tag===(env.CLAN_TAG || DEFAULT_CLAN)){const [current,health]=await Promise.all([readState(env.DB,'current'),readState(env.DB,'health')]);return {clanTag:tag,current,health};}
  const saved=await readState(env.DB,'family:'+tag);return {clanTag:tag,current:saved?.current,health:saved?.health};
}
export async function deliverPush(env,now=Date.now()) {
  if(!pushReady(env))return;
  const lease=await env.DB.prepare("UPDATE leases SET until_ms=? WHERE id='web-push' AND until_ms<?").bind(now+90000,now).run();if(!lease.meta.changes)return;
  try{
    await env.DB.batch([env.DB.prepare("UPDATE push_jobs SET status='expired' WHERE status='pending' AND expires_at<=?").bind(now),env.DB.prepare('DELETE FROM push_jobs WHERE created_at<?').bind(now-7*86400000),env.DB.prepare('DELETE FROM push_rate_limits WHERE created_at<?').bind(now-2*86400000)]);
    const jobs=await env.DB.prepare("SELECT j.*,d.subscription,d.clans FROM push_jobs j JOIN push_devices d ON d.id=j.device_id WHERE j.status='pending' AND j.next_try<=? ORDER BY j.expires_at,j.created_at LIMIT 3").bind(now).all();
    const cache=new Map();const removed=new Set();
    for(const job of jobs.results){
      if(removed.has(job.device_id))continue;
      if(!JSON.parse(job.clans).includes(job.clan_tag)){await env.DB.prepare("UPDATE push_jobs SET status='skipped' WHERE id=?").bind(job.id).run();continue;}
      if(!cache.has(job.clan_tag))cache.set(job.clan_tag,await cachedDashboard(env,job.clan_tag));const payload=cache.get(job.clan_tag);let reminder;
      try{reminder=reminderPayload(payload,job.window_hours,now);}catch{}
      if(!reminder||reminder.key!==job.war_key){await env.DB.prepare("UPDATE push_jobs SET status='skipped' WHERE id=?").bind(job.id).run();continue;}
      try{
        const result=await sendWebPush(env,JSON.parse(job.subscription),reminder.data,Math.max(1,Math.min(600,Math.floor((job.expires_at-now)/1000))));
        if(result.status===404||result.status===410){removed.add(job.device_id);await env.DB.batch([env.DB.prepare('DELETE FROM push_jobs WHERE device_id=?').bind(job.device_id),env.DB.prepare('DELETE FROM push_devices WHERE id=?').bind(job.device_id)]);continue;}
        if(!result.ok)throw new Error('push_http_'+result.status);
        await env.DB.batch([env.DB.prepare("UPDATE push_jobs SET status='accepted',accepted_at=?,attempts=attempts+1,error=NULL WHERE id=?").bind(now,job.id),env.DB.prepare('UPDATE push_devices SET last_accepted_at=?,last_error=NULL WHERE id=?').bind(now,job.device_id)]);
      }catch(error){const code=/^push_http_\d+$/.test(error.message)?error.message:'push_network';await env.DB.batch([env.DB.prepare("UPDATE push_jobs SET attempts=attempts+1,next_try=?,error=?,status=CASE WHEN attempts>=2 THEN 'failed' ELSE 'pending' END WHERE id=?").bind(now+Math.min(5*60000,60000*2**job.attempts),code,job.id),env.DB.prepare('UPDATE push_devices SET last_error=? WHERE id=?').bind(code,job.device_id)]);}
    }
  }finally{await env.DB.prepare("UPDATE leases SET until_ms=0 WHERE id='web-push'").run();}
}
export async function collectPrimaryPush(env,now=Date.now()){await enqueuePush(env,await cachedDashboard(env,env.CLAN_TAG || DEFAULT_CLAN),now);}
