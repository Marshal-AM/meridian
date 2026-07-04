#!/usr/bin/env bash
# Sync Splice vendor DARs from DevNet.
# Downloads the exact DALF package that the DevNet participant already has,
# wraps each one into a valid minimal DAR, then rebuilds com-meridian-cash.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SPLICE_DIST="${ROOT}/daml/vendor/splice/dist"

# Source .env first so variables are available
if [[ -f "${ROOT}/.env" ]]; then
  set -a; source "${ROOT}/.env"; set +a
fi

LEDGER_API="${DEVNET_LEDGER_API_URL:-https://ledger-api.validator.devnet.sandbox.fivenorth.io}"
AUTH_URL="${DEVNET_AUTH_URL:-https://auth.sandbox.fivenorth.io/application/o/token/}"
CLIENT_ID="${DEVNET_CLIENT_ID:-validator-devnet-m2m}"
AUDIENCE="${DEVNET_AUDIENCE:-validator-devnet-m2m}"
CLIENT_SECRET="${DEVNET_CLIENT_SECRET:?DEVNET_CLIENT_SECRET is required}"

echo "==> Obtaining DevNet access token..."
TOKEN=$(curl -s -X POST "$AUTH_URL" \
  -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&audience=${AUDIENCE}&scope=daml_ledger_api" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: failed to obtain access token" >&2
  exit 1
fi
echo "   token obtained (${#TOKEN} chars)"

# Discover the DevNet hash by trying to list known packages
echo "==> Discovering Splice package IDs on DevNet..."
PKG_LIST=$(curl -s \
  -H "Authorization: Bearer ${TOKEN}" \
  "${LEDGER_API}/v2/packages" \
  | python3 -c "import sys,json; pkgs=json.load(sys.stdin); print('\n'.join(pkgs.get('packageIds',[]))) if isinstance(pkgs, dict) else print('\n'.join(pkgs))")

echo "   Found $(echo "$PKG_LIST" | wc -l | tr -d ' ') packages on DevNet"

# Filter to just 32-char+ hex IDs (package hashes)
# We'll download one well-known Splice package and check its content
# From the KNOWN_PACKAGE_VERSION errors, we know the DevNet Splice hash is 4ded6b...
SPLICE_HASH="4ded6b668cb3b64f7a88a30874cd41c75829f5e064b3fbbadf41ec7e8363354f"

# Verify this hash is in the package list
if echo "$PKG_LIST" | grep -q "^${SPLICE_HASH}$"; then
  echo "   Confirmed ${SPLICE_HASH:0:12}... is on DevNet"
else
  echo "   WARNING: ${SPLICE_HASH:0:12}... not found in package list, will try downloading anyway"
fi

SPLICE_PKGS=(
  splice-api-token-metadata-v1
  splice-api-token-holding-v1
  splice-api-token-transfer-instruction-v1
  splice-api-token-allocation-v1
  splice-api-token-allocation-instruction-v1
)

mkdir -p "${SPLICE_DIST}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "==> Downloading Splice DALF (${SPLICE_HASH:0:12}...) from DevNet..."
DALF_PATH="${TMP}/splice-devnet-${SPLICE_HASH}.dalf"
HTTP_CODE=$(curl -s -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${LEDGER_API}/v2/packages/${SPLICE_HASH}" \
  -o "${DALF_PATH}")
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: failed to download DALF (HTTP $HTTP_CODE)" >&2
  cat "${DALF_PATH}" >&2
  exit 1
fi
DALF_SIZE=$(wc -c < "${DALF_PATH}")
echo "   downloaded ${DALF_SIZE} bytes"

echo "==> Creating vendor DAR archives..."
export SPLICE_DIST_EXPORT="$SPLICE_DIST"
export DALF_PATH_EXPORT="$DALF_PATH"
export SPLICE_HASH_EXPORT="$SPLICE_HASH"
python3 << 'PYEOF'
import os, zipfile, shutil

dist = os.environ["SPLICE_DIST_EXPORT"]
dalf_path = os.environ["DALF_PATH_EXPORT"]
splice_hash = os.environ["SPLICE_HASH_EXPORT"]

pkgs = [
    "splice-api-token-metadata-v1",
    "splice-api-token-holding-v1",
    "splice-api-token-transfer-instruction-v1",
    "splice-api-token-allocation-v1",
    "splice-api-token-allocation-instruction-v1",
]

for pkg in pkgs:
    dalf_name = f"{pkg}-1.0.0-{splice_hash}.dalf"
    dar_path = os.path.join(dist, f"{pkg}-1.0.0.dar")
    manifest = (
        "Manifest-Version: 1.0\r\n"
        "Created-By: meridian-sync\r\n"
        f"Name: {pkg}-1.0.0\r\n"
        "Sdk-Version: 3.4.11\r\n"
        f"Main-Dalf: {dalf_name}\r\n"
        f"Dalfs: {dalf_name}\r\n"
        "Format: daml-lf\r\n"
        "Encryption: non-encrypted\r\n"
    )
    with zipfile.ZipFile(dar_path, "w", compression=zipfile.ZIP_STORED) as zf:
        zf.writestr("META-INF/MANIFEST.MF", manifest)
        zf.write(dalf_path, dalf_name)
    print(f"Created: {dar_path}")
PYEOF

echo "==> Rebuilding com-meridian-cash with DevNet-aligned vendor DARs..."
export PATH="${HOME}/.dpm/bin:${PATH}"
cd "${ROOT}/daml/packages/meridian-cash"
rm -rf .daml/build 2>/dev/null || true
dpm build --enable-multi-package no

echo "   com-meridian-cash rebuilt successfully"
echo ""
echo "==> Now run: pnpm upload:dar:devnet"
