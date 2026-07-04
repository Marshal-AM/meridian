#!/usr/bin/env bash
set -euo pipefail
export PATH="${HOME}/.dpm/bin:${PATH}"
cd "$(dirname "$0")/../.."
bash infra/scripts/build-splice-dars.sh
