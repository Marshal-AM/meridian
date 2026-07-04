#!/usr/bin/env bash
# Meridian Phase 0 — party bootstrap (Linux/CI parity)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

KYB_GATEWAY_URL="${KYB_GATEWAY_URL:-http://localhost:8090}"
PROVISIONER_URL="${PROVISIONER_URL:-http://localhost:8091}"
MANIFEST_PATH="${MANIFEST_PATH:-infra/manifests/parties.json}"

mkdir -p "$(dirname "$MANIFEST_PATH")"

powershell -ExecutionPolicy Bypass -File infra/scripts/bootstrap-parties.ps1 \
  -KybGatewayUrl "$KYB_GATEWAY_URL" \
  -ProvisionerUrl "$PROVISIONER_URL" \
  -ManifestPath "$MANIFEST_PATH"
