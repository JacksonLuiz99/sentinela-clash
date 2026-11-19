# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Node >=22.13 (CI uses Node 24). Dependencies: `npm ci`.

- `npm test` — runs all `node:test` suites in `test/`.
- Single file: `node --test test/monitor.test.js`
- Single test: `node --test --test-name-pattern "<test name>" test/monitor.test.js`
- `npm run check` — `node --check` over a hand-maintained list in `package.json`. A new JS module is **not** syntax-checked unless you add it to that list.
- `npm run build` — copies `public/` to `dist/` and writes `dist/config.js`. `PUBLIC_API_BASE` must be an `https://*.workers.dev` origin with no trailing slash, or the build throws. Without it the build still succeeds, but the panel shows setup instructions.
- `npm run dev` — `wrangler dev` on port 8787, serving the API and static assets. Run `npm run db:local` first to create the local D1 schema. Needs `.dev.vars` (copy from `.dev.vars.example`).
- `npm run db:local` / `npm run db:remote` — apply `migrations/` to local or remote D1.
- `npm run deploy:worker` — deploys the Worker. Pushing to GitHub does **not** deploy the Worker; Vercel only publishes the static panel.
- `npm run connection:test` — checks the Clash API token against the clan.
- `node scripts/setup-push.mjs` and `node scripts/setup-leadership.mjs` — generate and upload the VAPID and leadership secrets. Don't run them without reading the README sections first, since rotating VAPID keys invalidates existing push subscriptions.

## Architecture

**Two deployables.** The Cloudflare Worker (`worker/index.js`, entry `wrangler.jsonc`) is both the API and the data collector. It also serves `public/` through the `ASSETS` binding, with `/api/*` set to run first. The Vercel project deploys the static `dist/` build of `public/` and has no server code. `vercel.json` holds the CSP, which allows `connect-src` only to `https://*.workers.dev`, and the legacy-domain redirect. If the Worker host changes, update the CSP too.

**Worker entry points.** `worker/index.js` exports `route()` for `fetch` and a `scheduled()` handler that branches on `controller.cron`:
- `*/5 * * * *` runs `synchronize()` in `worker/monitor.js` for the primary clan (`CLAN_TAG`, TOW 4). It then calls `recordPrimarySummary()` and `collectPrimaryPush()`.
- `* * * * *` runs `synchronizeFamily()` in `worker/family.js` for one of the other 15 clans per minute, chosen by the UTC minute modulo 15. It then enqueues and delivers push notifications.

**Collection and storage.** The only code that calls the Clash API is the collection path (`clash()` in `monitor.js`). It goes through the RoyaleAPI proxy, and `CLASH_API_BASE` is restricted to an allowlist. Results are written to D1: `state` is a key/value table holding JSON, and `wars`, `events`, `snapshots`, `deliveries` and the management tables hold the rest. Public GET routes only read D1. Refreshing the browser never triggers a Clash API call. `/api/sync` (POST, `ADMIN_TOKEN`) is the manual trigger.

**Pure logic is shared.** `worker/events.js` (event detection, pending attacks, war orientation, game time) is used by both the collector and the tests. `public/clans.js` and `public/stats.js` are also imported by the Worker, so the catalog and links live in one place for both sides.

**Alert channels.** Discord is the only alert channel, sent from `monitor.js`. They use a `deliveries` retry queue, with at most four attempts per collection. Web Push (`worker/push.js`) is a separate path with its own D1 queue, validates the war again before sending, processes three jobs per minute, and removes subscriptions the push service reports as expired. Keep the two paths independent: a push failure must not block the main collection.

**Auth.** `authorized()` in `worker/index.js` compares SHA-256 digests of the Bearer token in constant time. `LEADERSHIP_TOKEN` guards the POST routes in `worker/management.js`, and `ADMIN_TOKEN` guards `/api/sync`. Push operations use a per-browser credential. Secrets are set with `wrangler secret put` and never go to Vercel or the browser.

**Frontend.** `public/` is vanilla browser JavaScript with no framework and no bundler. `index.html` loads one script and stylesheet per feature, and `app.js` coordinates them. Preferences live in localStorage under the keys `tigers-display` and `tigers-last-clan`. `public/sw.js` caches only the offline page. It must never cache `/api/` responses or war data. When the offline assets or icons change, bump the cache name (`tigers-offline-v1`).

**Clan configuration lives in two places.** The primary clan tag is `CLAN_TAG` in `wrangler.jsonc` and `#R0UPVVVY` in `scripts/build.mjs`. Keep them in sync when the primary clan changes.

**Tests** use real in-memory SQLite (`node:sqlite`) built from `migrations/`, plus mocked `fetch`. They do not send real messages.

## Gotchas

- Changes to `worker/` need `npm run deploy:worker`. Changes to `public/` need a push to GitHub, and the Vercel build runs `npm run build`.
- Every visible change needs a `public/releases.js` entry, as `AGENTS.md` requires. Entries are written in Portuguese, plain language, newest first.
- Any new migration must be applied with `db:remote` before the Worker that depends on it is deployed.
