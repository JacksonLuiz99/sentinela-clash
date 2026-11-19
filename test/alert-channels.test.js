import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { isWebhookUrl, channelUrlFor, saveChannel, channelStatus } from '../worker/channels.js';

const tow4 = '#R0UPVVVY';
const tow1 = '#28L88PQ2';
const hook = 'https://discord.com/api/webhooks/123456/abc_DEF-ghi';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0004_alert_channels.sql', import.meta.url), 'utf8'));
  function stmt(query, args = []) {
    return {
      bind: (...values) => stmt(query, values),
      first: async () => sql.prepare(query).get(...args) || null,
      all: async () => ({results: sql.prepare(query).all(...args)}),
      run: async () => { sql.prepare(query).run(...args); return {}; }
    };
  }
  return {prepare: query => stmt(query)};
}

const env = (DB, extra = {}) => ({DB, CLAN_TAG: tow4, ...extra});

test('aceita somente webhooks do Discord com o formato oficial', () => {
  assert.equal(isWebhookUrl(hook), true);
  assert.equal(isWebhookUrl('http://discord.com/api/webhooks/123/abc'), false);
  assert.equal(isWebhookUrl('https://evil.example.com/api/webhooks/123/abc'), false);
  assert.equal(isWebhookUrl('https://discord.com/api/webhooks/123/abc?x=1'), false);
  assert.equal(isWebhookUrl(null), false);
});

test('cadastra o canal de um clã e devolve somente o status', async () => {
  const DB = database();
  const result = await saveChannel(env(DB), tow1, hook, 5000);
  assert.deepEqual(result, {clanTag: tow1, configured: true, updatedAt: 5000});
  assert.equal(await channelUrlFor(env(DB), tow1), hook);
});

test('rejeita clã desconhecido e webhook fora do formato, sem gravar nada', async () => {
  const DB = database();
  await assert.rejects(saveChannel(env(DB), '#ZZZ999', hook), /unknown_clan/);
  await assert.rejects(saveChannel(env(DB), tow1, 'https://example.com/x'), /invalid_webhook/);
  assert.deepEqual(await channelStatus(env(DB)), []);
});

test('regravar substitui a URL antiga do mesmo clã', async () => {
  const DB = database();
  await saveChannel(env(DB), tow1, hook, 1000);
  const novo = 'https://discord.com/api/webhooks/999/novo_token';
  await saveChannel(env(DB), tow1, novo, 2000);
  assert.equal(await channelUrlFor(env(DB), tow1), novo);
  assert.equal((await channelStatus(env(DB))).length, 1);
});

test('o clã principal usa o segredo atual quando não há canal cadastrado', async () => {
  const DB = database();
  assert.equal(await channelUrlFor(env(DB, {DISCORD_WEBHOOK_URL: hook}), tow4), hook);
  assert.equal(await channelUrlFor(env(DB, {DISCORD_WEBHOOK_URL: hook}), tow1), null);
});

test('a listagem pública nunca inclui a URL do webhook', async () => {
  const DB = database();
  await saveChannel(env(DB), tow1, hook, 1000);
  const status = await channelStatus(env(DB));
  assert.deepEqual(status, [{clanTag: tow1, configured: true, updatedAt: 1000}]);
  assert.equal(JSON.stringify(status).includes('webhooks'), false);
});
