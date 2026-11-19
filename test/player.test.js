import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlayerTag, warIsRecent, playerStatus, formatRemaining, readPlayerTag, writePlayerTag, PLAYER_KEY } from '../public/player.js';

const now = Date.parse('2026-11-19T15:00:00Z');
const tag = '#R0UPVVVY';
const endTime = '20261119T180000.000Z';
const startTime = '20261119T120000.000Z';
const clan = {
  name: 'TIGERS OF WAR 4',
  memberList: [
    {tag:'#2PP822', name:'Ana', role:'member', townHallLevel:16},
    {tag:'#9PY9Y9', name:'Beto', role:'leader', townHallLevel:17}
  ]
};
const war = (state, members = [], extra = {}) => ({state, kind:'regular', startTime, endTime, clan:{tag, members}, ...extra});
const attacks = n => Array.from({length:n}, (_, i) => ({stars:3, destructionPercentage:100, defenderTag:`#DEF${i}`}));

test('normaliza tags digitadas com O no lugar de zero, espaços e sem #', () => {
  assert.equal(normalizePlayerTag(' 29p8c '), '#29P8C');
  assert.equal(normalizePlayerTag('#r0upvvvo'), '#R0UPVVV0');
  assert.equal(normalizePlayerTag('#r0upvvvy'), '#R0UPVVVY');
  assert.equal(normalizePlayerTag('R 0 U P V V V Y'), '#R0UPVVVY');
});

test('rejeita tags vazias, curtas ou com caracteres fora do alfabeto do jogo', () => {
  assert.equal(normalizePlayerTag(''), null);
  assert.equal(normalizePlayerTag(null), null);
  assert.equal(normalizePlayerTag('#AB'), null);
  assert.equal(normalizePlayerTag('#ABC1A8'), null);
  assert.equal(normalizePlayerTag('#ABC!@#'), null);
});

test('janela de dados recentes segue a mesma regra da aba de atenção', () => {
  assert.equal(warIsRecent(tag, now - 5 * 60000, now, tag), true);
  assert.equal(warIsRecent(tag, now - 11 * 60000, now, tag), false);
  assert.equal(warIsRecent('#OUTRO', now - 20 * 60000, now, tag), true);
  assert.equal(warIsRecent('#OUTRO', now - 31 * 60000, now, tag), false);
  assert.equal(warIsRecent(tag, null, now, tag), false);
});

test('sem tag salva, pede a tag e não consulta a guerra', () => {
  assert.deepEqual(playerStatus({tag:null, clan, war:war('inWar'), recent:true, now}), {kind:'choose'});
});

test('tag fora do clã selecionado é sinalizada sem inventar dados', () => {
  const status = playerStatus({tag:'#QQQ999', clan, war:war('inWar'), recent:true, now});
  assert.equal(status.kind, 'notInClan');
  assert.equal(status.tag, '#QQQ999');
});

test('guerra em andamento mostra ataques restantes do jogador', () => {
  const status = playerStatus({tag:'#2PP822', clan, war:war('inWar', [{tag:'#2PP822', name:'Ana', attacks:attacks(1)}]), recent:true, now});
  assert.equal(status.kind, 'member');
  assert.equal(status.war.state, 'active');
  assert.equal(status.war.used, 1);
  assert.equal(status.war.limit, 2);
  assert.equal(status.war.remaining, 1);
});

test('jogador que já fez todos os ataques aparece com zero restante', () => {
  const status = playerStatus({tag:'#2PP822', clan, war:war('inWar', [{tag:'#2PP822', name:'Ana', attacks:attacks(2)}]), recent:true, now});
  assert.equal(status.war.remaining, 0);
});

test('CWL usa um ataque por membro quando a API não informa o limite', () => {
  const status = playerStatus({tag:'#2PP822', clan, war:war('inWar', [{tag:'#2PP822', name:'Ana', attacks:[]}], {kind:'cwl'}), recent:true, now});
  assert.equal(status.war.limit, 1);
  assert.equal(status.war.remaining, 1);
});

test('sem captura recente da guerra, não confirma ataques pendentes', () => {
  const status = playerStatus({tag:'#2PP822', clan, war:war('inWar', [{tag:'#2PP822', name:'Ana', attacks:[]}]), recent:false, now});
  assert.equal(status.war.state, 'unconfirmed');
  assert.equal(status.war.remaining, undefined);
});

test('guerra cujo horário já passou aguarda atualização em vez de cobrar', () => {
  const late = Date.parse('2026-11-19T19:00:00Z');
  const status = playerStatus({tag:'#2PP822', clan, war:war('inWar', [{tag:'#2PP822', name:'Ana', attacks:[]}]), recent:true, now:late});
  assert.equal(status.war.state, 'awaitingUpdate');
});

test('guerra encerrada, em preparação ou sem guerra têm mensagens próprias', () => {
  assert.equal(playerStatus({tag:'#2PP822', clan, war:war('warEnded'), recent:true, now}).war.state, 'ended');
  assert.equal(playerStatus({tag:'#2PP822', clan, war:war('preparation'), recent:true, now}).war.state, 'preparation');
  assert.equal(playerStatus({tag:'#2PP822', clan, war:null, recent:true, now}).war.state, 'none');
});

test('jogador fora da escalação não recebe cobrança', () => {
  const status = playerStatus({tag:'#9PY9Y9', clan, war:war('inWar', [{tag:'#2PP822', name:'Ana', attacks:[]}]), recent:true, now});
  assert.equal(status.war.state, 'notScheduled');
});

test('sem dados do clã mostra estado de espera', () => {
  assert.equal(playerStatus({tag, clan:null, war:null, recent:false, now}).kind, 'noData');
});

test('formatRemaining mostra horas e minutos, ou encerrada', () => {
  assert.equal(formatRemaining(2 * 3600000 + 15 * 60000), '2 h 15 min');
  assert.equal(formatRemaining(42 * 60000), '42 min');
  assert.equal(formatRemaining(0), 'encerrada');
  assert.equal(formatRemaining(NaN), 'encerrada');
});

test('tag salva no aparelho sobrevive à leitura e pode ser removida', () => {
  const values = new Map();
  const storage = {getItem:k=>values.get(k) ?? null, setItem:(k,v)=>values.set(k,v), removeItem:k=>values.delete(k)};
  assert.equal(writePlayerTag('#2PP822', storage), true);
  assert.equal(values.get(PLAYER_KEY), '#2PP822');
  assert.equal(readPlayerTag(storage), '#2PP822');
  assert.equal(writePlayerTag(null, storage), true);
  assert.equal(readPlayerTag(storage), null);
});

test('armazenamento indisponível não quebra a leitura nem a gravação', () => {
  const broken = {getItem(){throw new Error('blocked');}, setItem(){throw new Error('blocked');}, removeItem(){throw new Error('blocked');}};
  assert.equal(readPlayerTag(broken), null);
  assert.equal(writePlayerTag('#2PP822', broken), false);
});
