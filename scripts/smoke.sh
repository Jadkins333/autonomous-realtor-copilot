#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8000}"
EMAIL="${DEMO_USER_EMAIL:-agent@demo.local}"
PASSWORD="${DEMO_USER_PASSWORD:-demo123}"

echo "Waiting for ${API_BASE}/healthz ..."
for _ in {1..60}; do
  if curl -fsS "${API_BASE}/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

health="$(curl -fsS "${API_BASE}/healthz")"
metrics="$(curl -fsS "${API_BASE}/metrics")"
echo "healthz: ${health}"
echo "metrics: ${metrics}"

login_response="$(curl -fsS -X POST "${API_BASE}/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")"

token="$(python3 - <<'PY' "${login_response}"
import json,sys
payload=json.loads(sys.argv[1])
token=payload.get("access_token","")
if not token:
    raise SystemExit(1)
print(token)
PY
)"

search_response="$(curl -fsS "${API_BASE}/parcels/search?query=High" -H "Authorization: Bearer ${token}")"
parcel_id="$(python3 - <<'PY' "${search_response}"
import json,sys
rows=json.loads(sys.argv[1])
if not isinstance(rows,list) or not rows:
    raise SystemExit(1)
print(rows[0]["id"])
PY
)"

detail_response="$(curl -fsS "${API_BASE}/parcels/${parcel_id}" -H "Authorization: Bearer ${token}")"

python3 - <<'PY' "${detail_response}"
import json,sys
payload=json.loads(sys.argv[1])
required=["id","address","insights"]
for key in required:
    if key not in payload:
        raise SystemExit(f"missing key: {key}")
print("parcel detail shape ok")
PY

echo "Smoke test passed."

