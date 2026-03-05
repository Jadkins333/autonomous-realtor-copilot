#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

status=0

check() {
  local label="$1"
  local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "[doctor] ok: $label"
  else
    echo "[doctor] fail: $label"
    status=1
  fi
}

check "docker CLI" "command -v docker"
check "pnpm" "command -v pnpm"
check "docker daemon" "docker info"

if ! docker compose ps >/dev/null 2>&1; then
  echo "[doctor] fail: docker compose stack unavailable"
  echo "[doctor] fix: run 'pnpm run project:setup' or 'docker compose up -d --build db redis api worker beat web'"
  exit 1
fi

check "api healthz" "curl -fsS http://localhost:8000/healthz"
check "api metrics" "curl -fsS http://localhost:8000/metrics"
check "web reachable" "curl -fsS http://localhost:3000/login"
check "postgres ready" "docker compose exec -T db pg_isready -U \"${POSTGRES_USER:-postgres}\" -d \"${POSTGRES_DB:-realtor_copilot}\""
check "redis ready" "docker compose exec -T redis redis-cli ping | grep -q PONG"
check "worker running" "docker compose ps worker | grep -q 'Up'"
check "beat running" "docker compose ps beat | grep -q 'Up'"

if [ "$status" -ne 0 ]; then
  echo "[doctor] one or more checks failed"
  echo "[doctor] fixes:"
  echo "  1) ensure Docker Desktop is running"
  echo "  2) ensure ports 3000/8000/5432/6379 are free"
  echo "  3) run 'pnpm run project:setup'"
  exit 1
fi

echo "[doctor] all checks passed"
