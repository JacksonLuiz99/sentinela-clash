import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { isPlayerTag, locatePlayer } from '../worker/family.js';

const player = '#2PP822';
const member = (tag, name, role = 'member', townHallLevel = 16) => ({tag, name, role, townHallLevel, donations: 9, trophies: 4000});

function database(rows) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  for (const [key, value] of rows) sql.prepare('INSERT INTO state(key,value) VALUES (?,?)').run(key, JSON.stringify(value));
  return {prepare: query => ({all: async () => ({results: sql.prepare(query).all()})})};
}

const env = clanTag => ({CLAN_TAG: clanTag, DB: database([
  ['current', {capturedAt: 1000, clan: {name: 'TIGERS OF WAR 4', memberList: [member(player, 'Ana', 'leader', 17), member('#9PY9Y9', 'Beto')]}}],
  ['family:#2GY9JPQY2', {current: {capturedAt: 3000, clan: {name: 'TOW FORMATION', memberList: [member(player, 'Ana', 'admin', 16)]}}}],
  ['family:#92RJJJ0Y', {current: {capturedAt: 2000, clan: {name: 'TRAIRI-CE', memberList: [member('#2LQ8GG', 'Caio')]}}}],
  ['summary:#2GY9JPQY2', {tag: '#2GY9JPQY2'}]
])});

test('aceita apenas tags com o alfabeto do jogo', () => {
  assert.equal(isPlayerTag('#2PP822'), true);
  assert.equal(isPlayerTag('2PP822'), false);
  assert.equal(isPlayerTag('#ABC123'), false);
  assert.equal(isPlayerTag('#2P'), false);
  assert.equal(isPlayerTag(null), false);
});

test('encontra o jogador em mais de um clã, do registro mais recente para o mais antigo', async () => {
  const result = await locatePlayer(env('#R0UPVVVY'), player, 9999);
  assert.equal(result.player, player);
  assert.equal(result.checkedAt, 9999);
  assert.deepEqual(result.matches.map(m => m.clanTag), ['#2GY9JPQY2', '#R0UPVVVY']);
  assert.equal(result.matches[0].clanName, 'TOW FORMATION');
  assert.equal(result.matches[0].role, 'admin');
  assert.equal(result.matches[1].role, 'leader');
});

test('devolve somente clã, cargo, CV e data da coleta, sem outros dados do jogador', async () => {
  const result = await locatePlayer(env('#R0UPVVVY'), player);
  for (const match of result.matches) assert.deepEqual(Object.keys(match).sort(), ['capturedAt', 'clanName', 'clanTag', 'role', 'townHallLevel']);
});

test('tag ausente em todos os registros retorna lista vazia', async () => {
  const result = await locatePlayer(env('#R0UPVVVY'), '#9GG9GG');
  assert.deepEqual(result.matches, []);
});
