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

function Set-WranglerSecret([string]$Name, [string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "The value for $Name cannot be empty."
    }

    Write-Host "Setting Cloudflare secret: $Name" -ForegroundColor Cyan
    # Wrangler reads the secret value from stdin. No secret is written to a local file.
    $Value | & npx wrangler secret put $Name --config .\wrangler.toml
    if ($LASTEXITCODE -ne 0) {
        throw "Setting $Name failed. Check the Wrangler output and try again."
    }
}

Write-Host "`nShiraz Atlas - Cloudflare Worker Secrets`n" -ForegroundColor Green
Write-Host 'Sensitive values are entered as secure prompts and are not saved in this folder.'

$telegramToken = Read-SecretValue 'Enter the Telegram BotFather token'
$githubToken = Read-SecretValue 'Enter the GitHub Fine-grained token (Contents read/write on private shiraz-atlas-data only)'
$adminIds = Read-Host 'Enter Telegram numeric admin IDs separated by commas. Leave blank to configure later.'
$adminPassword = Read-SecretValue 'Enter the website admin password (any non-empty length and characters)'

if ([string]::IsNullOrWhiteSpace($telegramToken)) { throw 'Telegram bot token cannot be empty.' }
if ([string]::IsNullOrWhiteSpace($githubToken)) { throw 'GitHub token cannot be empty.' }
if ([string]::IsNullOrWhiteSpace($adminPassword)) { throw 'Website admin password cannot be empty.' }

if ([string]::IsNullOrWhiteSpace($adminIds)) {
    $adminIds = '0'
    Write-Warning 'No Telegram admin ID supplied. Admin ID is temporarily set to 0. After webhook setup, send /myid to the bot and configure the real ID.'
}
if ($adminIds -notmatch '^\s*\d+(\s*[,; ]\s*\d+)*\s*$') {
    throw 'TELEGRAM_ADMIN_IDS must contain numeric IDs separated by commas, semicolons, or spaces.'
}
if ($githubToken.Length -lt 20) {
    throw 'The GitHub token looks too short. Check that you copied the complete token.'
}
if ($telegramToken -notmatch '^\d+:[A-Za-z0-9_-]{20,}$') {
    Write-Warning 'The Telegram token format looks unusual. Verify it before continuing.'
}

$sessionSecret = $null
$bytes = $null
try {
    Set-WranglerSecret 'TELEGRAM_BOT_TOKEN' $telegramToken
    Set-WranglerSecret 'GITHUB_TOKEN' $githubToken
    Set-WranglerSecret 'TELEGRAM_ADMIN_IDS' ($adminIds -replace '[; ]+', ',')
    Set-WranglerSecret 'WEB_ADMIN_PASSWORD' $adminPassword

    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] 48
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $sessionSecret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    Set-WranglerSecret 'SESSION_SECRET' $sessionSecret

    Write-Host "`nAll required Cloudflare secrets have been configured." -ForegroundColor Green
    Write-Host 'Next: run .\scripts\deploy.ps1, then .\scripts\set-webhook.ps1.' -ForegroundColor Yellow
}
finally {
    if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    $telegramToken = $null
    $githubToken = $null
    $adminPassword = $null
    $sessionSecret = $null
}
