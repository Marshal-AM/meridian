# Verify Meridian Phase 0 exit criteria on 5North Seaport DevNet
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root

$manifestPath = Join-Path $Root "infra/manifests/parties.devnet.json"
$passed = 0
$failed = 0
$deferred = 0

function Test-Criterion {
    param([string]$Name, [scriptblock]$Check, [string]$DeferredNote = "")
    Write-Host -NoNewline "  $Name... "
    if ($DeferredNote) {
        Write-Host "DEFERRED ($DeferredNote)" -ForegroundColor Yellow
        $script:deferred++
        return
    }
    try {
        $result = & $Check
        if ($result) {
            Write-Host "PASS" -ForegroundColor Green
            $script:passed++
        } else {
            Write-Host "FAIL" -ForegroundColor Red
            $script:failed++
        }
    } catch {
        Write-Host "FAIL ($($_.Exception.Message))" -ForegroundColor Red
        $script:failed++
    }
}

Write-Host "=== Meridian Phase 0 DevNet Exit Criteria ===" -ForegroundColor Cyan

Test-Criterion "Auth token exchange" {
    $out = npx --yes tsx scripts/devnet-smoke.ts auth 2>&1
    return $LASTEXITCODE -eq 0
}

Test-Criterion "Ledger API ledger-end responds" {
    $out = npx --yes tsx scripts/devnet-smoke.ts ledger-end 2>&1
    return $LASTEXITCODE -eq 0
}

Test-Criterion "parties.devnet.json exists with 8 personas" {
    if (-not (Test-Path $manifestPath)) { return $false }
    $m = Get-Content $manifestPath | ConvertFrom-Json
    return ($m.personas.Count -eq 8)
}

Test-Criterion "All personas have real Party IDs" {
    $m = Get-Content $manifestPath | ConvertFrom-Json
    $real = @($m.personas | Where-Object { $_.partyId -and $_.partyId -match "::" })
    return ($real.Count -eq 8)
}

Test-Criterion "Party IDs resolve on ledger" {
    $out = npx --yes tsx scripts/devnet-smoke.ts verify-parties 2>&1
    return $LASTEXITCODE -eq 0
}

Test-Criterion "DAR package on Seaport" {
    $out = npx --yes tsx scripts/devnet-smoke.ts packages 2>&1
    return $LASTEXITCODE -eq 0
}

Test-Criterion "Infrastructure separation per org" {} "Phase 5 prerequisite - shared Seaport validator only"

Test-Criterion "SCU package versioning (CI)" {
    return (Test-Path "daml/packages/meridian-core/daml.yaml")
}

Write-Host ""
Write-Host "Results: $passed passed, $failed failed, $deferred deferred" -ForegroundColor Cyan
if ($failed -gt 0) { exit 1 }
exit 0
