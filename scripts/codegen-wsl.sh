#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.dpm/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
dpm codegen-js "$ROOT/daml/packages/meridian-core/.daml/dist/com-meridian-core-0.2.0.dar" -o "$ROOT/packages/generated"
echo "Codegen complete: packages/generated"
