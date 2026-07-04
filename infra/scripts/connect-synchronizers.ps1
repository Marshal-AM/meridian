# Connect all Meridian participants to global + app-synchronizer synchronizers.
# Run after cn-quickstart LocalNet is up with --profile multi-sync.

param(
    [string]$CantonConsole = "make canton-console"
)

Write-Host "Synchronizer connection script for Phase 0."
Write-Host ""
Write-Host "Required synchronizers (multi-sync profile):"
Write-Host "  1. global              — Global Synchronizer equivalent (SV-operated)"
Write-Host "  2. app-synchronizer    — Private synchronizer (app-sequencer/mediator)"
Write-Host ""
Write-Host "Participants that must connect to BOTH synchronizers:"
Write-Host "  - app-provider (Platform Operator)     ports 3901/3975"
Write-Host "  - app-user (Buyer)                     ports 2901/2975"
Write-Host "  - meridian-supplier                    ports 5901/5975"
Write-Host "  - meridian-financier-alpha             ports 6901/6975"
Write-Host "  - meridian-financier-beta              ports 7901/7975"
Write-Host "  - meridian-registry                    ports 8901/8975"
Write-Host "  - meridian-oracle                      ports 9901/9975"
Write-Host ""
Write-Host "Use Canton Console to verify:"
Write-Host "  participant.synchronizers.list()"
Write-Host ""
Write-Host "Or verify via bootstrap manifest synchronizerIds field after bootstrap-parties.ps1"
