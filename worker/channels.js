import { findClan } from '../public/clans.js';

// A URL do webhook é uma credencial: nunca é devolvida por nenhuma rota pública.
const WEBHOOK = /^https:\/\/discord\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+$/;
export const isWebhookUrl = value => typeof value === 'string' && WEBHOOK.test(value);

// Canal do clã cadastrado no banco; o clã principal mantém o segredo DISCORD_WEBHOOK_URL como alternativa.
export async function channelUrlFor(env, clanTag) {
  const row = await env.DB.prepare('SELECT webhook_url FROM alert_channels WHERE clan_tag = ?').bind(clanTag).first();
  if (row?.webhook_url) return row.webhook_url;
  return clanTag === env.CLAN_TAG ? (env.DISCORD_WEBHOOK_URL || null) : null;
}

export async function saveChannel(env, clanTag, webhookUrl, now = Date.now()) {
  if (!findClan(clanTag)) throw new Error('unknown_clan');
  if (!isWebhookUrl(webhookUrl)) throw new Error('invalid_webhook');
  await env.DB.prepare('INSERT INTO alert_channels(clan_tag,webhook_url,updated_at) VALUES (?,?,?) ON CONFLICT(clan_tag) DO UPDATE SET webhook_url=excluded.webhook_url, updated_at=excluded.updated_at')
    .bind(clanTag, webhookUrl, now).run();
  return {clanTag, configured: true, updatedAt: now};
}

// Lista quais clãs têm canal, sem revelar as URLs.
export async function channelStatus(env) {
  const rows = await env.DB.prepare('SELECT clan_tag, updated_at FROM alert_channels ORDER BY clan_tag').all();
  return rows.results.map(r => ({clanTag: r.clan_tag, configured: true, updatedAt: r.updated_at}));
}
