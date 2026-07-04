# Meridian

Privacy-native invoice financing and syndication exchange on **Canton Network**.

Phase 0 establishes SCU-compliant Daml packages, KYB-gated party provisioning, DevNet persona allocation on **5North Seaport**, per-org replay indexers, and CI — the foundation for all later phases.

## Environment

Meridian Phase 0 runs on **5North Seaport DevNet** (shared validator, Track A). All 8 personas are allocated on the same validator with distinct Party IDs. True infrastructure separation (distinct validators per organization) is **deferred to Phase 5** — see [docs/updatedphaseDocs.md](docs/updatedphaseDocs.md).

| Endpoint | URL |
|----------|-----|
| Ledger REST | `https://ledger-api.validator.devnet.sandbox.fivenorth.io` |
| Ledger WebSocket | `wss://ledger-api.validator.devnet.sandbox.fivenorth.io` |
| Auth | `https://auth.sandbox.fivenorth.io/application/o/token/` |

See [docs/devnet.md](docs/devnet.md) for auth details.

## Prerequisites

| Tool | Version |
|------|---------|
| Daml SDK (via DPM) | 3.4.11 |
| Node.js | 20 LTS |
| pnpm | 9+ |
| Git | — |

Daml builds on Windows use **WSL** (`wsl bash scripts/setup-daml-wsl.sh`).

## Quick Start

### 1. Configure DevNet credentials

```powershell
copy .env.example .env
# Set DEVNET_CLIENT_SECRET in .env
```

### 2. Build

```powershell
pnpm install
pnpm build
pnpm test
```

Daml (via WSL):

```powershell
wsl bash scripts/setup-daml-wsl.sh
# or: make build-daml && make test-daml
```

### 3. Allocate all 8 personas on Seaport DevNet

```powershell
pnpm allocate:devnet
```

Output: `infra/manifests/parties.devnet.json` plus a table of Party IDs for **allowlisting and DevNet CC grants**.

### 4. Fund personas with DevNet CC (Amulet Tap)

After allowlisting, mint Canton Coin to each party:

```powershell
pnpm fund:devnet
```

Default: **10,000 CC** per persona (`DEVNET_TAP_AMOUNT` in `.env`). Uses `@canton-network/wallet-sdk` `amulet.tap()` against the Seaport validator.

### 5. Upload DAR and verify

```powershell
pnpm upload:dar:devnet
powershell -ExecutionPolicy Bypass -File infra\scripts\verify-devnet.ps1
```

Or full bootstrap:

```powershell
make bootstrap
```

### 6. Start off-ledger services (optional)

```powershell
node services\kyb-gateway\dist\index.js
$env:KYB_GATEWAY_URL="http://localhost:8090"
node services\party-provisioner\dist\index.js
```

### 7. Run per-org indexer

Each org has an isolated data store — no shared DB between organizations.

```powershell
node services\indexer\dist\cli.js services\indexer\config\supplier.yaml
node services\indexer\dist\cli.js services\indexer\config\supplier.yaml --rebuild
```

## DevNet Personas

| Persona | Party Hint | Role |
|---------|------------|------|
| Supplier | `meridian-supplier-1` | Supplier |
| Buyer | `meridian-buyer-1` | Buyer |
| Financier A | `meridian-financier-a` | Financier |
| Financier B | `meridian-financier-b` | Financier |
| Registry | `meridian-registry-1` | Registry |
| Oracle | `meridian-oracle-1` | OracleProvider |
| Platform Operator | `meridian-platform-operator-1` | PlatformOperator |
| Regulator | `meridian-regulator-1` | Regulator (dormant until Phase 7) |

Party IDs (`hint::fingerprint`) live in [infra/manifests/parties.devnet.json](infra/manifests/parties.devnet.json).

## Repository Structure

```
daml/                  SCU-compliant Daml packages (meridian-core v0.1.0 → v0.2.0)
infra/                 DevNet bootstrap scripts, parties.devnet.json manifest
services/              kyb-gateway, party-provisioner, indexer
packages/              devnet-auth, ledger-client, shared-types
.github/workflows/     daml-ci.yml, devnet-smoke.yml
docs/                  PRD, phase plan, DevNet access guide
```

## Phase 0 Exit Criteria

| Criterion | Verification |
|-----------|--------------|
| All 8 personas on Seaport DevNet | `parties.devnet.json` + `GET /v2/parties` |
| Auth auto-refresh | `@meridian/devnet-auth` unit tests + smoke |
| SCU package versioning | CI builds v0.2.0 with `upgrades:` |
| DAR on Seaport | `pnpm upload:dar:devnet` |
| No shared off-ledger DB | Separate SQLite per kyb-gateway, provisioner, indexer org |
| KYB topology gate | Provisioner rejects allocation without valid `verificationId` |
| Indexer replay-only | `--rebuild` produces identical event log hash |
| Infrastructure separation | **Deferred** — documented, Phase 5 prerequisite |

## SCU Upgrade Discipline

- Package name: `com-meridian-core` (never changes)
- v0.1.0 baseline: `daml/packages/meridian-core-v010/`
- Current version: v0.2.0 with `upgrades:` pointing to v0.1.0 DAR
- Build with `--target=2.1` (LF 1.17 / SCU)

## CI

- **daml-ci.yml** — every push/PR: Daml build, Script tests, SCU breaking-change rejection, TypeScript build/test
- **devnet-smoke.yml** — auth + ledger-end smoke against Seaport (requires `DEVNET_CLIENT_SECRET` repo secret)

## Next Phase

Phase 1 implements the `Receivable` contract and interface-view privacy architecture.

See [docs/updatedphaseDocs.md](docs/updatedphaseDocs.md) for the full roadmap.
