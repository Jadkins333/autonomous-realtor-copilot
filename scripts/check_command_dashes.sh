#!/usr/bin/env bash
set -euo pipefail

if rg -n "docker compose up –build|pnpm –filter|–noEmit" README.md DEV.md docs >/tmp/dash_bad.txt 2>/dev/null; then
  echo "Found invalid en-dash command variants:" >&2
  cat /tmp/dash_bad.txt >&2
  exit 1
fi

echo "command dash check: ok"
