import { clash, readState, stateStatement, loadWar, loadExtras } from './monitor.js';
import { detectEvents, warId, gameTime } from './events.js';
import { findClan, CLANS } from '../public/clans.js';
import { publicLinks } from '../public/stats.js';

const CACHE_MS = 300000;
function responseFor(env, tag, saved, now = Date.now()) {
  return {
    configured:Boolean(env.CLASH_API_TOKEN), clanTag:tag, clans:CLANS, monitoringMode:'on_demand',
    current:saved?.current || null, health:saved?.health || {code:'awaiting_first_sync'},
    wars:saved?.wars || [], events:saved?.events || [], extras:saved?.extras || null,
    baseline:saved?.snapshots?.filter(s => s.capturedAt <= now-86400000).sort((a,b)=>b.capturedAt-a.capturedAt)[0] || null,
    channels:{telegram:false,discord:false},delivery:[],links:publicLinks(env)
  };
}

// Os novos clãs têm cache próprio. Não alteram tabelas, cron ou fila de avisos do clã original.
export async function familyDashboard(env, tag, now = Date.now()) {
  if (!findClan(tag)) throw new Error('unknown_clan');
  const key = `family:${tag}`; const leaseKey = `family:${tag}`;
  let saved = await readState(env.DB,key);
  if (saved?.attemptedAt && now-saved.attemptedAt < CACHE_MS) return responseFor(env,tag,saved,now);
  if (!env.CLASH_API_TOKEN) return {...responseFor(env,tag,saved,now),health:{code:'missing_clash_token'}};
  await env.DB.prepare('INSERT OR IGNORE INTO leases(id,until_ms) VALUES (?,0)').bind(leaseKey).run();
  const lease = await env.DB.prepare('UPDATE leases SET until_ms=? WHERE id=? AND until_ms < ?').bind(now+180000,leaseKey,now).run();
  if (!lease.meta.changes) return responseFor(env,tag,saved,now);
  try {
    // Outra requisição pode ter concluído a coleta entre a leitura inicial e a trava.
    saved = await readState(env.DB,key);
    if (saved?.attemptedAt && now-saved.attemptedAt < CACHE_MS) return responseFor(env,tag,saved,now);
    const scoped = {...env,CLAN_TAG:tag};
    const [clanResult,warResult,extraResult] = await Promise.allSettled([
      clash(scoped,`/clans/${encodeURIComponent(tag)}`),loadWar(scoped,now),loadExtras(scoped,now,saved?.extras)
    ]);
    if (clanResult.status === 'rejected') throw clanResult.reason;
    const clan = clanResult.value;
    if (clan.tag !== tag || !Array.isArray(clan.memberList)) throw new Error('invalid_clan_response');
    const previous = saved?.current;
    const warning = warResult.status === 'fulfilled' ? warResult.value.warning : warResult.reason.message;
    const war = warResult.status === 'fulfilled' ? warResult.value.war : previous?.war || null;
    const current = {clan,war,capturedAt:now,warCapturedAt:warning ? previous?.warCapturedAt || null : now};
    const events = new Map((saved?.events || []).map(e=>[e.id,e]));
    for (const event of detectEvents(previous,warning?{...current,war:null}:current,now)) {
      events.set(event.id,{id:event.id,type:event.type,message:event.message,created_at:event.createdAt});
    }
    const wars = new Map((saved?.wars || []).map(w=>[warId(w),w]));
    if (!warning) for (const observed of warResult.value.observedWars || (war?[war]:[])) wars.set(warId(observed),observed);
    const snapshots = (saved?.snapshots || []).filter(s=>s.capturedAt >= now-26*3600000);
    if (!snapshots.some(s=>Math.floor(s.capturedAt/3600000)===Math.floor(now/3600000))) snapshots.push({clan,capturedAt:now});
    saved = {
      attemptedAt:now,current,health:{lastAttempt:now,lastSuccess:now,code:warning || 'ok'},
      events:[...events.values()].sort((a,b)=>b.created_at-a.created_at).slice(0,30),
      wars:[...wars.values()].sort((a,b)=>(gameTime(b.endTime)||0)-(gameTime(a.endTime)||0)).slice(0,20),
      extras:extraResult.status === 'fulfilled' ? extraResult.value : saved?.extras || null,
      snapshots:snapshots.slice(-26)
    };
    await stateStatement(env.DB,key,saved).run();
    return responseFor(env,tag,saved,now);
  } catch (error) {
    const code = /^(api_[a-z0-9_]+|invalid_clan_response)$/.test(error.message) ? error.message : 'sync_failed';
    saved = {...saved,attemptedAt:now,health:{...saved?.health,lastAttempt:now,code}};
    await stateStatement(env.DB,key,saved).run();
    return responseFor(env,tag,saved,now);
  } finally {
    await env.DB.prepare('UPDATE leases SET until_ms=0 WHERE id=?').bind(leaseKey).run();
  }
}
