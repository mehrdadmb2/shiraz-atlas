# Shiraz Atlas Worker v1.5.0

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


## v1.4.0 duplicate and editor flows

- `GET /api/admin/duplicates?threshold=35` — authenticated spatial duplicate scan; threshold is clamped to 25–50 metres.
- `place.merge` — verified merge with visit history remapped to the canonical place.
- `place.create` / coordinate-changing `place.update` returns HTTP 409 `NEARBY_DUPLICATE` unless `confirmNearDuplicate: true` is supplied after admin confirmation.
- Telegram inline field editing uses `meta.telegramEditSessions`; sessions expire after 15 minutes.
- Each place supports `accessModes` and `accessNotes`.


## v1.4.0 — Place profile editing and duplicate scan

- Website detail profiles are public-safe; private notes appear only in authenticated admin state.
- All edits are sent to `POST /api/admin/mutate`; GitHub credentials never reach the browser.
- `/duplicates` scans all records with valid coordinates and presents one-by-one confirmed merge buttons.
- `GET /api/admin/name-suggestion` is authenticated and reverse-geocodes only on demand.
- The reverse-name helper accepts named POIs no farther than 65 metres; otherwise it leaves the place unnamed.

### GitHub token permission

The `GITHUB_TOKEN` Worker secret must be a Fine-grained PAT restricted to `shiraz-atlas-data` with **Contents: Read and write** and Metadata read-only. `/api/admin/diagnostics` now checks the repository's `permissions.push` flag. If this check fails, regenerate the token with the correct scope and update only the Worker secret.


## v1.5.0 — Telegram, GitHub diagnostics & edit-flow fixes

- Fixed the `peditmenu:` off-by-one ID parsing bug.
- Compact UUID callback references keep Telegram `callback_data` within its 64-byte limit; callback payloads are validated before sending.
- `/adminadd` and `/adminremove` support interactive ID entry; `/cancel` clears pending admin/edit sessions.
- GitHub diagnostics use raw GitHub for public source checks and the correct private repository metadata endpoint.
- GitHub Pages place edit actions are visible to visitors and prompt for the website admin password when needed.
- Automatic naming now falls back from Nominatim to a bounded Overpass named-POI search; existing unnamed places can be checked individually from the Telegram edit menu.
- GitHub Actions run Worker regression tests and frontend JavaScript syntax checks before Pages deployment.

See [UPGRADE-1.5.0-FA.md](UPGRADE-1.5.0-FA.md) for deployment and token permissions.


## v1.5.0 Reliability fixes

- Telegram callback payloads are compacted and validated against the 64-byte Bot API limit.
- Fixed edit menu ID slicing; supports legacy and compact callback formats.
- Interactive owner admin delegation and per-place OSM name re-detection.
- GitHub repository diagnostics no longer use the rate-limited unauthenticated REST endpoint for the public source repository.
- Improved GitHub write errors and OSM reverse-name fallback.
- Run `npm test` before deploy.

See `UPGRADE-1.5.0-FA.md` in the project root for the full deployment and GitHub token guide.
