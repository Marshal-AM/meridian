#!/usr/bin/env bash
set -euo pipefail

export PATH="${HOME}/.dpm/bin:${PATH}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REDSTONE="${ROOT}/daml/vendor/redstone/redstone-oracles-monorepo/packages/canton-connector/daml"
DIST="${ROOT}/daml/vendor/redstone/dist"

if [[ ! -d "${REDSTONE}/sdk" ]]; then
  bash "${ROOT}/infra/scripts/vendor-redstone.sh"
fi

echo "Building RedStone canton-connector DARs (common, types, sdk)..."
for pkg in common types sdk; do
  echo "==> ${pkg}"
  cd "${REDSTONE}/${pkg}"
  dpm build --enable-multi-package no
done

mkdir -p "${DIST}"
cp -f "${REDSTONE}/common/.daml/dist/"*.dar "${DIST}/"
cp -f "${REDSTONE}/types/.daml/dist/"*.dar "${DIST}/"
cp -f "${REDSTONE}/sdk/.daml/dist/"*.dar "${DIST}/"

echo "RedStone DARs copied to ${DIST}:"
ls -la "${DIST}"
