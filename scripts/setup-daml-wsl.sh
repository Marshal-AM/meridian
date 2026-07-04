#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.dpm/bin:$PATH"

if ! command -v dpm >/dev/null 2>&1; then
  echo "Installing dpm..."
  curl -fsSL https://get.digitalasset.com/install/install.sh | sh
  export PATH="$HOME/.dpm/bin:$PATH"
fi

echo "Installing Daml SDK 3.4.11..."
dpm install 3.4.11
dpm version

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/daml"
echo "Building all Daml packages..."
dpm build --all

cd "$ROOT/daml/tests"
echo "Running Daml Script tests..."
dpm test

echo "Daml setup complete."
