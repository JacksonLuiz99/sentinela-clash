import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { recordRoster, managementOverview, playerEvolution, validateManualWar, validateGoals, clanManagement, saveManualWar, saveGoals } from '../worker/management.js';
import { route } from '../worker/index.js';
import { possibleTransfers, goalProgress, recruitmentMatch } from '../public/management.js';
const now=Date.parse('2026-11-19T12:00:00Z');const tag='#R0UPVVVY';const other='#28L88PQ2';
function database() {
  const sql=new DatabaseSync(':memory:');for(const file of ['0001_init.sql','0002_management.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const statement=(q,args=[])=>({bind(...a){return statement(q,a);},async first(){return sql.prepare(q).get(...args)||null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}};}});
  return {prepare:q=>statement(q),async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}},close:()=>sql.close()};
}
const member=(tag='#98Q9LLG2P',donations=10)=>({tag,name:'Guerreiro',townHallLevel:19,trophies:5000,donations,donationsReceived:5});
const clan=(members,clanTag=tag)=>({tag:clanTag,memberList:members});
const war=()=>({clanTag:tag,endedAt:'2026-11-18T12:00:00.000Z',teamSize:15,kind:'regular',opponentTag:'#28L88PQ2',opponentName:'Adversário',clanStars:44,opponentStars:40,clanDamage:99,opponentDamage:95,attacks:[{attackerTag:'#98Q9LLG2P',attackerName:'Ana',attackerTH:19,targetTag:'#QC9RY8GJ',targetName:'Alvo',targetTH:19,stars:3,damage:100}]});
const goals=()=>({clanTag:tag,donationTarget:1000,raidTarget:6,startDate:'2026-11-01',endDate:'2026-11-30'});
test('primeira captura não inventa entradas e coleta repetida não duplica movimentos',async()=>{
 const DB=database();await recordRoster({DB},clan([member()]),now);assert.equal((await managementOverview({DB})).moves.length,0);
 await recordRoster({DB},clan([]),now+1000);await recordRoster({DB},clan([]),now+1000);const overview=await managementOverview({DB});assert.equal(overview.moves.length,1);assert.equal(overview.moves[0].kind,'leave');DB.close();
});
test('série individual guarda última captura diária e mantém cada clã separado',async()=>{
 const DB=database();await recordRoster({DB},clan([member()]),now);await recordRoster({DB},clan([member(undefined,30)]),now+1000);await recordRoster({DB},clan([member(undefined,50)],other),now+2000);
 const result=await playerEvolution({DB},'#98Q9LLG2P',now+2000);assert.equal(result.points.length,2);assert.equal(result.points.find(p=>p.clanTag===tag).donations,30);assert.equal(result.points.find(p=>p.clanTag===other).donations,50);DB.close();
});
test('retenção diária remove registros antigos sem perder a primeira coleta de referência',async()=>{
 const DB=database();await recordRoster({DB},clan([member()]),now);await recordRoster({DB},clan([member()]),now+33*86400000);assert.equal((await playerEvolution({DB},'#98Q9LLG2P',now+33*86400000)).points.length,1);DB.close();
});
test('possível transferência exige par único, mesma tag e janela de 48h',()=>{
 const leave={playerTag:'#P',clanTag:tag,kind:'leave',detectedAt:now};const join={playerTag:'#P',clanTag:other,kind:'join',detectedAt:now+60000};
 assert.equal(possibleTransfers([leave,join])[0].possibleTransfer.to,other);
 assert.equal(possibleTransfers([leave,{...join,detectedAt:now+49*3600000}])[0].possibleTransfer,null);
 assert.ok(possibleTransfers([leave,join,{...join,clanTag:'#202YP22U9'}]).every(m=>!m.possibleTransfer));
});
test('manual valida placares, tags, período, limites de ataques e consistência',()=>{
 assert.equal(validateManualWar(war(),now).source,'manual');
 for(const patch of [{clanStars:46},{clanDamage:101},{clanStars:45},{endedAt:'2026-11-20T12:00:00Z'},{opponentTag:tag},{opponentTag:'<script>'}])assert.throws(()=>validateManualWar({...war(),...patch},now));
 assert.throws(()=>validateManualWar({...war(),attacks:Array(3).fill(war().attacks[0])},now),/Limite/);
 assert.throws(()=>validateManualWar({...war(),attacks:[{...war().attacks[0],damage:90}]},now));
 assert.throws(()=>validateManualWar({...war(),kind:'cwl',attacks:Array(2).fill(war().attacks[0])},now));
 assert.throws(()=>validateManualWar({...war(),clanStars:2},now));
});
test('edição manual é isolada por clã e impede perda por revisões concorrentes',async()=>{
 const DB=database();const saved=await saveManualWar({DB},war(),now);assert.equal(saved.revision,1);
 assert.equal((await clanManagement({DB},other)).manualWars.length,0);
 assert.equal((await saveManualWar({DB},{...war(),clanTag:other,opponentTag:tag,id:saved.id,revision:1},now)).status,409);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM wars').first()).n,0);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM deliveries').first()).n,0);
 assert.equal((await saveManualWar({DB},{...war(),id:saved.id,revision:0},now)).status,409);
 const edited=await saveManualWar({DB},{...war(),id:saved.id,revision:1,clanStars:43},now+1000);assert.equal(edited.revision,2);
 assert.equal((await saveManualWar({DB},war(),now)).status,409);DB.close();
});
test('metas validam vigência e revisão de criação e atualização',async()=>{
 const DB=database();assert.throws(()=>validateGoals({...goals(),raidTarget:7},now));assert.throws(()=>validateGoals({...goals(),startDate:'2026-02-30'},now));
 const saved=await saveGoals({DB},goals(),now);assert.equal(saved.revision,1);
 assert.equal((await saveGoals({DB},goals(),now)).status,409);
 assert.equal((await saveGoals({DB},{...goals(),revision:1},now)).revision,2);
 assert.equal((await saveGoals({DB},{...goals(),clanTag:other,revision:5},now)).status,409);DB.close();
});
test('metas não atribuem zero a ausentes nem usam raids fora da vigência',()=>{
 const result=goalProgress(goals(),[member()],{startTime:'20261113T070000.000Z',members:[]},now);assert.equal(result.rows[0].raidAttacks,null);assert.equal(result.rows[0].donationPercent,1);
 assert.equal(goalProgress(goals(),[member()],{startTime:'20261001T070000.000Z',members:[{tag:'#98Q9LLG2P',attacks:6}]},now).raidWithin,false);
 assert.equal(goalProgress(goals(),[member()],null,now+40*86400000).active,false);
});
test('recrutamento identifica vagas, fechamento e requisitos parciais',()=>{
 const c={capturedAt:Date.now(),members:40,type:'inviteOnly',requiredTH:18,requiredTrophies:5000};
 assert.match(recruitmentMatch(c,{townHall:17}),/Abaixo/);assert.match(recruitmentMatch(c,{townHall:19,trophies:6000}),/atendidos/);assert.match(recruitmentMatch({...c,members:50}),/Sem vagas/);assert.match(recruitmentMatch({...c,type:'closed'}),/fechado/);
});
test('rotas de gravação exigem autenticação e chave nunca aparece no público',async()=>{
 const DB=database();const env={DB,ADMIN_TOKEN:'a'.repeat(40),LEADERSHIP_TOKEN:'b'.repeat(40)};
 for(const path of ['/api/manual-wars','/api/goals','/api/leadership']){
  const response=await route(new Request('https://test'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(war())}),env);assert.equal(response.status,401);
 }
 const wrong=await route(new Request('https://test/api/leadership',{method:'POST',headers:{Authorization:'Bearer '+env.ADMIN_TOKEN}}),env);assert.equal(wrong.status,401);
 const valid=await route(new Request('https://test/api/manual-wars',{method:'POST',headers:{Authorization:'Bearer '+env.LEADERSHIP_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({...war(),endedAt:new Date(Date.now()-3600000).toISOString()})}),env);assert.equal(valid.status,200);
 const response=await route(new Request('https://test/api/clan-management?clan='+encodeURIComponent(tag)),env);assert.equal(response.status,200);assert.ok(!(await response.text()).includes(env.LEADERSHIP_TOKEN));DB.close();
});
test('rotas recusam JSON inválido, corpo grande e jogador inválido',async()=>{
 const DB=database();const env={DB,LEADERSHIP_TOKEN:'a'.repeat(40)};const headers={Authorization:'Bearer '+env.LEADERSHIP_TOKEN,'Content-Type':'application/json'};
 assert.equal((await route(new Request('https://test/api/goals',{method:'POST',headers,body:'{'}),env)).status,400);
 assert.equal((await route(new Request('https://test/api/goals',{method:'POST',headers,body:' '.repeat(65537)}),env)).status,413);
 assert.equal((await route(new Request('https://test/api/player-evolution?player=javascript:x'),env)).status,400);DB.close();
});
