# Shiraz Atlas Worker — راهنمای سریع

این پوشه شامل Cloudflare Worker، API سایت و Telegram webhook است.

## پیش‌نیازها

- Node.js LTS و npm
- حساب Cloudflare با دسترسی به Worker فعلی `shiraz-atlas`
- GitHub Fine-grained PAT فقط برای ریپوی خصوصی `mehrdadmb2/shiraz-atlas-data` با دسترسی `Contents: Read and write`
- توکن BotFather برای `@ShirazAtlasBot`

## نصب و تست

در PowerShell از همین پوشه اجرا کن:

```powershell
npm install
npm test
npx wrangler login
npx wrangler whoami
```

## Secretها

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\set-secrets.ps1
```

اسکریپت، توکن تلگرام، PAT، شناسه‌های عددی ادمین و رمز پنل وب را می‌گیرد و `SESSION_SECRET` تصادفی می‌سازد. اگر هنوز شناسه تلگرام را نمی‌دانی، فیلد را خالی بگذار؛ بعد از راه‌اندازی با `/myid` شناسه را بگیر و `TELEGRAM_ADMIN_IDS` را جداگانه تنظیم کن.

## Deploy و Webhook

```powershell
npx wrangler deploy --config .\wrangler.toml
.\scripts\set-webhook.ps1
```

Webhook به این مسیر تنظیم می‌شود:

`https://shiraz-atlas.game-developer-mb.workers.dev/telegram/webhook`

## مقدارهای ثابت

`wrangler.toml` از قبل این موارد را تنظیم کرده است:

- `GITHUB_OWNER=mehrdadmb2`
- `GITHUB_DATA_REPO=shiraz-atlas-data`
- `GITHUB_BRANCH=main`
- `GITHUB_DATA_PATH=atlas.json`
- `PUBLIC_SITE_URL=https://mehrdadmb2.github.io/shiraz-atlas/`

فایل `atlas.json` باید در ریشه ریپوی خصوصی باشد. هرگز آن را در ریپوی عمومی Pages قرار نده.

برای راهنمای مرحله‌به‌مرحله، اسکریپت‌ها، عیب‌یابی و تست نهایی، فایل `docs/DEPLOYMENT_FA.md` در بسته کامل پروژه را بخوان.
