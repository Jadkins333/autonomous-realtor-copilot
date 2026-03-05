#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[setup] missing required command: $cmd"
    exit 1
  fi
}

require_cmd node
require_cmd pnpm
require_cmd docker
require_cmd curl

if ! docker info >/dev/null 2>&1; then
  echo "[setup] docker daemon is not running. Start Docker Desktop and re-run."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[setup] created .env from .env.example"
fi

echo "[setup] installing workspace dependencies"
pnpm install

echo "[setup] starting docker stack"
docker compose up -d --build db redis api worker beat web

echo "[setup] waiting for API health"
for _ in {1..90}; do
  if curl -fsS http://localhost:8000/healthz >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS http://localhost:8000/healthz >/dev/null

echo "[setup] running migrations"
docker compose exec -T api alembic upgrade head >/dev/null

echo "[setup] running deterministic seed"
docker compose exec -T api env SEED_DETERMINISTIC_ONLY=true python -m app.seed >/dev/null

echo "[setup] running smoke checks"
bash scripts/smoke.sh

echo "[setup] done"
