import { readState, stateStatement } from './monitor.js';
import { findClan } from '../public/clans.js';

export const compactRoster=clan=>(clan.memberList || []).map(m=>({tag:m.tag,name:m.name,townHallLevel:m.townHallLevel ?? null,trophies:m.trophies ?? null,donations:m.donations ?? null,donationsReceived:m.donationsReceived ?? null}));
export function rosterChanges(previous,current,tag,now) {
  if(!previous)return [];
  const old=new Map(previous.map(m=>[m.tag,m]));const next=new Map(current.map(m=>[m.tag,m]));const changes=[];
  for(const [kind,from,to] of [['leave',old,next],['join',next,old]])for(const [player,m] of from)if(!to.has(player))changes.push({id:`${tag}:${player}:${kind}:${now}`,clanTag:tag,playerTag:player,name:m.name,kind,detectedAt:now});
  return changes;
}
export async function recordRoster(env,clan,now) {
  const tag=clan.tag;if(!findClan(tag))throw new Error('unknown_clan');
  const key=`roster:${tag}`;const previous=await readState(env.DB,key);
  if(previous?.capturedAt>=now)return;
  const members=compactRoster(clan);const day=new Date(now).toISOString().slice(0,10);
  const moves=rosterChanges(previous?.members,members,tag,now);
  await env.DB.batch([
    stateStatement(env.DB,key,{capturedAt:now,members}),
    env.DB.prepare('INSERT INTO roster_days(clan_tag,day,captured_at,payload) VALUES (?,?,?,?) ON CONFLICT(clan_tag,day) DO UPDATE SET captured_at=excluded.captured_at,payload=excluded.payload WHERE excluded.captured_at>roster_days.captured_at').bind(tag,day,now,JSON.stringify(members)),
    ...moves.map(m=>env.DB.prepare('INSERT OR IGNORE INTO roster_moves(id,clan_tag,player_tag,name,kind,detected_at) VALUES (?,?,?,?,?,?)').bind(m.id,tag,m.playerTag,m.name,m.kind,now)),
    env.DB.prepare('DELETE FROM roster_days WHERE captured_at < ?').bind(now-32*86400000),
    env.DB.prepare('DELETE FROM roster_moves WHERE detected_at < ?').bind(now-90*86400000)
  ]);
}
export async function managementOverview(env) {
  const [rows,moves]=await Promise.all([
    env.DB.prepare("SELECT key,value FROM state WHERE key LIKE 'roster:%'").all(),
    env.DB.prepare('SELECT id,clan_tag AS clanTag,player_tag AS playerTag,name,kind,detected_at AS detectedAt FROM roster_moves ORDER BY detected_at DESC LIMIT 500').all()
  ]);
  return {rosters:rows.results.map(r=>({clanTag:r.key.slice(7),...JSON.parse(r.value)})).filter(r=>findClan(r.clanTag)),moves:moves.results,moveLimit:500};
}
export async function playerEvolution(env,tag,now=Date.now()) {
  if(!/^#[0289PYLQGRJCUV]{3,14}$/.test(tag || ''))throw new ValidationError('Tag do jogador inválida.');
  const rows=await env.DB.prepare(`SELECT r.clan_tag AS clanTag,r.day,r.captured_at AS capturedAt,j.value AS payload
    FROM roster_days r,json_each(r.payload) j WHERE json_extract(j.value,'$.tag')=? AND r.captured_at>=? ORDER BY r.captured_at DESC LIMIT 512`).bind(tag,now-32*86400000).all();
  return {playerTag:tag,days:32,points:rows.results.filter(r=>findClan(r.clanTag)).map(r=>({clanTag:r.clanTag,day:r.day,capturedAt:r.capturedAt,...JSON.parse(r.payload)}))};
}
export class ValidationError extends Error {}
const fail=message=>{throw new ValidationError(message);};
const integer=(v,min,max,label)=>Number.isInteger(v)&&v>=min&&v<=max?v:fail(label);
const decimal=(v,min,max,label)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:fail(label);
const text=(v,max,label)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max&&!/[\u0000-\u001f]/.test(v)?v.trim():fail(label);
const gameTag=(v,label)=>/^#[0289PYLQGRJCUV]{3,14}$/.test(v || '')?v:fail(label);
export function validateManualWar(input,now=Date.now()) {
  if(!input || !findClan(input.clanTag))fail('Clã inválido.');
  if(typeof input.endedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input.endedAt))fail('Informe o término em UTC.');
  const endAt=Date.parse(input.endedAt);if(!Number.isFinite(endAt)||endAt>now || endAt<now-366*86400000)fail('Informe um término nos últimos 366 dias, sem data futura.');
  if(new Date(endAt).toISOString().slice(0,10)!==input.endedAt.slice(0,10))fail('Data de término inválida.');
  const clanTag=findClan(input.clanTag).tag;const teamSize=integer(input.teamSize,1,50,'Tamanho da guerra inválido.');
  const kind=['regular','cwl'].includes(input.kind)?input.kind:fail('Modalidade inválida.');
  const opponentTag=gameTag(input.opponentTag,'Tag adversária inválida.');if(opponentTag===clanTag)fail('O adversário deve ser outro clã.');
  const opponentName=text(input.opponentName,80,'Nome adversário inválido.');
  const clanStars=integer(input.clanStars,0,teamSize*3,'Placar dos Tigers inválido.');const opponentStars=integer(input.opponentStars,0,teamSize*3,'Placar adversário inválido.');
  const clanDamage=decimal(input.clanDamage,0,100,'Destruição dos Tigers inválida.');const opponentDamage=decimal(input.opponentDamage,0,100,'Destruição adversária inválida.');
  if((clanStars===teamSize*3)!==(clanDamage===100)||(opponentStars===teamSize*3)!==(opponentDamage===100))fail('Placar perfeito exige 100% de destruição.');
  if(!Array.isArray(input.attacks)||input.attacks.length>teamSize*(kind==='cwl'?1:2))fail('Quantidade de ataques inválida.');
  const counts=new Map();const targets=new Map();const attackers=new Map();
  const attacks=input.attacks.map(a=>{
    const attackerTag=gameTag(a.attackerTag,'Tag do atacante inválida.');const targetTag=gameTag(a.targetTag,'Tag do alvo inválida.');
    if(attackerTag===targetTag)fail('Atacante e alvo devem ser diferentes.');
    const attackerName=text(a.attackerName,80,'Nome do atacante obrigatório.');const targetName=text(a.targetName,80,'Nome do alvo obrigatório.');
    const attackerTH=integer(a.attackerTH,1,30,'CV do atacante inválido.');const targetTH=integer(a.targetTH,1,30,'CV do alvo inválido.');
    const stars=integer(a.stars,0,3,'Estrelas do ataque inválidas.');const damage=decimal(a.damage,0,100,'Destruição do ataque inválida.');
    if((stars===3 && damage!==100)||(damage===100 && stars!==3))fail('Um ataque de 100% deve ter três estrelas.');
    const count=(counts.get(attackerTag)||0)+1;counts.set(attackerTag,count);if(count>(kind==='cwl'?1:2))fail('Limite de ataques por guerreiro excedido.');
    for(const [map,key,value] of [[attackers,attackerTag,[attackerName,attackerTH]],[targets,targetTag,[targetName,targetTH]]]){
      if(map.has(key)&&JSON.stringify(map.get(key))!==JSON.stringify(value))fail('Nome e CV devem ser consistentes para a mesma tag.');map.set(key,value);
    }
    return {attackerTag,attackerName,attackerTH,targetTag,targetName,targetTH,stars,damage};
  });
  if(attackers.size>teamSize||targets.size>teamSize)fail('Jogadores registrados excedem o tamanho da guerra.');
  if([...attackers.keys()].some(t=>targets.has(t)))fail('Uma tag não pode aparecer nos dois lados da guerra.');
  const best=new Map();for(const a of attacks)best.set(a.targetTag,Math.max(best.get(a.targetTag)||0,a.stars));
  if([...best.values()].reduce((n,s)=>n+s,0)>clanStars)fail('Os ataques registrados já superam o placar informado.');
  return {clanTag,endedAt:new Date(endAt).toISOString(),teamSize,kind,opponentTag,opponentName,clanStars,opponentStars,clanDamage,opponentDamage,attacks,source:'manual'};
}
export function validateGoals(input,now=Date.now()) {
  if(!findClan(input?.clanTag))fail('Clã inválido.');
  const startDate=text(input.startDate,10,'Data inicial inválida.');const endDate=text(input.endDate,10,'Data final inválida.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(endDate))fail('Datas inválidas.');
  const start=Date.parse(startDate+'T00:00:00Z');const end=Date.parse(endDate+'T23:59:59Z');
  if(!Number.isFinite(start)||!Number.isFinite(end)||new Date(start).toISOString().slice(0,10)!==startDate||new Date(end).toISOString().slice(0,10)!==endDate||end<start||end-start>366*86400000||start>now+366*86400000)fail('Use um período válido de até 366 dias.');
  return {clanTag:findClan(input.clanTag).tag,startDate,endDate,donationTarget:integer(input.donationTarget,0,100000,'Meta de doações inválida.'),raidTarget:integer(input.raidTarget,0,6,'Meta da Capital deve ficar entre zero e seis ataques.')};
}
export async function clanManagement(env,tag) {
  const [wars,goal]=await Promise.all([
    env.DB.prepare('SELECT id,revision,updated_at AS updatedAt,payload FROM manual_wars WHERE clan_tag=? ORDER BY end_at DESC LIMIT 50').bind(tag).all(),
    env.DB.prepare('SELECT revision,updated_at AS updatedAt,payload FROM clan_goals WHERE clan_tag=?').bind(tag).first()
  ]);
  return {clanTag:tag,manualWars:wars.results.map(r=>({id:r.id,revision:r.revision,updatedAt:r.updatedAt,...JSON.parse(r.payload)})),goals:goal?{revision:goal.revision,updatedAt:goal.updatedAt,...JSON.parse(goal.payload)}:null};
}
export async function saveManualWar(env,input,now=Date.now()) {
  const war=validateManualWar(input,now);let id=input.id;
  if(id!=null&&!/^[a-f0-9-]{36}$/.test(id))fail('Identificador inválido.');
  const revision=integer(input.revision ?? 0,0,1000000,'Revisão inválida.');
  if(!id && revision!==0)fail('Novos registros devem começar sem revisão anterior.');
  let result;
  try {
    if(id){result=await env.DB.prepare('UPDATE manual_wars SET revision=revision+1,end_at=?,updated_at=?,payload=? WHERE id=? AND clan_tag=? AND revision=?').bind(Date.parse(war.endedAt),now,JSON.stringify(war),id,war.clanTag,revision).run();}
    else {id=crypto.randomUUID();result=await env.DB.prepare('INSERT INTO manual_wars(id,clan_tag,revision,end_at,updated_at,payload) VALUES (?,?,1,?,?,?)').bind(id,war.clanTag,Date.parse(war.endedAt),now,JSON.stringify(war)).run();}
  } catch(e){if(/UNIQUE|constraint/i.test(e.message))return {error:'Já existe uma guerra manual com este término para o clã.',status:409};throw e;}
  if(!result.meta.changes)return {error:'O registro foi alterado. Recarregue antes de salvar.',status:409};
  return {id,revision:id===input.id?revision+1:1,...war,updatedAt:now};
}
export async function saveGoals(env,input,now=Date.now()) {
  const goals=validateGoals(input,now);const revision=integer(input.revision ?? 0,0,1000000,'Revisão inválida.');
  const result=revision===0
    ? await env.DB.prepare('INSERT OR IGNORE INTO clan_goals(clan_tag,revision,updated_at,payload) VALUES (?,1,?,?)').bind(goals.clanTag,now,JSON.stringify(goals)).run()
    : await env.DB.prepare('UPDATE clan_goals SET revision=revision+1,updated_at=?,payload=? WHERE clan_tag=? AND revision=?').bind(now,JSON.stringify(goals),goals.clanTag,revision).run();
  if(!result.meta.changes)return {error:'A meta foi alterada. Recarregue antes de salvar.',status:409};
  return {...goals,revision:revision+1,updatedAt:now};
}
