#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${SEED_DIR:-/tmp/app_seed}"
mkdir -p "${TARGET_DIR}"
cp -f /app/seed/*.json "${TARGET_DIR}/"
export SEED_DIR="${TARGET_DIR}"

