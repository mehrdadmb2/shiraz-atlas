# Shiraz Atlas Worker v1.2.0

Cloudflare Worker API + Telegram webhook.

## Local verification
```powershell
npm install
npm test
npx wrangler dev
```

## Deploy
```powershell
npx wrangler login
npx wrangler deploy --config .\wrangler.toml
```

## Live logs
```powershell
npx wrangler tail --format pretty
```

## Telegram admin delegation
The first ID in `TELEGRAM_ADMIN_IDS` is the owner by default (or set `TELEGRAM_OWNER_ID`). The owner uses `/adminadd ID`, `/admins`, and `/adminremove ID`. Delegated IDs are persisted in private `atlas.json` under `meta.telegramAdmins`.

## Diagnostics
Use Telegram `/test` or `GET /api/admin/diagnostics` with a valid website admin session. Checks are read-only; they do not create a test commit or mutate production data.

## Weather endpoint
`GET /api/weather?lat=...&lng=...` returns current conditions and three forecast days. Valid responses use Cloudflare edge caching (15 minutes) and browser caching (5 minutes). The website has a direct Open-Meteo fallback if the Worker request fails.

Secrets: `TELEGRAM_BOT_TOKEN`, `GITHUB_TOKEN`, `TELEGRAM_ADMIN_IDS`, `TELEGRAM_OWNER_ID`, `WEB_ADMIN_PASSWORD`, `SESSION_SECRET`, `TELEGRAM_WEBHOOK_SECRET`.
