# Meridian Phase 0 — DevNet bootstrap (5North Seaport)
param(
    [string]$KybGatewayUrl = "http://localhost:8090",
    [switch]$SkipDarUpload,
    [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root

if (-not (Test-Path ".env")) {
    Write-Error "Missing .env — copy .env.example and set DEVNET_CLIENT_SECRET"
}

Write-Host "=== Meridian DevNet Bootstrap ===" -ForegroundColor Cyan

# Optional: start KYB + provisioner if not running
$kybRunning = $false
try {
    Invoke-RestMethod -Uri "$KybGatewayUrl/health" -TimeoutSec 2 | Out-Null
    $kybRunning = $true
} catch {}

if (-not $kybRunning) {
    Write-Host "Starting KYB gateway and party provisioner..."
    $env:KYB_GATEWAY_URL = $KybGatewayUrl
    Start-Process -PassThru -WindowStyle Hidden -FilePath "node" -ArgumentList "services/kyb-gateway/dist/index.js" -WorkingDirectory $Root | Out-Null
    Start-Sleep -Seconds 2
    Start-Process -PassThru -WindowStyle Hidden -FilePath "node" -ArgumentList "services/party-provisioner/dist/index.js" -WorkingDirectory $Root | Out-Null
    Start-Sleep -Seconds 2
}

Write-Host "Allocating DevNet personas..."
npx --yes pnpm@9.15.0 allocate:devnet
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipDarUpload) {
    Write-Host "Uploading DAR to Seaport..."
    npx --yes pnpm@9.15.0 upload:dar:devnet
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $SkipVerify) {
    Write-Host "Verifying Phase 0 exit criteria..."
    & "$Root/infra/scripts/verify-devnet.ps1"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "DevNet bootstrap complete." -ForegroundColor Green
