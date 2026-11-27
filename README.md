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
    <img src="https://img.shields.io/badge/Version-1.1.0-8b7cff?style=flat-square">
    <img src="https://img.shields.io/badge/Frontend-GitHub%20Pages-181717?style=flat-square&logo=github">
    <img src="https://img.shields.io/badge/API-Cloudflare%20Workers-F38020?style=flat-square&logo=cloudflare">
    <img src="https://img.shields.io/badge/Map-Leaflet%20%2B%20OSM-72b85a?style=flat-square">
    <img src="https://img.shields.io/badge/Bot-Telegram-229ED9?style=flat-square&logo=telegram">
    <img src="https://img.shields.io/badge/Data-Private%20GitHub%20Repo-16a34a?style=flat-square&logo=github">
    <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square">
  </p>
</div>

---

## ✨ Overview

**Shiraz Atlas** is a map-first personal discovery and trip journal for Shiraz, Iran. Save favorite places, organize them with categories and flexible tags, explore nearby spots, estimate routes, record visits, and visualize your exploration footprint.

The public GitHub Pages frontend talks to a Cloudflare Worker. The Worker is the only trusted gateway to the private data repository and Telegram Bot API.

## 🚀 Features

| Module | Capabilities |
|---|---|
| 🗺️ Interactive atlas | Leaflet map, place markers, route overlays, category/tag filters |
| 📍 Place library | Create, edit, delete, coordinates, images, entry fees, estimated costs, ratings and notes |
| 🏷️ Organization | Editable categories and independent tags; starter tags include دوستانه، پشتو، تاریک، Skybit |
| 🧭 Route journal | Route coordinates, distance estimate, travel mode, quality and private notes |
| ✅ Visit journal | Visit history, date, quality, duration and private notes |
| 📊 Exploration analytics | Visit totals, route distance and approximate grid coverage |
| 🎲 Discovery | Random destination, nearby OpenStreetMap discovery and search |
| 🌤️ Context | Destination weather and route preview |
| 🤖 Telegram UX | Inline keyboards, quick actions, location sharing, admin menu and command shortcuts |
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
| `/add` / `/edit` / `/delete` | 🔐 Place administration |
| `/visit` / `/route` | ✅ Record visits and routes |
| `/stats` | 📊 Private statistics |
| `/test` | 🧪 Service health checks |
| `/admins` / `/adminadd` / `/adminremove` | 👑 Owner-only admin management |

Send a Telegram Location or coordinates such as `29.722356, 52.470975` or DMS coordinates to quickly save a place (admins only). Full Persian command reference: [`botfather-commands.txt`](botfather-commands.txt).

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
