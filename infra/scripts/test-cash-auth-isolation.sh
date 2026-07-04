#!/usr/bin/env bash
# Minimal repro: mint → allocate → execute (CIP-56 auth isolation).
set -euo pipefail
export PATH="${HOME}/.dpm/bin:${PATH}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "==> Build meridian-cash only"
cd "${ROOT}/daml/packages/meridian-cash"
dpm build --enable-multi-package no

echo "==> Build meridian-cash + receivable (AwardBid test needs financing)"
cd "${ROOT}/daml/packages/meridian-receivable"
dpm build --enable-multi-package no

echo "==> Run CashAuthIsolationTest only"
cd "${ROOT}/daml/tests"
dpm test --files daml/Meridian/CashAuthIsolationTest.daml

echo "==> Cash auth isolation: PASS"
