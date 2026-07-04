#!/usr/bin/env bash
set -euo pipefail
export PATH="${HOME}/.dpm/bin:${PATH}"
cd /mnt/c/Users/MSI/Desktop/meridian/daml/packages/meridian-cash
dpm build --enable-multi-package no
cd /mnt/c/Users/MSI/Desktop/meridian/daml/packages/meridian-receivable
dpm build --enable-multi-package no
cd /mnt/c/Users/MSI/Desktop/meridian/daml/tests
dpm test
