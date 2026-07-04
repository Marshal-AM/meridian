# PowerShell setup script for Meridian Phase 0 (Windows, DevNet)

param(
    [switch]$SkipDaml,
    [switch]$SkipServices,
    [switch]$SkipBootstrap
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Split-Path -Leaf $Root) -eq "scripts") { $Root = Split-Path -Parent $Root }
Set-Location $Root

Write-Host "=== Meridian Phase 0 Setup (DevNet) ===" -ForegroundColor Cyan

if (-not (Test-Path ".env")) {
    Write-Host "Copy .env.example to .env and set DEVNET_CLIENT_SECRET" -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
}

function Test-Wsl {
    try { wsl -e true 2>$null; return $LASTEXITCODE -eq 0 } catch { return $false }
}

Write-Host "Installing Node dependencies..."
npx --yes pnpm@9.15.0 install
npx --yes pnpm@9.15.0 build
npx --yes pnpm@9.15.0 test
Write-Host "TypeScript build and tests: OK" -ForegroundColor Green

if (-not $SkipDaml) {
    if (Test-Wsl) {
        Write-Host "Installing/building Daml via WSL..."
        $wslRoot = wsl -e wslpath -a $Root
        wsl -e bash -lc @"
set -e
export PATH=\"\$HOME/.dpm/bin:\$PATH\"
if ! command -v dpm >/dev/null 2>&1; then
  curl -fsSL https://get.digitalasset.com/install/install.sh | sh
  export PATH=\"\$HOME/.dpm/bin:\$PATH\"
fi
dpm install 3.4.11
cd '$wslRoot'/daml/packages/meridian-core-v010 && dpm build
cd '$wslRoot'/daml/packages/meridian-core && dpm build
cd '$wslRoot'/daml/tests && dpm test
"@
        Write-Host "Daml build and tests: OK" -ForegroundColor Green
    } else {
        Write-Warning "WSL not available. Install Daml SDK manually or use CI."
    }
}

if (-not $SkipServices) {
    Write-Host "Starting KYB gateway and party provisioner..."
    $kyb = Start-Process -PassThru -WindowStyle Hidden -FilePath "node" -ArgumentList "services/kyb-gateway/dist/index.js" -WorkingDirectory $Root
    Start-Sleep -Seconds 2
    $env:KYB_GATEWAY_URL = "http://localhost:8090"
    $prov = Start-Process -PassThru -WindowStyle Hidden -FilePath "node" -ArgumentList "services/party-provisioner/dist/index.js" -WorkingDirectory $Root
    Start-Sleep -Seconds 2
    @{ kybPid = $kyb.Id; provisionerPid = $prov.Id; startedAt = (Get-Date -Format "o") } | ConvertTo-Json | Set-Content ".setup-services.json"
    Write-Host "Services started (PIDs: KYB=$($kyb.Id), Provisioner=$($prov.Id))" -ForegroundColor Green
}

if (-not $SkipBootstrap) {
    Write-Host "Bootstrapping DevNet personas..."
    & "$Root/infra/scripts/bootstrap-devnet.ps1" -SkipVerify
    Write-Host "Bootstrap complete." -ForegroundColor Green
}

Write-Host ""
Write-Host "Setup finished. Verify with:" -ForegroundColor Cyan
Write-Host "  powershell -File infra/scripts/verify-devnet.ps1"
