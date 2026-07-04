#!/usr/bin/env bash
set -euo pipefail

export PATH="${HOME}/.dpm/bin:${PATH}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SPLICE="${ROOT}/daml/vendor/splice/splice/token-standard"
DIST="${ROOT}/daml/vendor/splice/dist"
SDK="${SDK_VERSION:-3.4.11}"

V1_PACKAGES=(
  splice-api-token-metadata-v1
  splice-api-token-holding-v1
  splice-api-token-transfer-instruction-v1
  splice-api-token-allocation-v1
  splice-api-token-allocation-instruction-v1
)

if [[ ! -d "${SPLICE}/splice-api-token-metadata-v1" ]]; then
  bash "${ROOT}/infra/scripts/vendor-splice-token.sh"
fi

patch_sdk() {
  local dir="$1"
  if [[ -f "${dir}/daml.yaml" ]]; then
    sed -i "s/^sdk-version:.*/sdk-version: ${SDK}/" "${dir}/daml.yaml"
  fi
}

link_current_dar() {
  local pkg_dir="$1"
  local dist_dir="${pkg_dir}/.daml/dist"
  local dar
  dar="$(ls -1 "${dist_dir}"/*.dar 2>/dev/null | grep -v -- '-current.dar$' | head -1 || true)"
  if [[ -z "${dar}" ]]; then
    echo "No DAR found in ${dist_dir}" >&2
    exit 1
  fi
  local pkg_name
  pkg_name="$(basename "${pkg_dir}")"
  ln -sf "$(basename "${dar}")" "${dist_dir}/${pkg_name}-current.dar"
}

build_pkg() {
  local pkg="$1"
  local dir="${SPLICE}/${pkg}"
  echo "==> ${pkg}"
  patch_sdk "${dir}"
  cd "${dir}"
  dpm build --enable-multi-package no
  link_current_dar "${dir}"
}

echo "Building Splice CIP-56 v1 API DARs (sdk ${SDK})..."
for pkg in "${V1_PACKAGES[@]}"; do
  build_pkg "${pkg}"
done

mkdir -p "${DIST}"
for pkg in "${V1_PACKAGES[@]}"; do
  dar="$(ls -1 "${SPLICE}/${pkg}/.daml/dist/"*.dar | grep -v -- '-current.dar$' | head -1)"
  cp -f "${dar}" "${DIST}/"
done

echo "Splice DARs copied to ${DIST}:"
ls -la "${DIST}"
