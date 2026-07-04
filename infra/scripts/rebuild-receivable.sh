#!/usr/bin/env bash
set -euo pipefail
export PATH="${HOME}/.dpm/bin:${PATH}"
ROOT="/mnt/c/Users/MSI/Desktop/meridian"

echo "==> Rebuilding com-meridian-receivable (renamed from v2)..."
cd "${ROOT}/daml/packages/meridian-receivable"
rm -rf .daml/build .daml/dist 2>/dev/null || true
dpm build --enable-multi-package no 2>&1 | tail -5

echo ""
echo "==> Verifying new DAR output:"
ls -la "${ROOT}/daml/packages/meridian-receivable/.daml/dist/"

echo ""
echo "==> Rebuilding tests with updated daml.yaml..."
cd "${ROOT}/daml/tests"
rm -rf .daml/build 2>/dev/null || true
dpm build --enable-multi-package no 2>&1 | tail -5

echo "Done."
