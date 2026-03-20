#!/usr/bin/env bash
set -euo pipefail

source scripts/prepare_seed.sh

celery -A app.workers.celery_app.celery_app worker --loglevel=info
