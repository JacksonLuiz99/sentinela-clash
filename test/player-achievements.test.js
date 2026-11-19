import test from 'node:test';
import assert from 'node:assert/strict';
import { playerAchievements } from '../public/player.js';

const tag = '#2PP822';
const mem = (t, name, donations = 0, attacks = []) => ({tag: t, name, donations, attacks, townhallLevel: 16, mapPosition: 1});
const hit = stars => ({stars, destructionPercentage: stars === 3 ? 100 : 60, defenderTag: '#ENEMY', duration: 90});
const clan = {memberList: [mem(tag, 'Ana', 40), mem('#9PY9Y9', 'Beto', 90), mem('#AAA111', 'Caio', 0)]};
const liveWar = (members, extra = {}) => ({state: 'inWar', kind: 'regular', attacksPerMember: 2, clan: {tag: '#R0UPVVVY', members}, opponent: {members: []}, ...extra});
const titles = items => items.map(i => i.title);

test('ataques completos e triplos aparecem só com guerra atual recente', () => {
  const war = liveWar([mem(tag, 'Ana', 0, [hit(3), hit(3)])]);
  const items = playerAchievements({tag, clan, war, wars: [], recent: true});
  assert.ok(titles(items).includes('Ataques completos'));
  assert.ok(titles(items).includes('2 triplos nesta guerra'));
});

test('dados antigos não geram conquistas da guerra atual', () => {
  const war = liveWar([mem(tag, 'Ana', 0, [hit(3), hit(3)])]);
  const items = playerAchievements({tag, clan, war, wars: [], recent: false});
  assert.equal(titles(items).includes('Ataques completos'), false);
  assert.equal(titles(items).some(t => t.includes('triplo')), false);
});

test('ataques parciais não são tratados como completos', () => {
  const war = liveWar([mem(tag, 'Ana', 0, [hit(3)])]);
  const items = playerAchievements({tag, clan, war, wars: [], recent: true});
  assert.equal(titles(items).includes('Ataques completos'), false);
  assert.equal(titles(items).includes('1 triplo nesta guerra'), true);
});

test('ranking de doações mostra só os cinco primeiros com doação', () => {
  const items = playerAchievements({tag, clan, war: null, wars: [], recent: false});
  assert.ok(titles(items).includes('2º em doações nesta temporada'));
  const none = playerAchievements({tag: '#AAA111', clan, war: null, wars: [], recent: false});
  assert.equal(none.some(i => i.title.includes('doações')), false);
});

test('histórico conta somente guerras encerradas com o jogador escalado', () => {
  const ended = {state: 'warEnded', kind: 'regular', attacksPerMember: 2, startTime: '20261118T100000.000Z', endTime: '20261118T220000.000Z', opponent: {tag: '#O1', members: []}, clan: {tag: '#R0UPVVVY', members: [mem(tag, 'Ana', 0, [hit(3), hit(2)])]}};
  const items = playerAchievements({tag, clan, war: null, wars: [ended], recent: false});
  const history = items.find(i => i.title.includes('guerra'));
  assert.equal(history.title, '1 guerra acompanhada');
  assert.match(history.detail, /2 ataques registrados, 5 estrelas e 1 triplo no total/);
});

test('sem nenhum registro, a lista fica vazia em vez de inventar conquistas', () => {
  assert.deepEqual(playerAchievements({tag: '#ZZZ999', clan, war: null, wars: [], recent: false}), []);
});
