# Meridian Infrastructure (DevNet)

Phase 0 uses **5North Seaport DevNet** only. LocalNet and cn-quickstart are no longer part of the workflow.

| Path | Purpose |
|------|---------|
| [manifests/parties.devnet.json](manifests/parties.devnet.json) | Version-controlled Party IDs for all 8 personas |
| [scripts/bootstrap-devnet.ps1](scripts/bootstrap-devnet.ps1) | Allocate parties, upload DAR, verify |
| [scripts/verify-devnet.ps1](scripts/verify-devnet.ps1) | Phase 0 exit criteria checker |

If `infra/cn-quickstart/` or `infra/localnet/` directories remain on disk from earlier setup, they can be deleted manually — they are gitignored and unused.
