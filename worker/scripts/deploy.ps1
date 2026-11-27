$ErrorActionPreference = 'Stop'
Write-Host 'Shiraz Atlas Worker deployment' -ForegroundColor Green
if (-not (Test-Path '.\wrangler.toml')) { throw 'از پوشه worker اجرا کن؛ wrangler.toml پیدا نشد.' }
npx wrangler deploy --config .\wrangler.toml
if ($LASTEXITCODE -ne 0) { throw 'Deploy ناموفق بود.' }
Write-Host 'Worker deployed. Next: powershell -ExecutionPolicy Bypass -File .\scripts\set-webhook.ps1' -ForegroundColor Green
