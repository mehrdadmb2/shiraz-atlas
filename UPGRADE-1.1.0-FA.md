# Shiraz Atlas 1.1.0 — Upgrade Notes

## What changed
- Telegram `/start` and `/help` now expose inline keyboard navigation.
- Added admin panel buttons for quick place creation, stats, help and diagnostics.
- Added owner-only `/admins`, `/adminadd ID`, `/adminremove ID`.
- Delegated Telegram admin IDs persist in private `atlas.json` (`meta.telegramAdmins`), no code edit or Cloudflare secret rotation needed for future additions.
- First ID in `TELEGRAM_ADMIN_IDS` is owner by default; optional `TELEGRAM_OWNER_ID` overrides it.
- Added `/test`, authenticated `GET /api/admin/diagnostics`, and a website admin diagnostics button.
- Diagnostics checks Worker secret presence, public source repository, GitHub Pages response, private data read/JSON shape, Telegram Bot API and webhook status.
- Structured diagnostic and webhook error logs are written to Worker console.
- Refreshed visual motion/depth styles, accessibility focus states and reduced-motion support.
- Rebuilt README with feature, architecture, security and operational badges.

## Safe upgrade
1. Backup private `atlas.json` before deploying.
2. Replace the public repo files with this release; do not copy any private data into the public repo.
3. Deploy `worker/` with `npx wrangler deploy --config .\wrangler.toml`.
4. Run `scripts/set-webhook.ps1` only if you need to refresh webhook/command menu. It generates a new webhook secret and stores it as a Cloudflare Secret.
5. Send `/start` to the bot. The first bootstrap admin ID is the owner. Owner can add another user by asking them to send `/myid`, then running `/adminadd USER_ID`.
6. Use `/test`; view live logs with `npx wrangler tail --format pretty`.

## Important
The diagnostic is read-only: it does not write a fake record to production data. GitHub Actions workflow run details are intentionally not fetched because the GitHub token is scoped to the private data repository; inspect workflow runs in GitHub → Actions. Cloudflare logs are read from the Cloudflare dashboard or Wrangler tail, not scraped through the bot.
