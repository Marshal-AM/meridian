#!/usr/bin/env bash
# Sparse-clone RedStone canton-connector sources required to build on-ledger oracle DARs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="${ROOT}/daml/vendor/redstone/redstone-oracles-monorepo"
REPO="https://github.com/redstone-finance/redstone-oracles-monorepo.git"

if [[ -d "${TARGET}/packages/canton-connector/daml/sdk" ]]; then
  echo "RedStone canton-connector already vendored at ${TARGET}"
  exit 0
fi

echo "Sparse-cloning RedStone canton-connector into ${TARGET}..."
mkdir -p "$(dirname "${TARGET}")"

git clone --filter=blob:none --sparse "${REPO}" "${TARGET}"
cd "${TARGET}"
git sparse-checkout set \
  packages/canton-connector/daml/common \
  packages/canton-connector/daml/types \
  packages/canton-connector/daml/sdk

echo "RedStone vendor ready."
