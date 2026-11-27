$ErrorActionPreference = 'Stop'

if (-not (Test-Path '.\wrangler.toml')) {
    throw 'Run this script from the Worker directory; wrangler.toml was not found.'
}
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw 'Node.js/npm (npx) was not found. Install Node.js LTS and reopen PowerShell.'
}

Write-Host 'Deploying Shiraz Atlas Worker...' -ForegroundColor Green
& npx wrangler deploy --config .\wrangler.toml
if ($LASTEXITCODE -ne 0) { throw 'Worker deployment failed. Review the Wrangler output.' }

Write-Host 'Worker deployed successfully.' -ForegroundColor Green
Write-Host 'Next step: .\scripts\set-webhook.ps1' -ForegroundColor Yellow
