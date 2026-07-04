#!/usr/bin/env bash
export PATH="${HOME}/.dpm/bin:${PATH}"
dpm build --help 2>&1 | head -50
