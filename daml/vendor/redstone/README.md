# RedStone Canton connector (vendor)

Meridian Phase 2 oracle-anchored financing depends on the RedStone canton-connector DARs vendored under `redstone-oracles-monorepo/`.

## Build DARs

RedStone packages must be built **before** `dpm build --all` in `daml/` (meridian-receivable lists `redstone-sdk-v19-0.4.0.dar` as a data dependency).

From the repo root:

```bash
bash infra/scripts/vendor-redstone.sh
bash infra/scripts/build-redstone-dars.sh
```

`build-redstone-dars.sh` runs the vendor step automatically when sources are missing.

This builds `common`, `types`, and `sdk` packages and copies the resulting `.dar` files to `daml/vendor/redstone/dist/`.

### Windows

Daml builds require **WSL** on Windows (same as the main Meridian Daml workflow). In WSL:

```bash
wsl bash infra/scripts/build-redstone-dars.sh
wsl bash -c 'cd daml && dpm build --all'
```

Ensure `dpm` SDK 3.4.11 is installed in WSL (`dpm install 3.4.11`).

## Upload to DevNet

After building Meridian packages, upload RedStone and receivable DARs together:

```powershell
pnpm upload:dar:devnet
```

The upload script collects DARs from `daml/vendor/redstone/dist/` and `daml/packages/*/`.daml/dist`, including `com-meridian-receivable-0.2.0.dar`.

## Oracle fixtures

Live RedStone payloads for Daml Script tests and DevNet integration:

```powershell
pnpm redstone:fetch
pnpm sync:redstone-fixtures
```

`sync:redstone-fixtures` regenerates `daml/tests/daml/Meridian/FinancingFixtures.daml` from `infra/samples/redstone-fetch-latest.json`.
