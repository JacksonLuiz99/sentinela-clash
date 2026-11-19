import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, createDownload, csvCell, crc32 } from '../public/exports.js';
const stamp='2026-11-19T14:00:00.000Z';
function sample(tag='#HOME',name='Tigres São Paulo') {
  const war={state:'warEnded',kind:'regular',teamSize:1,startTime:'20261118T120000.000Z',endTime:'20261119T120000.000Z',clan:{tag,name,stars:3,destructionPercentage:100,members:[{tag:'#A',name:'Ana 🐯',townhallLevel:19,mapPosition:1,attacks:[{stars:3,destructionPercentage:100,defenderTag:'#B',duration:120,order:1}]}]},opponent:{tag:'#AWAY',name:'Outro clã',stars:2,destructionPercentage:90,members:[{tag:'#B',name:'Beto',townhallLevel:18,mapPosition:1}]}};
  return {clanTag:tag,monitoringMode:'on_demand',current:{clan:{tag,name,memberList:[{tag:'#A',name:'Ana 🐯',role:'leader',townHallLevel:19,trophies:6000,donations:15,donationsReceived:10}]},war,capturedAt:Date.parse(stamp),warCapturedAt:Date.parse(stamp)},wars:[war],health:{code:'ok'},baseline:{clan:{tag,memberList:[{tag:'#A',donations:10}]},capturedAt:Date.parse(stamp)-86400000},extras:{warLog:{items:[{...war,result:'win'}]},raids:{updatedAt:Date.parse(stamp),items:[{startTime:'20261113T070000.000Z',endTime:'20261116T070000.000Z',members:[{tag:'#A',name:'Ana 🐯',attacks:6,attackLimit:5,bonusAttackLimit:1,capitalResourcesLooted:20000}]}]}},CLASH_API_TOKEN:'DO-NOT-EXPORT',channels:{secret:'DO-NOT-EXPORT'}};
}
function rowsAsObjects(table){return table.rows.map(row=>Object.fromEntries(table.headers.map((h,i)=>[h,row[i]])));}
function unzipStored(bytes){
  const result=new Map();const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=0;
  while(view.getUint32(at,true)===0x04034b50){const method=view.getUint16(at+8,true);assert.equal(method,0);const size=view.getUint32(at+18,true);const nameLength=view.getUint16(at+26,true);const extraLength=view.getUint16(at+28,true);const name=new TextDecoder().decode(bytes.slice(at+30,at+30+nameLength));const start=at+30+nameLength+extraLength;const data=bytes.slice(start,start+size);assert.equal(crc32(data),view.getUint32(at+14,true));result.set(name,new TextDecoder().decode(data));at=start+size;}
  assert.equal(view.getUint32(at,true),0x02014b50);return result;
}
test('exporta dados do clã selecionado com metadados e sem segredos',()=>{
  const result=createDownload(sample(),'json','all',stamp);const data=JSON.parse(result.content);
  assert.equal(data.meta.clan.tag,'#HOME');assert.equal(data.meta.capturedAt,stamp);assert.ok(!result.content.includes('DO-NOT-EXPORT'));
  assert.equal(Object.keys(data.reports).length,6);assert.ok(result.filename.endsWith('.json'));
});
test('resumo de guerras e ataques não duplicam guerra atual também salva no histórico',()=>{
  const bundle=buildExport(sample(),stamp);assert.equal(bundle.tables.wars.rows.length,1);assert.equal(bundle.tables.attacks.rows.length,1);
  assert.equal(rowsAsObjects(bundle.tables.currentRanking)[0]['Estrelas dos ataques'],3);
  assert.equal(rowsAsObjects(bundle.tables.historicalRanking)[0]['Guerras observadas'],1);
});
test('os arquivos de clãs diferentes mantêm nomes e tags separados',()=>{
  const a=createDownload(sample('#FIRST','Primeiro'),'csv','members',stamp);
  const b=createDownload(sample('#SECOND','Segundo'),'csv','members',stamp);
  assert.ok(a.content.includes('#FIRST')&&!a.content.includes('#SECOND'));assert.ok(b.content.includes('#SECOND')&&!b.content.includes('#FIRST'));
});
test('rejeita troca incoerente de clã e descarta guerras explicitamente de outro clã',()=>{
  const payload=sample();payload.clanTag='#DIFFERENT';assert.throws(()=>buildExport(payload),/Selecione/);
  const p=sample();const wrong=sample('#OTHER','Outro');p.wars=[wrong.current.war];p.current.war=wrong.current.war;p.extras.warLog.items=[wrong.current.war];p.baseline=wrong.baseline;
  const bundle=buildExport(p,stamp);assert.equal(bundle.tables.wars.rows.length,0);assert.equal(bundle.tables.attacks.rows.length,0);assert.equal(bundle.tables.currentRanking.rows.length,0);
  assert.equal(rowsAsObjects(bundle.tables.members)[0]['Variação de doações em 24h'],null);
});
test('CSV preserva nomes, aspas e quebras de linha e neutraliza fórmulas de planilha',()=>{
  assert.equal(csvCell('José "Tigre"\nBR'),'"José ""Tigre""\nBR"');
  for(const text of ['=1+1','+SUM(A1)','-1+1','@SUM(A1)','  =1+1','\t=1+1'])assert.ok(csvCell(text).startsWith('"\''));
  assert.equal(csvCell(2.5),'"2,5"');assert.equal(csvCell(null),'""');
  const file=createDownload(sample(),'csv','members',stamp);assert.ok(file.content.startsWith('\uFEFF'));assert.ok(file.content.includes(';'));assert.ok(file.content.includes('Ana 🐯'));
});
test('CSV exige relatório específico; relatórios vazios mantêm apenas o cabeçalho',()=>{
  assert.throws(()=>createDownload(sample(),'csv','all',stamp),/Escolha/);
  const payload=sample();payload.current.war=null;payload.wars=[];payload.extras.warLog.items=[];
  const file=createDownload(payload,'csv','attacks',stamp);assert.equal(file.rows,0);assert.equal(file.content.split('\r\n').length,2);
});
test('XLSX contém sete abas, filtros, números reais e nomes como texto sem fórmulas',()=>{
  const payload=sample();payload.current.clan.memberList[0].name='=1+1 🐯';
  const file=createDownload(payload,'xlsx','all',stamp);const entries=unzipStored(file.content);
  const workbook=entries.get('xl/workbook.xml');assert.equal((workbook.match(/<sheet /g)||[]).length,7);assert.ok(workbook.includes('Ranking histórico'));
  const members=entries.get('xl/worksheets/sheet2.xml');assert.ok(members.includes('=1+1 🐯'));assert.ok(members.includes('t="inlineStr"'));assert.ok(!members.includes('<f>'));
  assert.ok(members.includes('<autoFilter'));assert.ok(members.includes('state="frozen"'));assert.ok(members.includes('<v>6000</v>'));
  assert.equal(unzipStored(createDownload(payload,'xlsx','capital',stamp).content).get('xl/workbook.xml').match(/<sheet /g).length,2);
});
test('Capital exporta participante, saques, ataques e data do fim de semana',()=>{
  const row=rowsAsObjects(buildExport(sample(),stamp).tables.capital)[0];assert.equal(row['Ouro saqueado'],20000);assert.equal(row['Ataques usados'],6);assert.equal(row['Tag do jogador'],'#A');
});
test('integridade ZIP usa CRC32 padrão e arquivos não incluem valores XML inválidos',()=>{
  assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
  const p=sample();p.current.clan.memberList[0].name='A&B<\u0000>"';const entries=unzipStored(createDownload(p,'xlsx','members',stamp).content);
  const text=entries.get('xl/worksheets/sheet2.xml');assert.ok(text.includes('A&amp;B&lt;&gt;&quot;'));assert.ok(!text.includes('\u0000'));
});
