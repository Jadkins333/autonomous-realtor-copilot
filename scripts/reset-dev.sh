#!/usr/bin/env bash
set -euo pipefail

echo "WARNING: this will stop containers and delete local docker volumes (database data)."
echo "Press Ctrl+C now to cancel."
sleep 3

docker compose down -v
docker compose up --build -d db redis api worker beat web

echo "Dev stack reset complete."

