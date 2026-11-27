<div align="center">
  <img src="assets/atlas-avatar.png" width="100" alt="Shiraz Atlas logo">
  <h1>Shiraz Atlas</h1>
  <p><b>اطلس شخصی گشت‌وگذار شیراز</b></p>
  <p>Discover Shiraz. Save places. Trace every journey.</p>
  <img src="assets/atlas-banner.png" alt="Shiraz Atlas banner" width="100%">
  <p>
    <a href="https://mehrdadmb2.github.io/shiraz-atlas/">🌐 Website</a> ·
    <a href="https://t.me/ShirazAtlasBot">🤖 Telegram Bot</a> ·
    <a href="https://shiraz-atlas.game-developer-mb.workers.dev/api/health">☁️ API Health</a>
  </p>
</div>

---

## درباره پروژه

**Shiraz Atlas** یک اطلس شخصی و نقشه‌محور برای کشف مکان‌ها، نگه‌داری مقصدهای موردعلاقه، برنامه‌ریزی گردش و ثبت تاریخچه بازدید و مسیرهای پیموده‌شده است. سایت روی GitHub Pages اجرا می‌شود؛ Cloudflare Worker تمام عملیات API و ربات تلگرام را مدیریت می‌کند و اطلاعات اصلی در یک فایل JSON داخل ریپوی خصوصی GitHub ذخیره می‌شوند.

### امکانات نسخه 1.0

- نقشه تعاملی شیراز با نشانگر مکان‌ها، فیلتر دسته‌بندی و برچسب و نقشه روشن/تاریک.
- ثبت مکان از سایت یا ربات با مختصات اعشاری، DMS و لینک‌های متداول نقشه.
- اطلاعات قابل ویرایش: نام، دسته‌بندی، توضیحات، آدرس، ورودی، هزینه تقریبی، امتیاز، بهترین زمان مراجعه، تلفن، وب‌سایت، تصویر، برچسب و یادداشت خصوصی.
- برچسب‌های مستقل و قابل تنظیم؛ مقادیر اولیه `دوستانه`، `پشتو`، `تاریک` و `Skybit`.
- ثبت بازدید با ارزیابی خوب، نرمال یا بد و یادداشت شخصی.
- ترسیم مسیر روی نقشه یا ضبط نقطه‌های GPS تا وقتی صفحه باز است؛ ثبت نوع حرکت، کیفیت و توضیحات.
- نمایش مسیرهای ثبت‌شده روی نقشه و محاسبه تخمینی پوشش شبکه‌ای محدوده گشت.
- نمایش فاصله مستقیم از موقعیت فعلی و پیش‌نمایش مسیر رانندگی با مسافت و زمان تخمینی؛ مسیریابی زنده و ترافیک از طریق Google Maps.
- پیشنهاد مکان‌های نزدیک از OpenStreetMap با جست‌وجوی دستی و شعاع قابل انتخاب.
- هواشناسی مقصد از Open-Meteo.
- انتخاب مقصد تصادفی با فیلتر دسته‌بندی/برچسب.
- کنترل دسترسی سایت با رمز ادمین و کنترل دسترسی ربات با شناسه عددی تلگرام.
- تلاش مجدد محدود هنگام تداخل نوشتن هم‌زمان در فایل GitHub و ثبت تاریخچه تغییرات در commitها.

## معماری

```text
GitHub Pages (public static frontend)
              │ HTTPS / JSON API
              ▼
Cloudflare Worker (API + Telegram webhook)
       │                     │
       ▼                     ▼
Private GitHub repo      Telegram Bot
shiraz-atlas-data        @ShirazAtlasBot
       │
       └── atlas.json (single source of truth)
```

**مهم:** ریپوی فعلی `mehrdadmb2/shiraz-atlas` عمومی است. مسیرهای شخصی و تاریخچه بازدید نباید در آن قرار بگیرند. فایل `atlas.json` را فقط در ریپوی خصوصی `mehrdadmb2/shiraz-atlas-data` قرار بده. Worker تنها بخش واسطی است که با GitHub Token به آن ریپو دسترسی دارد.

## ساختار فایل‌ها

```text
shiraz-atlas/
├── index.html
├── assets/
│   ├── atlas-avatar.png
│   ├── atlas-banner.png
│   ├── atlas-mark.svg
│   └── atlas-banner.svg
├── css/styles.css
├── js/
│   ├── config.js
│   ├── utils.js
│   ├── api.js
│   ├── map.js
│   └── app.js
├── docs/
│   ├── DEPLOYMENT_FA.md
│   ├── BOT_SETUP_FA.md
│   └── DATA_SCHEMA.md
├── .github/workflows/pages.yml
├── worker/
│   ├── wrangler.toml
│   ├── package.json
│   ├── README.md
│   ├── src/index.js
│   ├── tests/smoke.test.js
│   └── scripts/
│       ├── deploy.ps1
│       ├── set-secrets.ps1
│       └── set-webhook.ps1
├── botfather-commands.txt
└── README.md
```

فایل seed خصوصی در بسته جداگانه‌ای با نام `Shiraz-Atlas-Private-Data-Seed.zip` تحویل داده می‌شود؛ آن را به ریپوی عمومی اضافه نکن.

## شروع سریع

راهنمای کامل ویندوز، GitHub Pages، ساخت ریپوی خصوصی، Fine-grained PAT، نصب Worker، Secretها و Webhook در [docs/DEPLOYMENT_FA.md](docs/DEPLOYMENT_FA.md) قرار دارد. راهنمای تنظیم نام، توضیحات و عکس ربات در [docs/BOT_SETUP_FA.md](docs/BOT_SETUP_FA.md) و جزئیات مدل داده در [docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md) است.

برای تست محلی Worker و سناریوهای حریم خصوصی/احراز هویت: وارد پوشه `worker` شو، `npm install` و سپس `npm test` را اجرا کن. این تست از Mockهای GitHub و Telegram استفاده می‌کند و توکن واقعی لازم ندارد.

### آدرس‌ها

- Repository: https://github.com/mehrdadmb2/shiraz-atlas
- Pages: https://mehrdadmb2.github.io/shiraz-atlas/
- Worker API: https://shiraz-atlas.game-developer-mb.workers.dev
- Telegram: https://t.me/ShirazAtlasBot

### Endpointهای Worker

| Method | Endpoint | کاربرد |
|---|---|---|
| GET | `/api/health` | وضعیت Worker و تنظیمات ضروری |
| GET | `/api/state` | داده عمومی و مکان‌های عمومی |
| GET | `/api/admin/state` | تمام داده‌ها با نشست ادمین |
| POST | `/api/auth/login` | ورود با رمز ادمین سایت |
| POST | `/api/auth/logout` | خروج سمت کلاینت |
| POST | `/api/admin/mutate` | عملیات نوشتن/ویرایش/حذف با نشست معتبر |
| GET | `/api/discover?lat=...&lng=...&radius=3000` | کشف مکان‌های اطراف از OSM |
| GET | `/api/weather?lat=...&lng=...` | هواشناسی مختصات |
| GET | `/api/route?fromLat=...&fromLng=...&toLat=...&toLng=...&mode=driving` | پیش‌نمایش مسیر خودرو |
| POST | `/telegram/webhook` | دریافت Updateهای تلگرام با secret header |

## حریم خصوصی و محدودیت‌ها

- مکان‌هایی که `visibility: "private"` دارند فقط در نشست ادمین نمایش داده می‌شوند.
- مسیرها و بازدیدها به‌صورت پیش‌فرض خصوصی هستند؛ فقط مسیرهایی که ادمین صراحتاً عمومی کند روی نقشه عمومی نمایش داده می‌شوند و یادداشت شخصی آن‌ها حذف می‌شود. تاریخچه بازدید همچنان خصوصی است.
- رمز سایت، توکن ربات، GitHub PAT، فهرست ادمین‌ها، کلید نشست و secret وب‌هوک فقط در Cloudflare Secrets نگه‌داری می‌شوند.
- فایل داده در هر تغییر با GitHub Contents API ذخیره می‌شود؛ مناسب استفاده شخصی و تعداد کم مدیران است، نه ثبت GPS پرتعداد یا نوشتن هم‌زمان گسترده. برای توسعه پرترافیک، مهاجرت داده‌ها به Cloudflare D1/SQLite پیشنهاد می‌شود. در این نسخه برای جلوگیری از رسیدن به محدودیت دریافت محتوای GitHub، سقف عملیاتی فایل ۸۵۰ کیلوبایت است و Worker قبل از نوشتن آن را کنترل می‌کند.
- محدوده فعلی «پوشش گشت» یک محدوده شبکه‌ای قابل تنظیم است و مرز رسمی شهرداری شیراز نیست؛ درصد آن تخمینی است.
- پیش‌نمایش مسیر داخل نقشه در این نسخه برای خودرو و متکی به سرور عمومی OSRM است. برای پیاده‌روی/دوچرخه و مسیریابی با ترافیک زنده، لینک Google Maps باز می‌شود.
- داده‌های OpenStreetMap ممکن است ناقص یا قدیمی باشند؛ ساعت کاری، قیمت و وضعیت باز بودن از روی OSM تضمین نمی‌شود.

## منابع و مجوزها

- Leaflet 1.9.4 برای نقشه؛ OpenStreetMap و CARTO برای کاشی‌های نقشه.
- کشف مکان‌ها از OpenStreetMap/Overpass؛ استفاده محدود و درخواستی، بدون دانلود انبوه.
- هواشناسی از Open-Meteo؛ استفاده رایگان آن برای استفاده غیرتجاری و با انتساب منبع است.
- مسیر خودرو از نمونه عمومی OSRM؛ سرویس best-effort است و برای ترافیک لحظه‌ای مناسب نیست.

کد پروژه با MIT License ارائه می‌شود. مجوز داده‌های نقشه و سرویس‌های بیرونی مستقل است؛ انتساب منبع باید حفظ شود.
