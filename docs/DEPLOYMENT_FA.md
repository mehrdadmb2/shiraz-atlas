# راهنمای نصب و عملیاتی‌سازی Shiraz Atlas (Windows / PowerShell)

این راهنما برای ریپوی عمومی `mehrdadmb2/shiraz-atlas`، Worker با نام `shiraz-atlas` و ربات `@ShirazAtlasBot` تنظیم شده است.

## 0) نکته امنیتی قبل از شروع

ریپوی `shiraz-atlas` عمومی است. مسیرهای روزانه، مکان‌های خصوصی و یادداشت‌های شخصی نباید در آن ذخیره شوند. فایل اصلی داده باید در ریپوی خصوصی جداگانه قرار بگیرد:

`mehrdadmb2/shiraz-atlas-data` (Private)

Worker به این ریپو وصل می‌شود و سایت عمومی فقط داده‌های عمومی را از API می‌گیرد. فایل seed خصوصی را از بسته جداگانه `Shiraz-Atlas-Private-Data-Seed.zip` استخراج کن.

## 1) آماده‌کردن ریپوی خصوصی داده

1. در GitHub یک New repository بساز.
2. نام: `shiraz-atlas-data`
3. حتماً **Private** را انتخاب کن.
4. شاخه پیش‌فرض را `main` بگذار.
5. از بسته seed، فایل `atlas.json` را در ریشه این ریپو آپلود کن؛ مسیر نهایی باید دقیقاً این باشد:

   `https://github.com/mehrdadmb2/shiraz-atlas-data/blob/main/atlas.json`

6. فایل را به ریپوی عمومی `shiraz-atlas` منتقل یا کپی نکن.

## 2) آپلود فایل‌های سایت به ریپوی عمومی

محتویات داخل ZIP اصلی را در ریشه `mehrdadmb2/shiraz-atlas` قرار بده؛ یعنی `index.html` باید در ریشه باشد، نه در یک پوشه تو در تو مثل `shiraz-atlas-release/index.html`.

اگر از Git در ویندوز استفاده می‌کنی:

```powershell
cd $HOME\Documents\GitHub\shiraz-atlas
# فایل‌های بسته را در همین پوشه Extract کن و در صورت درخواست فایل‌های نسخه جدید را جایگزین کن.
git status
git add .
git commit -m "Build Shiraz Atlas v1.0"
git push origin main
```

قبل از `git add` مطمئن شو فایل seed خصوصی را وارد پوشه عمومی نکرده‌ای. اگر پوشه `private-data` یا فایل حاوی داده شخصی می‌بینی، آن را از ریپوی عمومی حذف کن.

### فعال‌سازی GitHub Pages

1. وارد Settings ریپو شو.
2. بخش **Pages** را باز کن.
3. در قسمت Build and deployment، Source را روی **GitHub Actions** قرار بده.
4. به Actions برو و Workflow با نام `Deploy Shiraz Atlas to GitHub Pages` را بررسی کن.
5. بعد از اجرای موفق، سایت در این آدرس در دسترس خواهد بود:

   `https://mehrdadmb2.github.io/shiraz-atlas/`

Workflow با هر Push روی `main` سایت را دوباره منتشر می‌کند.

## 3) ساخت Fine-grained GitHub Token

این Token فقط برای نوشتن `atlas.json` در ریپوی خصوصی استفاده می‌شود.

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
2. Generate new token را بزن.
3. Token name: `shiraz-atlas-worker`.
4. Resource owner: `mehrdadmb2`.
5. Repository access: **Only select repositories** و فقط `shiraz-atlas-data` را انتخاب کن.
6. Repository permissions:
   - **Contents: Read and write**
   - Metadata معمولاً به‌صورت Read-only اجباری است.
7. برای این Worker نیازی به دسترسی به ریپوی عمومی سایت یا Issues/Actions نیست.
8. Token را بساز و همان لحظه کپی کن؛ بعداً مقدار کامل آن قابل مشاهده نیست.

## 4) آماده‌سازی Cloudflare Wrangler

Node.js نسخه LTS را نصب کن. PowerShell را باز کن و به پوشه `worker` برو. مسیر را متناسب با محل Extract خودت تغییر بده:

```powershell
cd "$HOME\Downloads\shiraz-atlas-release\worker"
node --version
npm --version
npm install
npm test
npx wrangler --version
npx wrangler login
npx wrangler whoami
```

**مهم:** مطمئن شو Wrangler به همان حساب Cloudflare متصل است که Worker فعلی `shiraz-atlas.game-developer-mb.workers.dev` را دارد. مقدار `name = "shiraz-atlas"` در `wrangler.toml` باعث می‌شود Deploy نسخه جدید Worker با همین نام را به‌روزرسانی کند.

در `worker/wrangler.toml` این مقادیر از قبل تنظیم شده‌اند:

- `GITHUB_OWNER = "mehrdadmb2"`
- `GITHUB_DATA_REPO = "shiraz-atlas-data"`
- `GITHUB_BRANCH = "main"`
- `GITHUB_DATA_PATH = "atlas.json"`
- `SITE_ORIGIN = "https://mehrdadmb2.github.io"`
- `PUBLIC_SITE_URL = "https://mehrdadmb2.github.io/shiraz-atlas/"`

اگر نام ریپوی خصوصی یا آدرس سایت را عوض کردی، همین متغیرها را تغییر بده.

### نکته مهم برای Windows PowerShell 5.1

اسکریپت‌های PowerShell این نسخه با UTF-8 BOM ذخیره شده‌اند تا خطای `Unexpected token` ناشی از خواندن متن فارسی با کدگذاری ANSI رخ ندهد. اگر نسخه قبلی ZIP را استخراج کرده‌ای، فایل‌های داخل `worker\scripts` را با نسخه جدید جایگزین کن. خطای Parser با `Set-ExecutionPolicy` برطرف نمی‌شود؛ این دستور فقط اجرای اسکریپت را مجاز می‌کند و مشکل Encoding را حل نمی‌کند.

## 5) تنظیم Secretهای Cloudflare

در همان پوشه `worker`:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\set-secrets.ps1
```

اسکریپت این موارد را از تو می‌گیرد و با Wrangler به‌صورت Secret ذخیره می‌کند:

| Secret | مقدار |
|---|---|
| `TELEGRAM_BOT_TOKEN` | توکن BotFather |
| `GITHUB_TOKEN` | Fine-grained PAT ریپوی خصوصی داده |
| `TELEGRAM_ADMIN_IDS` | شناسه عددی ادمین‌ها، با کاما جدا شده |
| `WEB_ADMIN_PASSWORD` | رمز ورود پنل سایت؛ هر طول و کاراکتری قابل قبول است |
| `SESSION_SECRET` | خودکار تولید می‌شود؛ برای امضای نشست ادمین |

اگر هنوز شناسه عددی تلگرام را نمی‌دانی، هنگام اجرای اسکریپت فیلد شناسه را خالی بگذار. موقتاً مقدار `0` تنظیم می‌شود؛ بعد از راه‌اندازی وب‌هوک و گرفتن شناسه واقعی، آن را جایگزین کن.

Secretها در `wrangler.toml` یا JavaScript سایت قرار نمی‌گیرند. آن‌ها را در GitHub Commit نکن.

## 6) Deploy کردن Worker

```powershell
npx wrangler deploy --config .\wrangler.toml
```

یا:

```powershell
.\scripts\deploy.ps1
```

بعد از Deploy این آدرس را باز کن:

`https://shiraz-atlas.game-developer-mb.workers.dev/api/health`

پاسخ مورد انتظار، JSON با `"ok": true` است. برای اتصال کامل باید `dataConfigured` نیز `true` باشد. `botConfigured` بعد از تنظیم وب‌هوک و Secret تلگرام `true` می‌شود.

اگر `dataConfigured` برابر false است، Secret یا متغیرهای GitHub ناقص‌اند. اگر خطای `atlas.json not found` دیدی، مطمئن شو فایل seed را در ریشه ریپوی خصوصی قرار داده‌ای.

## 7) تنظیم خودکار Webhook و منوی ربات

پس از Deploy موفق Worker، در پوشه `worker` اجرا کن:

```powershell
.\scripts\set-webhook.ps1
```

اسکریپت:

1. توکن ربات را به‌صورت ورودی امن می‌گیرد.
2. یک `TELEGRAM_WEBHOOK_SECRET` تصادفی و امن تولید می‌کند.
3. آن را با Wrangler در Cloudflare ذخیره می‌کند.
4. همان مقدار را در Telegram `setWebhook` ثبت می‌کند.
5. منوی فرمان‌ها را با `setMyCommands` تنظیم می‌کند.
6. با `getWebhookInfo` آدرس وب‌هوک را بررسی می‌کند.

آدرس وب‌هوک این پروژه:

`https://shiraz-atlas.game-developer-mb.workers.dev/telegram/webhook`

لازم نیست Webhook را دستی با مرورگر ست کنی. اسکریپت دقیقاً secret یکسان را در دو طرف تنظیم می‌کند.

## 8) گرفتن شناسه عددی ادمین تلگرام

1. در تلگرام ربات `@ShirazAtlasBot` را باز کن.
2. `/start` و سپس `/myid` را بفرست.
3. ربات یک عدد مانند `123456789` برمی‌گرداند. این عدد شناسه عددی واقعی حساب تلگرام است؛ Username جایگزین آن نیست.
4. در PowerShell پوشه Worker اجرا کن:

```powershell
npx wrangler secret put TELEGRAM_ADMIN_IDS --config .\wrangler.toml
```

وقتی Wrangler مقدار خواست، شناسه عددی را وارد کن. برای چند ادمین، شناسه‌ها را با کاما جدا کن:

```text
123456789,987654321
```

این تغییر Secret فوری اعمال می‌شود و Deploy مجدد لازم نیست.

## 9) تست نهایی

### تست API

```powershell
Invoke-RestMethod "https://shiraz-atlas.game-developer-mb.workers.dev/api/health"
Invoke-RestMethod "https://shiraz-atlas.game-developer-mb.workers.dev/api/state"
```

`/api/state` باید JSON عمومی را برگرداند. بازدیدها و مسیرهای خصوصی در آن وجود ندارند؛ فقط مسیرهایی که ادمین صراحتاً عمومی کرده باشد، بدون یادداشت شخصی برگردانده می‌شوند.

### تست تلگرام

```text
/start
/help
/myid
/places
/categories
/weather
/random
```

برای تست ذخیره مکان (فقط ادمین):

```text
/add نقطه آزمایشی | 29.722356, 52.470975 | کشف ناشناخته | 0 | تست اتصال Shiraz Atlas
```

همچنین می‌توانی مختصات را مستقیم ارسال کنی:

```text
29.722356, 52.470975
```

فرمت DMS هم پشتیبانی می‌شود:

```text
29°43'20.5"N 52°28'15.5"E
```

برای ویرایش سریع و بدون کامند (روش پیشنهادی نسخه 1.3.0):

1. `/places` را بفرست و مکان را با دکمه انتخاب کن.
2. دکمه «🛠 ویرایش جزئیات این مکان» را بزن.
3. فیلد موردنظر مثل «✏️ نام مکان» یا «🗂 دسته‌بندی» را انتخاب کن.
4. فقط مقدار جدید را به‌صورت پیام عادی ارسال کن؛ نیازی به شناسه یا دستور نیست.
5. برای لغو `/cancel` را بفرست. نشست ویرایش پس از ۱۵ دقیقه منقضی می‌شود.

دستور قدیمی `/edit` برای سازگاری عقب‌رو همچنان پشتیبانی می‌شود:

```text
/edit PLACE_ID | name=نام جدید | fee=50000 | tags=دوستانه,Skybit | description=توضیحات جدید
```

برای شناسایی و ادغام مکان‌های نزدیک، پس از ورود به سایت روی «⟲ بررسی تکراری‌ها» بزن. آستانه را روی ۲۵، ۳۵ یا ۵۰ متر قرار بده؛ گروه‌ها را بررسی و ادغام را جداگانه تأیید کن. رکورد اصلی نگه داشته می‌شود، بازدیدها منتقل می‌شوند و اگر یکی از رکوردها خصوصی باشد، رکورد نهایی خصوصی می‌ماند.

برای ثبت بازدید:

```text
/visit PLACE_ID | good | مسیر خلوت بود و منظره عالی بود
```

برای ثبت مسیر با دو یا چند نقطه:

```text
/route مسیر جمعه | good | 29.722356,52.470975;29.725000,52.480000;29.730000,52.490000 | مسیر خوب و کم‌ترافیک
```

ربات برای حذف، دکمه تأیید می‌فرستد. نام کاربری تلگرام به‌تنهایی دسترسی ادمین نمی‌دهد؛ فقط شناسه عددی داخل `TELEGRAM_ADMIN_IDS` معتبر است.

## 10) تست پنل وب

1. GitHub Pages را باز کن.
2. دکمه «ورود ادمین» را انتخاب کن.
3. مقدار `WEB_ADMIN_PASSWORD` را وارد کن.
4. یک مکان آزمایشی بساز، ویرایش کن و حذف کن.
5. یک بازدید ثبت کن.
6. از نقشه حالت ثبت مسیر را شروع کن، حداقل دو نقطه انتخاب کن و ذخیره کن.
7. با خروج از ادمین، مسیرها و بازدیدهای خصوصی نباید در نمای عمومی دیده شوند.

## 11) عیب‌یابی

### `Failed to fetch` در سایت

- `API_BASE_URL` در `js/config.js` باید همین Worker باشد.
- `ALLOWED_ORIGINS` باید شامل `https://mehrdadmb2.github.io` باشد (بدون مسیر `/shiraz-atlas/`).
- Worker را دوباره Deploy کن.
- از `https://...workers.dev/api/health` وضعیت را بررسی کن.

### `atlas.json not found`

فایل باید در ریشه ریپوی خصوصی `shiraz-atlas-data` و روی شاخه `main` باشد؛ نام فایل حتماً `atlas.json` باشد.

### GitHub API خطای 401 یا 403 می‌دهد

- Token منقضی یا لغو نشده باشد.
- Resource owner درست باشد.
- دسترسی `Contents: Read and write` به همان ریپوی خصوصی انتخاب شده باشد.
- Token اشتباهی از نوع classic یا محدود به ریپوی دیگری نباشد.

### ربات جواب نمی‌دهد

```powershell
# وضعیت وب‌هوک را با اسکریپت set-webhook بررسی کن یا در Bot API getWebhookInfo را اجرا کن.
```

مطمئن شو `TELEGRAM_BOT_TOKEN` و `TELEGRAM_WEBHOOK_SECRET` در Worker ثبت شده‌اند و `setWebhook` به همین آدرس اشاره می‌کند. بعد از تغییر توکن ربات، هر دو مرحله Secret و Webhook را دوباره انجام بده.

### ربات می‌گوید ادمین نیستی

`/myid` را بفرست و مقدار دقیق عددی را در `TELEGRAM_ADMIN_IDS` قرار بده. شناسه عددی است، نه `@username`.

### ذخیره هم‌زمان دو تغییر

Worker برای تداخل SHA در GitHub سه تلاش محدود انجام می‌دهد. اگر ترافیک نوشتن زیاد شود، محدودیت GitHub Contents API و تک‌فایلی بودن JSON می‌تواند گلوگاه شود. برای این مرحله معماری D1 مناسب‌تر است.

---

**نکته:** این نسخه برای استفاده شخصی و شروع عملیاتی طراحی شده است. قبل از انتشار عمومی گسترده، سرویس‌های عمومی نقشه/مسیریابی را با سرویس پایدارتر یا کلید اختصاصی جایگزین کن.


## 12) اندازه فایل و مقیاس‌پذیری

در نسخه اول، تمام داده‌ها در `atlas.json` ذخیره می‌شوند و Worker سقف عملیاتی ۸۵۰ کیلوبایت را قبل از Commit کنترل می‌کند. دلیل این حاشیه اطمینان، محدودیت GitHub Contents API است: در فایل‌های بزرگ‌تر از ۱ مگابایت، فیلد `content` در پاسخ API خالی می‌شود. اگر تاریخچه GPS طولانی شد، مسیرهای قدیمی را Export و بایگانی کن یا قبل از نزدیک شدن به سقف، ذخیره‌سازی را به Cloudflare D1 منتقل کن.


## 8) ارتقای نسخه 1.1 و مدیریت ادمین‌های تلگرام

بعد از جایگزینی Worker نسخه 1.1 و Deploy:
- اولین شناسه در `TELEGRAM_ADMIN_IDS` مالک اصلی محسوب می‌شود.
- برای صراحت بیشتر، می‌توانی Secret مستقل `TELEGRAM_OWNER_ID` را با همان شناسه تنظیم کنی:
  `npx wrangler secret put TELEGRAM_OWNER_ID --config .\wrangler.toml`
- در ربات `/start` را بزن تا منوی دکمه‌ای جدید نمایش داده شود.
- کاربر جدید `/myid` را می‌فرستد؛ مالک با `/adminadd USER_ID` او را اضافه می‌کند.
- `/admins` فهرست را نشان می‌دهد و `/adminremove USER_ID` دسترسی واگذارشده را حذف می‌کند.
- شناسه‌های bootstrap که در `TELEGRAM_ADMIN_IDS` هستند با فرمان ربات حذف نمی‌شوند.

## 9) تست سلامت و مشاهده لاگ

در ربات `/test` را بفرست. گزارش شامل تنظیمات Worker، دسترسی API به ریپوی عمومی سورس، پاسخ GitHub Pages، خواندن ریپوی خصوصی، ساختار JSON، Telegram Bot API و Webhook است. تست غیرمخرب است و چیزی در ریپو نمی‌نویسد.

برای مشاهده لاگ زنده:

```powershell
npx wrangler tail --format pretty
```

یا Cloudflare Dashboard → Workers & Pages → `shiraz-atlas` → Logs / Observability.

برای تست API از مرورگر:
- عمومی: `https://shiraz-atlas.game-developer-mb.workers.dev/api/health`
- خصوصی: `GET /api/admin/diagnostics` همراه هدر `Authorization: Bearer <admin-session>`؛ این نشست از ورود پنل سایت دریافت می‌شود.

توجه: Worker نمی‌تواند وضعیت اجرای GitHub Actions یا دسترسی اکانت GitHub Pages را از این گزارش با قطعیت بررسی کند؛ برای آن‌ها GitHub → Actions را بررسی کن.
