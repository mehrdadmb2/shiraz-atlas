$ErrorActionPreference = 'Stop'

function Read-SecretValue([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Set-WranglerSecret([string]$Name, [string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { throw "مقدار $Name خالی است." }
    Write-Host "Setting Cloudflare secret: $Name" -ForegroundColor Cyan
    @($Value) | & npx wrangler secret put $Name --config .\wrangler.toml
    if ($LASTEXITCODE -ne 0) { throw "تنظیم $Name ناموفق بود. خروجی Wrangler را بررسی کن." }
}

Write-Host "`nShiraz Atlas · Cloudflare Worker Secrets`n" -ForegroundColor Green
Write-Host "این اسکریپت مقدارهای حساس را در فایل ذخیره نمی‌کند. آن‌ها به‌صورت مستقیم به Wrangler فرستاده می‌شوند.`n"

$telegramToken = Read-SecretValue 'Telegram Bot Token را از BotFather وارد کن'
$githubToken = Read-SecretValue 'GitHub Fine-grained PAT با دسترسی Contents R/W به ریپوی خصوصی shiraz-atlas-data'
$adminIds = Read-Host 'شناسه عددی ادمین‌های تلگرام را با کاما جدا کن؛ اگر هنوز نمی‌دانی خالی بگذار و بعداً با دستور Wrangler تنظیم کن'
$adminPassword = Read-SecretValue 'رمز ورود پنل وب را وارد کن (هر طول و کاراکتر مجاز است)'

if ([string]::IsNullOrWhiteSpace($adminIds)) { $adminIds = '0'; Write-Warning 'فعلاً شناسه ادمین روی 0 تنظیم می‌شود؛ بعد از ست شدن Webhook دستور /myid را به ربات بفرست و مقدار واقعی را تنظیم کن.' }
if ($adminIds -notmatch '^\s*\d+(\s*[,; ]\s*\d+)*\s*$') { throw 'فهرست TELEGRAM_ADMIN_IDS باید فقط شناسه‌های عددی و جداکننده کاما/فاصله داشته باشد.' }
if ([string]::IsNullOrWhiteSpace($adminPassword)) { throw 'رمز ورود پنل وب نمی‌تواند خالی باشد.' }
if ($githubToken.Length -lt 20) { throw 'GitHub token کوتاه یا نامعتبر به نظر می‌رسد.' }
if ($telegramToken -notmatch '^\d+:[A-Za-z0-9_-]{20,}$') { Write-Warning 'قالب توکن تلگرام غیرمعمول است؛ مقدار را در صورت لزوم بررسی کن.' }

try {
    Set-WranglerSecret 'TELEGRAM_BOT_TOKEN' $telegramToken
    Set-WranglerSecret 'GITHUB_TOKEN' $githubToken
    Set-WranglerSecret 'TELEGRAM_ADMIN_IDS' ($adminIds -replace '[; ]+', ',')
    Set-WranglerSecret 'WEB_ADMIN_PASSWORD' $adminPassword

    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] 48
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $sessionSecret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
    Set-WranglerSecret 'SESSION_SECRET' $sessionSecret
    [Array]::Clear($bytes, 0, $bytes.Length)

    Write-Host "`nتمام Secretهای اصلی تنظیم شدند." -ForegroundColor Green
    Write-Host 'مرحله بعد: از همین پوشه دستور npx wrangler deploy را اجرا کن؛ سپس scripts\set-webhook.ps1 را اجرا کن.' -ForegroundColor Yellow
}
finally {
    $telegramToken = $null; $githubToken = $null; $adminPassword = $null; $sessionSecret = $null
}
