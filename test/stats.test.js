import test from 'node:test';
import assert from 'node:assert/strict';
import { performance, mergedHistory, publicLinks, outcome } from '../public/stats.js';
const war = (state = 'inWar') => ({ state, kind:'regular', startTime:'20261118T010000.000Z',endTime:'20261119T010000.000Z',teamSize:2,
  clan:{tag:'#HOME',stars:5,destructionPercentage:95,members:[
    {tag:'#A',name:'Ana',townhallLevel:19,mapPosition:1,attacks:[{stars:3,destructionPercentage:100,duration:120,defenderTag:'#X'},{stars:3,destructionPercentage:100,duration:130,defenderTag:'#Y'}]},
    {tag:'#B',name:'Beto',townhallLevel:18,mapPosition:2,attacks:[{stars:2,destructionPercentage:90,duration:150,defenderTag:'#Y'}]}
  ]},opponent:{tag:'#AWAY',name:'Adversário',stars:4,destructionPercentage:80,members:[{tag:'#X',name:'Alvo',townhallLevel:19,mapPosition:1}]}});
test('ranking conta estrelas dos ataques sem confundir com placar do clã',()=>{
  const result=performance([war()]);assert.equal(result[0].stars,6);assert.equal(result[0].triples,2);
  assert.equal(result[0].averageStars,3);assert.equal(result[0].participation,100);assert.equal(result[1].participation,50);
  assert.equal(result[0].hits[0].targetName,'Alvo');assert.equal(result[0].hits[0].targetTH,19);
});
test('ranking não duplica guerra atual também presente no histórico',()=>{
  const result=performance([war(),war()]);assert.equal(result[0].attacks,2);assert.equal(result[0].wars,1);
});
test('histórico de desempenho ignora preparação, resumo e guerra ainda em andamento',()=>{
  const summary={...war('warEnded'),clan:{stars:5}};
  assert.equal(performance([war(),war('preparation'),summary],{completedOnly:true}).length,0);
  assert.equal(performance([war('warEnded')],{completedOnly:true}).length,2);
});
test('participante sem ataque não ganha destaque fictício nem divisão por zero',()=>{
  const w=war();w.clan.members[0].attacks=[];
  const player=performance([w]).find(p=>p.tag==='#A');assert.equal(player.averageDamage,0);assert.equal(player.tripleRate,0);assert.equal(player.averageDuration,null);
});
test('Liga tem um ataque por jogador quando limite não foi informado',()=>{
  const w=war();w.kind='cwl';w.clan.members[0].attacks=w.clan.members[0].attacks.slice(0,1);
  assert.equal(performance([w])[0].expected,1);
});
test('histórico unifica resumo da API e dados detalhados sem repetir resultado',()=>{
  const w=war('warEnded');const summary={...w,result:'win',clan:{stars:5},opponent:{tag:'#AWAY',stars:4}};
  const merged=mergedHistory([w],[summary]);assert.equal(merged.length,1);assert.equal(merged[0].source,'monitor');assert.equal(merged[0].clan.members.length,2);assert.equal(outcome(merged[0]),'Vitória');
});
test('links públicos aceitam convite e recusam webhook e scripts',()=>{
  assert.equal(publicLinks({DISCORD_PUBLIC_URL:'https://discord.gg/EmJeAWjBg'}).discord,'https://discord.gg/EmJeAWjBg');
  assert.equal(publicLinks({DISCORD_PUBLIC_URL:'https://discord.com/api/webhooks/123/secret'}).discord,null);
  assert.equal(publicLinks({TELEGRAM_PUBLIC_URL:'javascript:alert(1)'}).telegram,null);
});
