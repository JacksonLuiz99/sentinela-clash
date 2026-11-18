import { readState, synchronize } from './monitor.js';
import { publicLinks } from '../public/stats.js';

const json = (data,status=200,headers={}) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});

async function authorized(request, token) {
  if (!token || token.length < 32) return false;
  const provided = request.headers.get('Authorization') || '';
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  const [a,b]=await Promise.all([digest(provided),digest(`Bearer ${token}`)]);
  return a.reduce((n,v,i)=>n|(v^b[i]),0) === 0;
}

export async function route(request,env) {
  const path=new URL(request.url).pathname;
  if (!path.startsWith('/api/')) {
    const response=await env.ASSETS.fetch(request);
    const headers=new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://*.workers.dev; img-src 'self' https://api-assets.clashofclans.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    return new Response(response.body,{status:response.status,headers});
  }
  const origin=request.headers.get('Origin');
  const headers={Vary:'Origin'};
  if (origin && origin === env.PUBLIC_ORIGIN) headers['Access-Control-Allow-Origin']=origin;
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'}});
  if (path === '/api/sync' && request.method === 'POST') {
    if (!await authorized(request,env.ADMIN_TOKEN)) return json({error:'unauthorized'},401,headers);
    const result=await synchronize(env);
    return json(result,result.ok?200:result.code==='sync_busy'?409:503,headers);
  }
  if (path !== '/api/dashboard') return json({error:'not_found'},404,headers);
  if (request.method !== 'GET') return json({error:'method_not_allowed'},405,headers);
  if (!env.DB) return json({configured:false,clanTag:env.CLAN_TAG || '#R0UPVVVY',health:{code:'missing_database'}},503,headers);
  try {
    const [current,health,events,wars,snapshot,delivery,extras]=await Promise.all([
      readState(env.DB,'current'),readState(env.DB,'health'),
      env.DB.prepare('SELECT id,type,message,created_at FROM events ORDER BY created_at DESC LIMIT 30').all(),
      env.DB.prepare('SELECT payload FROM wars ORDER BY end_at DESC LIMIT 20').all(),
      env.DB.prepare('SELECT payload,created_at FROM snapshots WHERE created_at <= ? ORDER BY created_at DESC LIMIT 1').bind(Date.now()-86400000).first(),
      env.DB.prepare('SELECT channel, MAX(sent_at) AS last_sent, SUM(CASE WHEN sent_at IS NULL AND next_try>0 THEN 1 ELSE 0 END) AS retrying FROM deliveries GROUP BY channel').all(),
      readState(env.DB,'extras')
    ]);
    const configured=Boolean(env.CLASH_API_TOKEN);
    const payload={configured,clanTag:env.CLAN_TAG,current,health:health || {code:configured?'awaiting_first_sync':'missing_clash_token'},
      events:events.results,wars:wars.results.map(w=>JSON.parse(w.payload)),
      baseline:snapshot ? {clan:JSON.parse(snapshot.payload),capturedAt:snapshot.created_at} : null,
      channels:{telegram:Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),discord:Boolean(env.DISCORD_WEBHOOK_URL)},
      delivery:delivery.results, extras, links:publicLinks(env)};
    // Um único documento público pode ser cacheado no painel; não há rotas públicas de escrita.
    return json(payload,200,headers);
  } catch {
    return json({configured:false,clanTag:env.CLAN_TAG,health:{code:'database_not_ready'}},503,headers);
  }
}

export default {
  fetch: route,
  scheduled(_controller,env,ctx) {ctx.waitUntil(synchronize(env));}
};
