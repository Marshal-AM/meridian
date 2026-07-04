#!/usr/bin/env bash
# Sparse-clone Splice token-standard API sources for CIP-56 interface DARs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="${ROOT}/daml/vendor/splice/splice"
REPO="https://github.com/hyperledger-labs/splice.git"

if [[ -d "${TARGET}/token-standard/splice-api-token-holding-v1" ]]; then
  echo "Splice token-standard already vendored at ${TARGET}"
  exit 0
fi

echo "Sparse-cloning Splice token-standard into ${TARGET}..."
mkdir -p "$(dirname "${TARGET}")"

git clone --filter=blob:none --sparse --depth 1 "${REPO}" "${TARGET}"
cd "${TARGET}"
git sparse-checkout set \
  token-standard/splice-api-token-metadata-v1 \
  token-standard/splice-api-token-holding-v1 \
  token-standard/splice-api-token-transfer-instruction-v1 \
  token-standard/splice-api-token-allocation-v1 \
  token-standard/splice-api-token-allocation-instruction-v1 \
  token-standard/splice-token-standard-utils \
  token-standard/examples/splice-test-token-v1

echo "Splice token-standard vendor ready."
