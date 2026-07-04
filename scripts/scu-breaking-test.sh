#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.dpm/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/daml/packages/meridian-core-v010"
dpm build
cd "$ROOT/daml/packages/meridian-core-breaking"
if dpm build 2>&1; then
  echo "ERROR: Breaking SCU build succeeded — enforcement failed"
  exit 1
fi
echo "OK: Breaking change correctly rejected by SCU compiler"
