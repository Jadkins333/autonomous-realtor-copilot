#!/usr/bin/env bash
set -euo pipefail

source scripts/prepare_seed.sh

alembic upgrade head
python -m app.seed
uvicorn app.main:app --host "${API_HOST:-0.0.0.0}" --port "${API_PORT:-8000}"
