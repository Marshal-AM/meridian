#!/usr/bin/env bash
set -euo pipefail

export PATH="${HOME}/.dpm/bin:${PATH}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "==> RedStone DARs"
bash "${ROOT}/infra/scripts/build-redstone-dars.sh"

echo "==> Meridian Daml"
cd "${ROOT}/daml"
dpm build --all

echo "==> Daml Script tests"
cd tests
dpm test
