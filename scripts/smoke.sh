#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8000}"
WEB_BASE="${WEB_BASE:-http://localhost:3000}"
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

web_login_status="$(curl -sS -o /dev/null -w '%{http_code}' "${WEB_BASE}/login")"
if [ "${web_login_status}" != "200" ]; then
  echo "web route check failed: ${WEB_BASE}/login returned ${web_login_status}"
  exit 1
fi
echo "web route check: ${WEB_BASE}/login -> ${web_login_status}"

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
copilot_agents_status="$(curl -sS -o /dev/null -w '%{http_code}' "${API_BASE}/copilot/agents" -H "Authorization: Bearer ${token}")"
if [ "${copilot_agents_status}" != "200" ]; then
  echo "copilot agents endpoint failed: ${copilot_agents_status}"
  exit 1
fi
echo "copilot agents endpoint -> ${copilot_agents_status}"

sources_status_response="$(curl -fsS "${API_BASE}/sources/status" -H "Authorization: Bearer ${token}")"
diagnostics_status="$(curl -sS -o /tmp/realtor_diag.json -w '%{http_code}' "${API_BASE}/system/diagnostics" -H "Authorization: Bearer ${token}")"
if [ "${diagnostics_status}" != "200" ]; then
  echo "system diagnostics endpoint failed: ${diagnostics_status}"
  cat /tmp/realtor_diag.json || true
  exit 1
fi
echo "system diagnostics endpoint -> ${diagnostics_status}"

db_count="$(docker compose exec -T db psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-realtor_copilot}" -tAc "select count(*) from parcels;" | tr -d '[:space:]')"
if [ -z "${db_count}" ] || [ "${db_count}" = "0" ]; then
  echo "db read check failed: parcels count is ${db_count:-empty}"
  exit 1
fi
echo "db read check: parcels=${db_count}"

python3 - <<'PY' "${detail_response}"
import json,sys
payload=json.loads(sys.argv[1])
required=["id","address","insights"]
for key in required:
    if key not in payload:
        raise SystemExit(f"missing key: {key}")
print("parcel detail shape ok")
PY

python3 - <<'PY' "${sources_status_response}"
import json,sys
payload=json.loads(sys.argv[1])
items=payload.get("items")
if not isinstance(items,list) or len(items) < 1:
    raise SystemExit("sources status missing items")
required={"source_name","mode","state","drift_detected","dlq_count"}
missing=[k for k in required if k not in items[0]]
if missing:
    raise SystemExit(f"sources status item missing keys: {missing}")
print("sources status shape ok")
PY

python3 - <<'PY' "/tmp/realtor_diag.json"
import json,sys, pathlib
payload=json.loads(pathlib.Path(sys.argv[1]).read_text())
required=["build","db","redis","sources"]
missing=[k for k in required if k not in payload]
if missing:
    raise SystemExit(f"system diagnostics missing keys: {missing}")
print("system diagnostics shape ok")
PY

drift_source="$(python3 - <<'PY' "${sources_status_response}"
import json,sys
payload=json.loads(sys.argv[1])
for row in payload.get("items",[]):
    if row.get("source_name"):
        print(row.get("source_name"))
        break
PY
)"
if [ -z "${drift_source}" ]; then
  echo "sources status missing source_name entries"
  exit 1
fi

set_drift_status="$(curl -sS -o /tmp/set_drift.json -w '%{http_code}' -X POST "${API_BASE}/sources/${drift_source}/debug/drift" \
  -H "Authorization: Bearer ${token}" \
  -H 'Content-Type: application/json' \
  -d '{"drift_detected":true,"reason":"smoke_test_drift"}')"
if [ "${set_drift_status}" != "200" ]; then
  echo "failed to force drift for ${drift_source}: ${set_drift_status}"
  cat /tmp/set_drift.json || true
  exit 1
fi

replay_status="$(curl -sS -o /tmp/replay_refusal.json -w '%{http_code}' -X POST "${API_BASE}/sources/${drift_source}/dlq/replay" -H "Authorization: Bearer ${token}")"
if [ "${replay_status}" != "409" ]; then
  echo "expected replay refusal for drift source ${drift_source}, got ${replay_status}"
  cat /tmp/replay_refusal.json || true
  exit 1
fi
python3 - <<'PY' "/tmp/replay_refusal.json"
import json,sys, pathlib
payload=json.loads(pathlib.Path(sys.argv[1]).read_text())
detail=payload.get("detail",{})
msg=detail.get("message","")
if "Replay blocked" not in msg:
    raise SystemExit("unexpected replay refusal message")
print("drift replay refusal check ok")
PY

clear_drift_status="$(curl -sS -o /tmp/clear_drift.json -w '%{http_code}' -X POST "${API_BASE}/sources/${drift_source}/debug/drift" \
  -H "Authorization: Bearer ${token}" \
  -H 'Content-Type: application/json' \
  -d '{"drift_detected":false,"reason":"smoke_test_drift"}')"
if [ "${clear_drift_status}" != "200" ]; then
  echo "failed to clear drift for ${drift_source}: ${clear_drift_status}"
  cat /tmp/clear_drift.json || true
  exit 1
fi

echo "Smoke test passed."
