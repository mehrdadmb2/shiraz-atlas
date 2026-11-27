$ErrorActionPreference = 'Stop'

function Read-SecretValue([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function New-WebhookSecret {
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] 36
    $rng.GetBytes($bytes); $rng.Dispose()
    $value = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
    [Array]::Clear($bytes, 0, $bytes.Length)
    return $value
}

Write-Host "`nShiraz Atlas · Telegram Webhook Setup`n" -ForegroundColor Green
$botToken = Read-SecretValue 'توکن ربات تلگرام را وارد کن'
if ($botToken -notmatch '^\d+:[A-Za-z0-9_-]{20,}$') { throw 'قالب توکن تلگرام معتبر نیست.' }
$workerUrl = 'https://shiraz-atlas.game-developer-mb.workers.dev/telegram/webhook'
$webhookSecret = New-WebhookSecret

Write-Host 'در حال ثبت secret مشترک بین Cloudflare و Telegram...' -ForegroundColor Cyan
@($webhookSecret) | & npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --config .\wrangler.toml
if ($LASTEXITCODE -ne 0) { throw 'ذخیره TELEGRAM_WEBHOOK_SECRET در Cloudflare ناموفق بود.' }

$commands = @(
    @{ command = 'start'; description = 'شروع و معرفی ربات' },
    @{ command = 'help'; description = 'راهنمای کامل دستورات' },
    @{ command = 'myid'; description = 'نمایش شناسه عددی تلگرام' },
    @{ command = 'places'; description = 'نمایش مکان‌های ذخیره‌شده' },
    @{ command = 'search'; description = 'جست‌وجو در مکان‌ها' },
    @{ command = 'random'; description = 'انتخاب مقصد تصادفی' },
    @{ command = 'near'; description = 'مکان‌های نزدیک مختصات' },
    @{ command = 'categories'; description = 'نمایش دسته‌بندی‌ها و برچسب‌ها' },
    @{ command = 'weather'; description = 'وضعیت هوا در مقصد' },
    @{ command = 'add'; description = 'افزودن مکان (فقط ادمین)' },
    @{ command = 'edit'; description = 'ویرایش مکان (فقط ادمین)' },
    @{ command = 'delete'; description = 'حذف مکان (فقط ادمین)' },
    @{ command = 'visit'; description = 'ثبت بازدید (فقط ادمین)' },
    @{ command = 'route'; description = 'ثبت مسیر (فقط ادمین)' },
    @{ command = 'stats'; description = 'آمار خصوصی اطلس (فقط ادمین)' },
    @{ command = 'categoryadd'; description = 'افزودن دسته‌بندی (فقط ادمین)' },
    @{ command = 'tagadd'; description = 'افزودن برچسب (فقط ادمین)' }
)

$webhookBody = @{
    url = $workerUrl
    secret_token = $webhookSecret
    allowed_updates = @('message', 'callback_query', 'edited_message')
    drop_pending_updates = $false
    max_connections = 20
}
$webhookResponse = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$botToken/setWebhook" -ContentType 'application/json' -Body ($webhookBody | ConvertTo-Json -Depth 8 -Compress)
if (-not $webhookResponse.ok) { throw "Telegram setWebhook failed: $($webhookResponse.description)" }

$commandsResponse = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$botToken/setMyCommands" -ContentType 'application/json' -Body (@{ commands = $commands } | ConvertTo-Json -Depth 8 -Compress)
if (-not $commandsResponse.ok) { Write-Warning "Webhook ست شد اما setMyCommands موفق نبود: $($commandsResponse.description)" }

$info = Invoke-RestMethod -Method Get -Uri "https://api.telegram.org/bot$botToken/getWebhookInfo"
Write-Host "`nWebhook result:" -ForegroundColor Green
$info.result | Select-Object url, has_custom_certificate, pending_update_count, max_connections, last_error_date, last_error_message | Format-List
if ($info.result.url -ne $workerUrl) { throw 'آدرس Webhook با آدرس مورد انتظار تطابق ندارد.' }
Write-Host 'Webhook و منوی دستورات تنظیم شدند. توکن و secret در فایل نوشته نشدند.' -ForegroundColor Green
$botToken = $null; $webhookSecret = $null
