#!/usr/bin/env bash
set -euo pipefail
export PATH="${HOME}/.dpm/bin:${PATH}"

ROOT="/mnt/c/Users/MSI/Desktop/meridian"
OFFICIAL_DARS="${ROOT}/daml/vendor/splice/splice/daml/dars"
DIST="${ROOT}/daml/vendor/splice/dist"

echo "==> Replacing vendor DARs with official pre-built Splice DARs..."
for pkg in \
  splice-api-token-metadata-v1-1.0.0.dar \
  splice-api-token-holding-v1-1.0.0.dar \
  splice-api-token-transfer-instruction-v1-1.0.0.dar \
  splice-api-token-allocation-v1-1.0.0.dar \
  splice-api-token-allocation-instruction-v1-1.0.0.dar; do
  cp -f "${OFFICIAL_DARS}/${pkg}" "${DIST}/${pkg}"
  echo "  Copied ${pkg}"
done

echo ""
echo "==> Rebuilding com-meridian-cash..."
cd "${ROOT}/daml/packages/meridian-cash"
rm -rf .daml/build 2>/dev/null || true
dpm build --enable-multi-package no

echo ""
echo "==> Rebuilding com-meridian-receivable-v2..."
cd "${ROOT}/daml/packages/meridian-receivable"
rm -rf .daml/build 2>/dev/null || true
dpm build --enable-multi-package no

echo ""
echo "==> Build complete. Checking embedded Splice hashes..."
python3 - << 'PYEOF'
import zipfile, re, os

dars = {
    "com-meridian-cash-0.1.0.dar": "/mnt/c/Users/MSI/Desktop/meridian/daml/packages/meridian-cash/.daml/dist/com-meridian-cash-0.1.0.dar",
    "com-meridian-receivable-v2-0.2.0.dar": "/mnt/c/Users/MSI/Desktop/meridian/daml/packages/meridian-receivable/.daml/dist/com-meridian-receivable-0.1.0.dar",
}

for name, path in dars.items():
    if not os.path.exists(path):
        print(f"  MISSING: {name}")
        continue
    with zipfile.ZipFile(path) as z:
        splice = [n for n in z.namelist() if "splice-api" in n]
        print(f"\n  {name} - Splice hashes:")
        for s in sorted(splice):
            m = re.search(r"-([a-f0-9]{64})\.dalf$", s)
            if m:
                print(f"    {os.path.basename(s)[:55]}...  {m.group(1)[:12]}...")
PYEOF
