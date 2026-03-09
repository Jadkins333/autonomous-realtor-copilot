#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EMAIL="${DEMO_USER_EMAIL:-agent@demo.local}"
PASSWORD="${DEMO_USER_PASSWORD:-demo123}"

if ! docker info >/dev/null 2>&1; then
  echo "[demo] docker daemon is not running"
  exit 1
fi

docker compose up -d db redis api worker beat web >/dev/null

echo "[demo] reseeding deterministic demo dataset"
docker compose exec -T api env SEED_DETERMINISTIC_ONLY=true python -m app.seed >/dev/null

login_response="$(curl -fsS -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")"

token="$(python3 - <<'PY' "$login_response"
import json,sys
payload=json.loads(sys.argv[1])
print(payload["access_token"])
PY
)"

opportunities_count="$(python3 - <<'PY' "$token"
import json,sys,urllib.request
req=urllib.request.Request(
    'http://localhost:8000/parcels/search?query=High',
    headers={'Authorization':f'Bearer {sys.argv[1]}'}
)
rows=json.loads(urllib.request.urlopen(req).read().decode())
print(len(rows))
PY
)"

if [ "$opportunities_count" -lt 1 ]; then
  echo "[demo] expected opportunities data from seeded DB, got 0"
  exit 1
fi

web_status="$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000/opportunities)"
if [ "$web_status" != "200" ]; then
  echo "[demo] opportunities page is not reachable (status $web_status)"
  exit 1
fi

echo "[demo] demo login ok"
echo "[demo] seeded opportunities count: $opportunities_count"
echo "[demo] opportunities route: http://localhost:3000/opportunities"
