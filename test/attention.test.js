import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionItems } from '../public/attention.js';
import { NAVIGATION, navigationGroup } from '../public/navigation.js';
import { DEFAULT_CLAN } from '../public/clans.js';
const now=Date.parse('2026-11-19T12:00:00Z');const other='#28L88PQ2';
const clan=(patch={})=>({tag:DEFAULT_CLAN,capturedAt:now,warCapturedAt:now,lastAttempt:now,health:'ok',war:{state:'inWar',pending:4,endAt:now+3600000,opponent:'Oponente'},...patch});
test('resumo conta ataques apenas de guerra recente, confirmada e ainda ativa',()=>{
 const result=attentionItems([clan(),clan({tag:other,war:{state:'preparation',pending:30,endAt:now+3600000}})],now);
 assert.equal(result.attacks,4);assert.equal(result.warClans,1);assert.equal(result.priorities[0].kind,'attacks');
 for(const patch of [{health:'cwl_partial'},{health:'api_http_403'},{warCapturedAt:now-31*60000},{capturedAt:now-31*60000},{war:{state:'inWar',pending:4,endAt:now-1}},{war:{state:'inWar',pending:4,endAt:null}}])assert.equal(attentionItems([clan(patch)],now).attacks,0);
});
test('guerra privada é limitação de acesso, sem pendências ou falha de coleta inventadas',()=>{
 const result=attentionItems([clan({health:'api_http_403'})],now);
 assert.equal(result.coverage.length,1);assert.equal(result.collection,0);assert.equal(result.attacks,0);assert.match(result.coverage[0].title,/restrito/);
});
test('falha de perfil após última captura não herda ataques de guerra antiga',()=>{
 const result=attentionItems([clan({health:'api_http_503',lastAttempt:now+1000})],now);
 assert.equal(result.collection,1);assert.equal(result.attacks,0);assert.equal(result.priorities[0].kind,'collection');
});
test('coletas ausentes, futuras ou antigas não viram resumo saudável',()=>{
 for(const capturedAt of [null,now+120000,now-31*60000]){
  const result=attentionItems([clan({capturedAt})],now);assert.equal(result.collection,1);assert.equal(result.attacks,0);
 }
 assert.equal(attentionItems([clan({capturedAt:now-11*60000})],now).collection,1);
 assert.equal(attentionItems([clan({tag:other,capturedAt:now-11*60000})],now).collection,0);
});
test('limites da guerra vencidos pelo relógio aguardam atualização, sem ataques acionáveis',()=>{
 const result=attentionItems([clan({war:{state:'inWar',pending:4,endAt:now}})],now);
 assert.equal(result.attacks,0);assert.equal(result.coverage.length,1);assert.match(result.coverage[0].title,/atualização/);
});
test('metas lembram o prazo, sem afirmar que o progresso está incompleto',()=>{
 const goals={startDate:'2026-11-01',endDate:'2026-11-20',donationTarget:100,raidTarget:6};
 const result=attentionItems([clan({goals})],now);assert.equal(result.deadlines,1);assert.match(result.priorities.find(p=>p.kind==='goals').detail,/não afirma/);
 for(const patch of [{startDate:'2026-11-20'},{endDate:'2026-11-18'},{endDate:'2026-11-30'},{donationTarget:0,raidTarget:0}])assert.equal(attentionItems([clan({goals:{...goals,...patch}})],now).deadlines,0);
});
test('ataques mais próximos do término aparecem primeiro e nenhuma tag externa é aceita',()=>{
 const result=attentionItems([clan({war:{state:'inWar',pending:4,endAt:now+8*3600000}}),clan({tag:other,war:{state:'inWar',pending:2,endAt:now+1800000}}),clan({tag:'#UNKNOWN'})],now);
 assert.equal(result.attacks,6);assert.equal(result.priorities[0].clanTag,other);
});
test('navegação agrupa cada seção uma única vez e mantém atalhos conhecidos',()=>{
 assert.deepEqual(NAVIGATION.map(g=>g.label),['Família','Clã','Liderança']);
 const sections=NAVIGATION.flatMap(g=>g.sections.map(s=>s.id));assert.equal(sections.length,new Set(sections).size);
 assert.equal(navigationGroup('overview').id,'clan');assert.equal(navigationGroup('operations').id,'family');assert.equal(navigationGroup('leadership').id,'leadership');assert.equal(navigationGroup('alerts').id,'leadership');assert.equal(navigationGroup('invalid'),null);
});
