# راهنمای Worker v1.4.0

## انتشار
```powershell
cd .\worker
npm install
npm test
npx wrangler deploy --config .\wrangler.toml
```

## GitHub Fine-grained token
- Repository access: فقط `mehrdadmb2/shiraz-atlas-data`
- Repository permissions: `Contents: Read and write`
- Metadata: Read-only
- Secret name در Cloudflare: `GITHUB_TOKEN`

اگر توکن فعلی همین مجوز را دارد، آن را دوباره نساز. در غیر این صورت:
```powershell
npx wrangler secret put GITHUB_TOKEN --config .\wrangler.toml
```
مقدار توکن را فقط در prompt Wrangler وارد کن. هرگز در فایل‌های سایت یا ریپوی عمومی قرار نده.

## قابلیت‌ها
- `/duplicates`: اسکن همه رکوردهای دارای مختصات معتبر و نمایش جفت‌های پیشنهادی برای ادغام.
- هر ادغام در تلگرام دو مرحله دارد: انتخاب ادغام و تأیید نهایی.
- صفحه سایت: کلیک روی کارت مکان → نمایه کامل → ویرایش تمام جزئیات → ذخیره.
- فیلدهای خالی هم در نمایه نمایش داده می‌شوند.
- تشخیص نام فقط برای مکان جدید بدون نام یا از دکمهٔ «تشخیص نام از روی مختصات» انجام می‌شود؛ فقط نام POI معتبر حداکثر ۶۵ متر پذیرفته می‌شود.
- نام‌های نامطمئن حدس زده نمی‌شوند.

## امنیت
GitHub token فقط در Worker secret نگهداری می‌شود. Frontend تنها از نشست ادمین و API Worker استفاده می‌کند.
