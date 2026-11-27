<div align="center">
  <img src="assets/atlas-avatar.png" width="104" alt="Shiraz Atlas logo">
  <h1>🧭 Shiraz Atlas</h1>
  <p><strong>اطلس هوشمند گشت‌وگذار، کشف مکان‌ها و ثبت مسیرهای شیراز</strong></p>
  <p>Discover places · Plan escapes · Remember every route</p>
  <img src="assets/atlas-banner.png" width="100%" alt="Shiraz Atlas banner">
  <p>
    <a href="https://mehrdadmb2.github.io/shiraz-atlas/"><img src="https://img.shields.io/badge/🌐_Live-GitHub_Pages-16b99d?style=for-the-badge" alt="Live site"></a>
    <a href="https://t.me/ShirazAtlasBot"><img src="https://img.shields.io/badge/🤖_Telegram-ShirazAtlasBot-229ED9?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram"></a>
    <a href="https://shiraz-atlas.game-developer-mb.workers.dev/api/health"><img src="https://img.shields.io/website?url=https%3A%2F%2Fshiraz-atlas.game-developer-mb.workers.dev%2Fapi%2Fhealth&label=API%20health&style=for-the-badge" alt="API health"></a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/Version-1.5.0-8b7cff?style=flat-square">
    <img src="https://img.shields.io/badge/Frontend-GitHub%20Pages-181717?style=flat-square&logo=github">
    <img src="https://img.shields.io/badge/API-Cloudflare%20Workers-F38020?style=flat-square&logo=cloudflare">
    <img src="https://img.shields.io/badge/Map-Leaflet%20%2B%20OSM-72b85a?style=flat-square">
    <img src="https://img.shields.io/badge/Offline-Visited%20tiles-16b99d?style=flat-square">
    <img src="https://img.shields.io/badge/Bot-Telegram-229ED9?style=flat-square&logo=telegram">
    <img src="https://img.shields.io/badge/Data-Private%20GitHub%20Repo-16a34a?style=flat-square&logo=github">
    <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square">
  </p>
</div>

---

## ✨ Overview

**Shiraz Atlas** is a map-first personal discovery and trip journal for Shiraz, Iran. Save favorite places, organize them with categories and flexible tags, explore nearby spots, estimate routes, record visits, and visualize your exploration footprint.

The public GitHub Pages frontend talks to a Cloudflare Worker. The Worker is the only trusted gateway to the private data repository and Telegram Bot API. The map uses a keyless OSM tile source with a documented fallback; the dark appearance is rendered locally. Weather data is served through the Worker cache and has a browser-side direct-source fallback.

## 🚀 Features

| Module | Capabilities |
|---|---|
| 🗺️ Interactive atlas | Leaflet map, keyless OSM base, automatic tile-source fallback, place markers, route overlays and category/tag filters |
| 📴 Offline resilience | Service Worker keeps the app shell and successfully viewed map tiles on the same device; no prohibited bulk tile prefetch |
| 📍 Place library | Create, edit, delete, coordinates, images, entry fees, estimated costs, ratings, notes and contact information |
| 🧹 Duplicate cleanup | Admin scan at 25m / 35m / 50m, duplicate warning on create/move, confirmed merge with visit-history reassignment |
| 🚶 Travel access | Classify places for walking, car, motorcycle, public transport and bicycle; filter the collection by access mode |
| 🏷️ Organization | Editable categories and independent tags; starter tags include دوستانه، پشتو، تاریک، Skybit |
| 🧭 Route journal | Route coordinates, distance estimate, travel mode, quality and private notes |
| ✅ Visit journal | Visit history, date, quality, duration and private notes |
| 📊 Exploration analytics | Visit totals, route distance and approximate grid coverage |
| 🎲 Discovery | Random destination, nearby OpenStreetMap discovery and search |
| 🌤️ Context | Current weather, feels-like temperature, humidity, wind, precipitation and three-day forecast; direct API fallback and last-known local data |
| 🤖 Telegram UX | Inline keyboards, quick actions, location sharing, admin menu and command shortcuts |
| ✏️ Telegram field editor | Choose a place and a field button, then send only its new value; no edit command or place ID required |
| 👥 Admin delegation | Owner can add/remove Telegram admins from the bot without editing code |
| 🧪 Diagnostics | `/test` and authenticated `/api/admin/diagnostics` inspect Worker configuration, private GitHub data and Telegram webhook |
| 🔐 Privacy | Website admin sessions, Telegram numeric-ID authorization, private-by-default trips and data isolation |

## 🧩 Architecture

```text
GitHub Pages (public frontend)
          │ HTTPS / JSON
          ▼
Cloudflare Worker ───────── Telegram Bot API
          │                 @ShirazAtlasBot
          ▼
Private GitHub repository
mehrdadmb2/shiraz-atlas-data
          └── atlas.json
```

- **Public repository:** `mehrdadmb2/shiraz-atlas` — frontend, Worker source, docs and workflows.
- **Private repository:** `mehrdadmb2/shiraz-atlas-data` — actual place and personal trip data.
- **Cloudflare Worker:** API, authentication, GitHub data access and Telegram webhook.

Never commit private data, access tokens, bot tokens, admin passwords or session secrets to the public repository.

## 🤖 Telegram quick start

Open [@ShirazAtlasBot](https://t.me/ShirazAtlasBot) and send `/start`. Use the inline buttons for places, random destination, categories, weather and the admin panel.

### Commands

| Command | Description |
|---|---|
| `/start` | 🧭 Main menu with inline buttons |
| `/help` | 📚 Persian help |
| `/myid` | 🪪 Numeric Telegram ID |
| `/places` / `/search` | 📍 Browse and search places |
| `/random` | 🎲 Random destination; optional category/tag |
| `/near lat,lng` | 📌 Nearby saved places |
| `/categories` / `/weather` | 🗂 Categories and 🌤 weather |
| `/add` / `/delete` | 🔐 Place administration |
| `/visit` / `/route` | ✅ Record visits and routes |
| `/stats` | 📊 Private statistics |
| `/test` | 🧪 Service health checks |
| `/admins` / `/adminadd` / `/adminremove` | 👑 Owner-only admin management |

Send a Telegram Location or coordinates such as `29.722356, 52.470975` or DMS coordinates to quickly save a place (admins only). For editing, open `/places`, tap a place, choose the field, and send the new value as a normal message. Full Persian command reference: [`botfather-commands.txt`](botfather-commands.txt).

### Admin delegation

The first ID in `TELEGRAM_ADMIN_IDS` is treated as the owner unless `TELEGRAM_OWNER_ID` is explicitly set. The owner can use:

```text
/admins
/adminadd 123456789
/adminremove 123456789
```

A delegated admin is stored in `meta.telegramAdmins` in the private `atlas.json`. Bootstrap IDs configured in `TELEGRAM_ADMIN_IDS` are not removable through bot commands; change that secret deliberately if needed. Only the owner can delegate access.

## 🧪 Diagnostics and logs

- Telegram: send `/test` or tap **🧪 تست سلامت پروژه**.
- Website/API: after admin login, request `GET /api/admin/diagnostics` with the session Bearer token.
- Worker logs: Cloudflare Dashboard → Workers & Pages → `shiraz-atlas` → **Logs / Observability**. Use `npx wrangler tail` for live logs.
- GitHub Pages deployment: repository → Actions → `Deploy Shiraz Atlas to GitHub Pages`.
- Private data health: diagnostics verifies the Worker can read and parse `atlas.json`; it does not perform a destructive write test.
- GitHub Actions workflow run details are not queried because the data token is intentionally scoped to the private data repository only. Check Actions run logs in GitHub UI.

## 🛠️ Deployment

See [`docs/DEPLOYMENT_FA.md`](docs/DEPLOYMENT_FA.md) for complete Windows PowerShell 5.1 steps, GitHub Fine-grained Token permissions, Cloudflare secrets, Wrangler deployment and webhook setup.

Useful commands from `worker/`:

```powershell
npm install
npm test
npx wrangler login
npx wrangler deploy --config .\wrangler.toml
npx wrangler tail --format pretty
.\scripts\set-webhook.ps1
```

## 🔒 Security and limitations

- Website writes require a signed, expiring admin session; the password and signing secret stay in Cloudflare.
- Telegram authorization uses numeric `from.id`, never the mutable username.
- Admin delegation is owner-only. The first bootstrap admin is the owner by default.
- Private places, visit notes and private routes are excluded from public API responses.
- The single JSON file is suitable for a personal/small-group project. High-frequency GPS tracking or concurrent writes should move to Cloudflare D1 or another transactional store.
- Route estimates and weather depend on public third-party services; they are not guaranteed real-time navigation or emergency services.
- Exploration coverage is an approximate configurable grid, not an official municipal-area statistic.

## 🔗 Links

- [Live website](https://mehrdadmb2.github.io/shiraz-atlas/)
- [Telegram bot](https://t.me/ShirazAtlasBot)
- [Worker health](https://shiraz-atlas.game-developer-mb.workers.dev/api/health)
- [Public source repository](https://github.com/mehrdadmb2/shiraz-atlas)
- [Private data repository](https://github.com/mehrdadmb2/shiraz-atlas-data)

## 📜 License

MIT for the project source. External map tiles, geographic data and weather services retain their own attribution and terms.


## 🗺️ Map reliability and offline behaviour

The old CARTO Dark Matter raster URL has been removed because CARTO basemaps now require an API key. Shiraz Atlas uses the standard OSM tile source and can switch to OpenTopoMap-R if the primary source repeatedly fails. The dark map theme is produced locally with a tile filter, so it does not need a second paid/keyed basemap.

The Service Worker stores the app shell, Leaflet runtime, the public map snapshot and only map tiles that a visitor has actually viewed, on that visitor's own browser/device. It does not download an entire city or commit third-party tiles into the repository. Private admin data is never stored in the public offline snapshot. The OSM tile policy prohibits bulk prefetching and offline tile archives from `tile.openstreetmap.org`; a shared repository snapshot therefore must be built from a separately licensed regional OSM data extract and a self-hosted tile pipeline. See [UPGRADE-1.2.0-FA.md](UPGRADE-1.2.0-FA.md).

## 🌤️ Weather fallback

The browser first asks the Cloudflare Worker for current conditions and a three-day forecast. If the Worker path fails, it makes a direct Open-Meteo request. The last successful response is retained locally for up to 12 hours, with a visible stale-data indicator. The card changes its atmosphere according to weather code, day/night, temperature, the Shiraz season and the local weekend.


## v1.4.0 · Duplicate cleanup & travel access

- Admin duplicate scan with 25m / 35m / 50m thresholds; merge keeps the best-populated canonical record and preserves visit history.
- Create/move duplicate warning with explicit confirmation.
- Per-place mobility access metadata: walking, car, motorcycle, public transport, bicycle.
- Telegram inline edit flow: tap a field and send only its new value.


## v1.4.0 — Duplicate cleanup & travel access

The admin site now includes **⟲ بررسی تکراری‌ها** with 25m / 35m / 50m thresholds. A merge keeps one canonical place, combines missing metadata and access tags, reassigns the duplicate's visit history, and removes the duplicate place records. New places and coordinate changes that overlap another saved place are blocked with a proximity warning until explicitly confirmed.

Each place can be labeled for **walking, car, motorcycle, public transport, and bicycle** access. Admins can filter the place list by these modes. Telegram admins use `/places` → place → **ویرایش جزئیات** → field button → send the value; the Worker stores a 15-minute per-admin edit session in the private data file.


## v1.4.0 — Place Profiles, Safer Cleanup & Cyberpunk Terrain

- Every place card opens a full place profile with all fields, including explicit “not set” values.
- Admins can edit the complete profile and save through the Worker; the GitHub token remains server-side.
- `/duplicates` in Telegram and the admin inline menu scan the full place collection. Each merge requires a second explicit confirmation.
- Duplicate groups use complete-link distance checks; the Worker independently validates every merge and remaps visit history.
- Blank/generic new place names receive a cautious OpenStreetMap reverse-name suggestion only when a named POI is returned within 65 metres. Uncertain pins remain “مکان بدون نام”.
- New cyberpunk topographic background artwork lives in `assets/cyber-topography.webp`.
- Telegram place summaries use structured HTML, blockquotes, and monospace coordinates / IDs.

### GitHub token permissions

Create a Fine-grained PAT scoped only to the private `shiraz-atlas-data` repository, with **Contents: Read and write** and Metadata read-only. Store it as the Cloudflare Worker secret `GITHUB_TOKEN`. Never place it in `js/config.js`, GitHub Pages, HTML, or a public repository. The website writes through the authenticated Worker API only.


## v1.5.0 — Telegram, GitHub diagnostics & edit-flow fixes

- Fixed the `peditmenu:` off-by-one ID parsing bug.
- Compact UUID callback references keep Telegram `callback_data` within its 64-byte limit; callback payloads are validated before sending.
- `/adminadd` and `/adminremove` support interactive ID entry; `/cancel` clears pending admin/edit sessions.
- GitHub diagnostics use raw GitHub for public source checks and the correct private repository metadata endpoint.
- GitHub Pages place edit actions are visible to visitors and prompt for the website admin password when needed.
- Automatic naming now falls back from Nominatim to a bounded Overpass named-POI search; existing unnamed places can be checked individually from the Telegram edit menu.
- GitHub Actions run Worker regression tests and frontend JavaScript syntax checks before Pages deployment.

See [UPGRADE-1.5.0-FA.md](UPGRADE-1.5.0-FA.md) for deployment and token permissions.


## v1.5.0 · Reliability & interaction fixes

- Fixed Telegram edit callback ID parsing and compacted UUID callback references to respect Telegram's 64-byte limit.
- Added interactive `/adminadd` and `/adminremove` flows.
- Repaired GitHub diagnostics and improved actionable 401/403/404 write errors.
- Exposed edit entry points on every GitHub Pages place card; admin login is prompted when required.
- Added Nominatim → Overpass fallback for nearby named POIs and per-place re-detection in Telegram.
- Added regression tests and frontend syntax checks to GitHub Actions.

See [UPGRADE-1.5.0-FA.md](UPGRADE-1.5.0-FA.md).
