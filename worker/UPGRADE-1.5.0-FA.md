# راهنمای ارتقا به Shiraz Atlas v1.5.0

این نسخه روی آرشیو v1.4.0 ارسالی ساخته شده و باگ‌های مشخص‌شده در تلگرام، اتصال GitHub و ورود/ویرایش سایت را اصلاح می‌کند.

## باگ‌های اصلاح‌شده

### 1) دکمهٔ ویرایش تلگرام: مکان پیدا نشد
در نسخهٔ قبلی، پردازش `peditmenu:` از `slice(9)` استفاده می‌کرد، درحالی‌که طول پیشوند ۱۰ کاراکتر است. در نتیجه `:` ابتدای شناسه باقی می‌ماند و جست‌وجوی مکان شکست می‌خورد. در نسخهٔ جدید طول پیشوند از خود رشته گرفته می‌شود و برای دکمه‌های جدید از قالب کوتاه `pm:` استفاده می‌شود.

### 2) BUTTON_DATA_INVALID
تلگرام برای `callback_data` سقف ۶۴ بایت دارد. شناسه‌های UUID به شکل فشرده و Base64URL کوتاه می‌شوند. دکمه‌های ویرایش، نمایش مکان و ادغام از این شناسهٔ فشرده استفاده می‌کنند. Worker پیش از ارسال پیام، تمام callback_dataها را کنترل می‌کند و در صورت عبور از سقف، خطای قابل‌فهم ثبت می‌کند.
دکمه‌های قدیمی `pview:`, `peditmenu:`, `pef:`, `dconfirm:` و `dmerge:` نیز برای سازگاری پردازش می‌شوند.

### 3) مدیریت ادمین مرحله‌ای
اکنون هر دو حالت معتبرند:
- `/adminadd 381200758`
- ارسال `/adminadd` و سپس ارسال شناسهٔ عددی در پیام بعدی

برای حذف نیز `/adminremove` و سپس شناسه قابل استفاده است. نشست ورودی حداکثر ۵ دقیقه اعتبار دارد و `/cancel` آن را لغو می‌کند. فقط مالک اصلی می‌تواند ادمین اضافه یا حذف کند. شناسهٔ عددی را با `/myid` دریافت کن.

### 4) خطاهای Diagnostics گیت‌هاب
- بررسی ریپوی عمومی از `raw.githubusercontent.com` انجام می‌شود تا محدودیت نرخ REST API عمومی باعث 403 کاذب نشود.
- بررسی ریپوی خصوصی از endpoint درست `/repos/{owner}/{repo}` استفاده می‌کند؛ در نسخهٔ قبلی اسلش انتهایی باعث 404 کاذب می‌شد.
- وضعیت دسترسی ریپو و نقش Push جداگانه نمایش داده می‌شوند.
- توجه: API گیت‌هاب اجازه نمی‌دهد مجوز دقیق Contents یک Fine-grained token را صرفاً با خواندن metadata اثبات کنیم. مجوز نهایی نوشتن هنگام اولین ذخیرهٔ واقعی مشخص می‌شود. خطاهای 401/403/404 اکنون راهنمای دقیق دارند.

### 5) ویرایش در GitHub Pages
دکمهٔ «ویرایش» برای همهٔ کارت‌ها قابل مشاهده است. اگر مدیر وارد نشده باشد، کلیک روی آن پنجرهٔ ورود را باز می‌کند. پس از ورود با رمز `WEB_ADMIN_PASSWORD`، ویرایش کامل در دسترس است. دکمهٔ ویرایش پروفایل مکان نیز همیشه قابل مشاهده است.
**GitHub Token برای ورود کاربر نیست.** توکن فقط در Cloudflare Worker به‌صورت Secret ذخیره می‌شود. سایت از رمز ادمین برای ساخت نشست امن استفاده می‌کند.

### 6) نام‌گذاری خودکار
برای مکان جدید بدون نام:
1. ابتدا Reverse Geocoding در Nominatim انجام می‌شود.
2. اگر نتیجهٔ قابل‌اعتماد نبود، جست‌وجوی محدود POIهای نام‌دار در Overpass اجرا می‌شود.
3. فقط عارضهٔ نام‌دار حداکثر تا ۶۵ متر پیشنهاد می‌شود؛ فاصله و منبع نام ثبت می‌شوند.
4. در منوی ویرایش تلگرام دکمهٔ «تشخیص نام از مختصات» اضافه شده تا مکان‌های قدیمی را تک‌به‌تک بررسی کنی.

این قابلیت به داده‌های OpenStreetMap وابسته است؛ اگر مکان در OSM نام‌گذاری نشده باشد، شبکه به سرویس دسترسی نداشته باشد یا درخواست محدود شود، نام حدس زده نمی‌شود. برای جلوگیری از نام اشتباه، نام‌گذاری انبوه و اجباری انجام نمی‌شود.

## GitHub Token صحیح

در GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens:

- Resource owner: `mehrdadmb2`
- Repository access: فقط `shiraz-atlas-data`
- Repository permissions:
  - Metadata: Read-only
  - Contents: Read and write

توکن را فقط به‌عنوان Cloudflare Worker Secret با نام `GITHUB_TOKEN` ذخیره کن. آن را در `index.html`، فایل‌های JavaScript، GitHub Actions یا ریپوی عمومی قرار نده.

اگر فقط لازم است Secret توکن را عوض کنی، از پوشهٔ `worker` اجرا کن:

```powershell
npx wrangler secret put GITHUB_TOKEN --config .\wrangler.toml
```

رمز ورود سایت مستقل است:

```powershell
npx wrangler secret put WEB_ADMIN_PASSWORD --config .\wrangler.toml
```

برای تنظیم مالک اصلی:

```powershell
npx wrangler secret put TELEGRAM_OWNER_ID --config .\wrangler.toml
```

مقدار `TELEGRAM_OWNER_ID` باید شناسهٔ عددی مالک اصلی باشد. اگر این Secret تنظیم نشده باشد، اولین شناسه در `TELEGRAM_ADMIN_IDS` مالک اصلی محسوب می‌شود.

**برای این ارتقا `set-secrets.ps1` را اجرا نکن** مگر اینکه عمداً بخواهی تمام Secretها را دوباره تنظیم کنی؛ اجرای آن `SESSION_SECRET` را هم عوض می‌کند و نشست‌های فعلی سایت منقضی می‌شوند.

## نصب

1. از ریپوی عمومی و خصوصی، به‌ویژه `atlas.json`، نسخهٔ پشتیبان بگیر.
2. محتوای ZIP کامل را در ریشهٔ ریپوی عمومی جایگزین کن. `atlas.json` خصوصی را در ریپوی عمومی قرار نده.
3. پوش کن:

```powershell
git add .
git commit -m "Fix Shiraz Atlas v1.5.0 Telegram and GitHub workflows"
git push origin main
```

4. در Worker:

```powershell
cd .\worker
npm install
npm test
npx wrangler deploy --config .\wrangler.toml
```

5. پس از Deploy، ربات را آزمایش کن:
   - `/myid`
   - `/places`
   - دکمهٔ ✏️ ویرایش
   - تغییر نام با ارسال متن ساده
   - `/duplicates` و تأیید ادغام
   - `/adminadd` و ارسال شناسه در پیام بعدی
   - `/test`

## GitHub Actions

فایل `.github/workflows/pages.yml` قبل از انتشار Pages تست‌های Worker و بررسی syntax فایل‌های JavaScript را اجرا می‌کند. فایل `.github/workflows/worker-tests.yml` نیز تست‌ها را روی Push، Pull Request و اجرای دستی اجرا می‌کند.

این Actionها فقط تست و انتشار GitHub Pages را انجام می‌دهند؛ Cloudflare Worker همچنان با Wrangler Deploy می‌شود و به Secretهای GitHub Actions نیاز ندارد.

## پس از Deploy

گزارش `/test` باید این موارد را نشان دهد:
- Public source repository: خواندن README از raw GitHub
- GitHub data repository access: HTTP 200
- GitHub repository push role: `push=true`
- Private data repository: خواندن `atlas.json`

`push=true` نقش دسترسی حساب به ریپو را نشان می‌دهد، نه تضمین مجوز Contents توکن. یک تغییر کوچک و مجاز از سایت یا تلگرام انجام بده تا مجوز نوشتن توکن نیز در عمل تأیید شود.

در صورت خطا:
- 401: توکن نامعتبر یا منقضی
- 403: مجوز Contents باید Read and write باشد؛ دسترسی ریپو و SSO را بررسی کن
- 404: نام مالک/ریپو/شاخه/مسیر فایل یا انتخاب ریپو در Fine-grained token اشتباه است

لاگ زنده:

```powershell
npx wrangler tail --format pretty
```
