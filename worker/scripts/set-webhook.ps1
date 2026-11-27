$ErrorActionPreference = 'Stop'

if (-not (Test-Path '.\wrangler.toml')) {
    throw 'Run this script from the Worker directory; wrangler.toml was not found.'
}
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw 'Node.js/npm (npx) was not found. Install Node.js LTS and reopen PowerShell.'
}

function Read-SecretValue([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    if ($null -eq $secure -or $secure.Length -eq 0) { return '' }
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

function New-WebhookSecret {
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] 36
    try {
        $rng.GetBytes($bytes)
        return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    }
    finally {
        $rng.Dispose()
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
}

Write-Host "`nShiraz Atlas - Telegram Webhook Setup`n" -ForegroundColor Green
$botToken = Read-SecretValue 'Enter the Telegram bot token'
if ([string]::IsNullOrWhiteSpace($botToken)) { throw 'Telegram bot token cannot be empty.' }
if ($botToken -notmatch '^\d+:[A-Za-z0-9_-]{20,}$') { throw 'Telegram bot token format is invalid.' }

$workerUrl = 'https://shiraz-atlas.game-developer-mb.workers.dev/telegram/webhook'
$webhookSecret = New-WebhookSecret

Write-Host 'Saving the shared webhook secret to Cloudflare...' -ForegroundColor Cyan
$webhookSecret | & npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --config .\wrangler.toml
if ($LASTEXITCODE -ne 0) { throw 'Could not save TELEGRAM_WEBHOOK_SECRET in Cloudflare.' }

# Persian descriptions are intentional. This file is saved as UTF-8 with BOM
# so Windows PowerShell 5.1 reads these strings correctly.
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
    @{ command = 'duplicates'; description = 'اسکن و ادغام مکان‌های تکراری (ادمین)' },
    @{ command = 'categoryadd'; description = 'افزودن دسته‌بندی (فقط ادمین)' },
    @{ command = 'tagadd'; description = 'افزودن برچسب (فقط ادمین)' },
    @{ command = 'test'; description = 'تست سلامت پروژه (ادمین)' },
    @{ command = 'admins'; description = 'فهرست ادمین‌ها (مالک)' },
    @{ command = 'adminadd'; description = 'افزودن ادمین (مالک)' },
    @{ command = 'adminremove'; description = 'حذف ادمین (مالک)' }
)

$webhookBody = @{
    url = $workerUrl
    secret_token = $webhookSecret
    allowed_updates = @('message', 'callback_query', 'edited_message')
    drop_pending_updates = $false
    max_connections = 20
}
$webhookJson = $webhookBody | ConvertTo-Json -Depth 8 -Compress
$webhookResponse = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$botToken/setWebhook" -ContentType 'application/json; charset=utf-8' -Body $webhookJson
if (-not $webhookResponse.ok) { throw "Telegram setWebhook failed: $($webhookResponse.description)" }

$commandsJson = @{ commands = $commands } | ConvertTo-Json -Depth 8 -Compress
$commandsResponse = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$botToken/setMyCommands" -ContentType 'application/json; charset=utf-8' -Body $commandsJson
if (-not $commandsResponse.ok) {
    Write-Warning "Webhook is configured, but setMyCommands failed: $($commandsResponse.description)"
}

$info = Invoke-RestMethod -Method Get -Uri "https://api.telegram.org/bot$botToken/getWebhookInfo"
Write-Host "`nWebhook result:`n" -ForegroundColor Green
$info.result | Select-Object url, has_custom_certificate, pending_update_count, max_connections, last_error_date, last_error_message | Format-List
if ($info.result.url -ne $workerUrl) { throw 'Webhook URL does not match the expected Worker URL.' }

Write-Host 'Webhook and bot command menu configured successfully.' -ForegroundColor Green
$botToken = $null
$webhookSecret = $null
