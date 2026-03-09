#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8000}"
WEB_BASE="${WEB_BASE:-http://localhost:3001}"
EMAIL="${DEMO_USER_EMAIL:-agent@demo.local}"
PASSWORD="${DEMO_USER_PASSWORD:-demo123}"
TENANT_SLUG="${DEFAULT_TENANT_SLUG:-demo-realty}"
MISSING_PARCEL_ID="${TEST_PARCEL_MISSING_SIGNALS_ID:-11111111-1111-1111-1111-111111111111}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-realtor_copilot}"

bash scripts/check_command_dashes.sh

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
  -d "{\"tenant_slug\":\"${TENANT_SLUG}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")"

token="$(python3 - <<'PY' "${login_response}"
import json,sys
payload=json.loads(sys.argv[1])
token=payload.get("access_token","")
if not token:
    raise SystemExit(1)
print(token)
PY
)"

echo "Waiting for ${API_BASE}/sources/status ..."
sources_status_code=""
for _ in {1..30}; do
  sources_status_code="$(curl -sS -o /tmp/sources_status_ready.json -w '%{http_code}' "${API_BASE}/sources/status" -H "Authorization: Bearer ${token}" || true)"
  if [ "${sources_status_code}" = "200" ]; then
    break
  fi
  sleep 1
done
if [ "${sources_status_code}" != "200" ]; then
  echo "sources status check failed: ${API_BASE}/sources/status returned ${sources_status_code}"
  exit 1
fi

contacts_response="$(curl -fsS "${API_BASE}/contacts" -H "Authorization: Bearer ${token}")"
sandbox_contact_id="$(python3 - <<'PY' "${contacts_response}"
import json,sys
rows=json.loads(sys.argv[1])
if not isinstance(rows,list) or not rows:
    raise SystemExit("contacts endpoint returned no rows")
print(rows[0]["id"])
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
opportunities_response="$(curl -fsS "${API_BASE}/opportunities" -H "Authorization: Bearer ${token}")"
opportunity_events_response="$(curl -fsS "${API_BASE}/opportunities/events?days=30" -H "Authorization: Bearer ${token}")"
city_response="$(curl -fsS "${API_BASE}/insights/city/columbus" -H "Authorization: Bearer ${token}")"
missing_parcel_insights="$(curl -fsS "${API_BASE}/insights/parcels/${MISSING_PARCEL_ID}" -H "Authorization: Bearer ${token}")"

python3 - <<'PY' "${detail_response}"
import json,sys
payload=json.loads(sys.argv[1])
required=["id","address","insights"]
for key in required:
    if key not in payload:
        raise SystemExit(f"missing key: {key}")
print("parcel detail shape ok")
PY

python3 - <<'PY' "${opportunities_response}"
import json,sys
payload=json.loads(sys.argv[1])
items=payload.get("items")
if not isinstance(items,list):
    raise SystemExit("opportunities response missing items")
print("opportunities shape ok")
PY

python3 - <<'PY' "${opportunity_events_response}"
import json,sys
payload=json.loads(sys.argv[1])
if payload.get("status") != "ok":
    raise SystemExit("opportunity events status not ok")
print("opportunity events shape ok")
PY

python3 - <<'PY' "${city_response}"
import json,sys
payload=json.loads(sys.argv[1])
for key in ["formula_key","formula_version","inputs","provenance","freshness"]:
    if key not in payload:
        raise SystemExit(f"city metric missing {key}")
if not payload.get("provenance",{}).get("sources"):
    raise SystemExit("city metric provenance sources missing")
source = payload["provenance"]["sources"][0]
if "source_id" not in source or "raw_url" not in source:
    raise SystemExit("city provenance entry missing source_id/raw_url")
freshness = payload.get("freshness", {})
for key in ["fetched_at","ttl_seconds","is_stale"]:
    if key not in freshness:
        raise SystemExit(f"city freshness missing {key}")
first_input = next(iter(payload.get("inputs", {}).values()), None)
if not first_input or "fields" not in first_input or "ids" not in first_input:
    raise SystemExit("city inputs missing fields/ids")
print("truth provenance contract ok")
PY

python3 - <<'PY' "${missing_parcel_insights}"
import json,sys
payload=json.loads(sys.argv[1])
if payload.get("status") != "insufficient_data":
    raise SystemExit("expected insufficient_data status for missing-signal parcel")
if not payload.get("missing_inputs"):
    raise SystemExit("missing_inputs should be non-empty for missing-signal parcel")
print("insufficient_data guard ok")
PY

# STOP webhook simulation through Twilio-style form payload.
stop_response="$(curl -fsS -X POST "${API_BASE}/webhooks/twilio/inbound" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'Body=STOP' \
  --data-urlencode 'From=+16145550001' \
  --data-urlencode 'To=+16145559999' \
  --data-urlencode 'MessageSid=SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')"
stop_contact_id="$(python3 - <<'PY' "${stop_response}"
import json,sys
payload=json.loads(sys.argv[1])
if not payload.get("stop_triggered"):
    raise SystemExit("STOP webhook did not trigger opt-out")
print(payload["contact_id"])
PY
)"

opt_out_count="$(docker compose exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "select count(*) from consent_events where contact_id='${stop_contact_id}'::uuid and channel='sms' and status='opt_out';" | tr -d '[:space:]')"
if [ "${opt_out_count}" = "0" ]; then
  echo "STOP webhook failed to create sms opt_out consent event"
  exit 1
fi

suppressed_count="$(docker compose exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "select count(*) from suppression_list where contact_id='${stop_contact_id}'::uuid and channel='sms';" | tr -d '[:space:]')"
if [ "${suppressed_count}" = "0" ]; then
  echo "STOP webhook failed to create suppression row"
  exit 1
fi

sms_pack_response="$(curl -fsS -X POST "${API_BASE}/outreach/draft-pack" \
  -H "Authorization: Bearer ${token}" \
  -H 'Content-Type: application/json' \
  -d "{\"contact_id\":\"${stop_contact_id}\",\"objective\":\"SMS compliance verification\",\"channels\":[\"sms\"],\"sandbox\":true}")"

sms_pack_id="$(python3 - <<'PY' "${sms_pack_response}"
import json,sys
payload=json.loads(sys.argv[1])
drafts=payload.get("drafts") or []
if len(drafts) != 1:
    raise SystemExit("expected one sms draft in pack")
print(payload["id"])
PY
)"

sms_draft_id="$(python3 - <<'PY' "${sms_pack_response}"
import json,sys
payload=json.loads(sys.argv[1])
print(payload["drafts"][0]["id"])
PY
)"

curl -fsS -X POST "${API_BASE}/outreach/draft-pack/${sms_pack_id}/submit" -H "Authorization: Bearer ${token}" >/dev/null

sms_approve_response="$(curl -fsS -X POST "${API_BASE}/outreach/drafts/${sms_draft_id}/approve" -H "Authorization: Bearer ${token}")"
python3 - <<'PY' "${sms_approve_response}"
import json,sys
payload=json.loads(sys.argv[1])
if payload.get("status") != "blocked":
    raise SystemExit("expected sms approve to be blocked after STOP suppression")
print("STOP suppression block ok")
PY

suppression_event_count="$(docker compose exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "select count(*) from compliance_events where subject_id='${sms_draft_id}' and rule_key in ('suppressed_contact','consent_required');" | tr -d '[:space:]')"
if [ "${suppression_event_count}" = "0" ]; then
  echo "Expected consent/suppression compliance_event for blocked SMS"
  exit 1
fi

# Sandbox safety: approval attempt should be blocked_sandbox and write compliance event.
email_pack_response="$(curl -fsS -X POST "${API_BASE}/outreach/draft-pack" \
  -H "Authorization: Bearer ${token}" \
  -H 'Content-Type: application/json' \
  -d "{\"contact_id\":\"${sandbox_contact_id}\",\"objective\":\"Sandbox approval verification\",\"channels\":[\"email\"],\"sandbox\":true}")"

email_pack_id="$(python3 - <<'PY' "${email_pack_response}"
import json,sys
payload=json.loads(sys.argv[1])
print(payload["id"])
PY
)"
email_draft_id="$(python3 - <<'PY' "${email_pack_response}"
import json,sys
payload=json.loads(sys.argv[1])
print(payload["drafts"][0]["id"])
PY
)"
outreach_drafts_response="$(curl -fsS "${API_BASE}/outreach/drafts" -H "Authorization: Bearer ${token}")"
python3 - <<'PY' "${outreach_drafts_response}" "${email_draft_id}"
import json,sys
rows=json.loads(sys.argv[1])
target=sys.argv[2]
if not any(str(row.get("id")) == target for row in rows):
    raise SystemExit("created email draft not found in /outreach/drafts")
print("outreach draft persistence ok")
PY
curl -fsS -X POST "${API_BASE}/outreach/draft-pack/${email_pack_id}/submit" -H "Authorization: Bearer ${token}" >/dev/null
email_approve_response="$(curl -fsS -X POST "${API_BASE}/outreach/drafts/${email_draft_id}/approve" -H "Authorization: Bearer ${token}")"
python3 - <<'PY' "${email_approve_response}"
import json,sys
payload=json.loads(sys.argv[1])
if payload.get("status") != "blocked_sandbox":
    raise SystemExit(f"expected blocked_sandbox, got {payload.get('status')}")
if "sandbox" not in str(payload.get("reason","")).lower():
    raise SystemExit("sandbox block response missing clear reason")
print("sandbox block assertion ok")
PY

sandbox_event_count="$(docker compose exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "select count(*) from compliance_events where subject_id='${email_draft_id}' and rule_key='sandbox_default';" | tr -d '[:space:]')"
if [ "${sandbox_event_count}" = "0" ]; then
  echo "Expected sandbox_default compliance_event for sandbox blocked send"
  exit 1
fi

sources_status_response="$(curl -fsS "${API_BASE}/sources/status" -H "Authorization: Bearer ${token}")"
drift_source="$(python3 - <<'PY' "${sources_status_response}"
import json,sys
payload=json.loads(sys.argv[1])
for row in payload.get("items",[]):
    if row.get("source_name"):
        print(row["source_name"])
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

clear_drift_status="$(curl -sS -o /tmp/clear_drift.json -w '%{http_code}' -X POST "${API_BASE}/sources/${drift_source}/debug/drift" \
  -H "Authorization: Bearer ${token}" \
  -H 'Content-Type: application/json' \
  -d '{"drift_detected":false,"reason":"smoke_test_drift"}')"
if [ "${clear_drift_status}" != "200" ]; then
  echo "failed to clear drift for ${drift_source}: ${clear_drift_status}"
  cat /tmp/clear_drift.json || true
  exit 1
fi

replay_after_status="$(curl -sS -o /tmp/replay_after_clear.json -w '%{http_code}' -X POST "${API_BASE}/sources/${drift_source}/dlq/replay" -H "Authorization: Bearer ${token}")"
if [ "${replay_after_status}" != "200" ] && [ "${replay_after_status}" != "409" ]; then
  echo "unexpected replay status after clearing drift: ${replay_after_status}"
  cat /tmp/replay_after_clear.json || true
  exit 1
fi
python3 - <<'PY' "/tmp/replay_after_clear.json" "${replay_after_status}"
import json,sys,pathlib
payload=json.loads(pathlib.Path(sys.argv[1]).read_text())
status=sys.argv[2]
body = payload.get("detail", payload)
for key in ["attempted","succeeded","failed","skipped_duplicate"]:
    if key not in body:
        raise SystemExit(f"missing replay key after clear: {key}")
if status == "409" and "Replay blocked" not in str(body.get("message","")):
    raise SystemExit("409 replay response missing safe refusal message")
print("drift replay response after clear is deterministic")
PY

# Live-source degrade check: set source base URL unreachable, run ingestion, verify app still works.
source_name="franklin_auditor"
original_base_url="$(docker compose exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "select base_url from sources where name='${source_name}' limit 1;" | tr -d '[:space:]')"
if [ -n "${original_base_url}" ]; then
  docker compose exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "update sources set base_url='http://127.0.0.1:9/unreachable' where name='${source_name}';" >/dev/null
  curl -fsS -X POST "${API_BASE}/ingest/run" -H "Authorization: Bearer ${token}" >/tmp/ingest_degrade.json
  degraded_sources="$(curl -fsS "${API_BASE}/sources/status" -H "Authorization: Bearer ${token}")"
  python3 - <<'PY' "${degraded_sources}" "${source_name}"
import json,sys
payload=json.loads(sys.argv[1])
source=sys.argv[2]
rows=[r for r in payload.get("items",[]) if r.get("source_name")==source]
if not rows:
    raise SystemExit("missing source status row after degrade run")
row=rows[0]
if row.get("mode") not in {"fixture","live"}:
    raise SystemExit("unexpected source mode")
if row.get("state") not in {"ok","partial","failed","paused"}:
    raise SystemExit("unexpected source state")
if row.get("is_stale") is not True:
    raise SystemExit("expected source to be stale/unreachable after forced degrade")
print("degrade source status row ok")
PY

  curl -fsS "${API_BASE}/parcels/search?query=High" -H "Authorization: Bearer ${token}" >/tmp/degrade_search.json
  curl -fsS "${API_BASE}/parcels/${parcel_id}" -H "Authorization: Bearer ${token}" >/tmp/degrade_detail.json
  curl -fsS "${API_BASE}/insights/city/columbus" -H "Authorization: Bearer ${token}" >/tmp/degrade_city.json

  escaped_original="$(printf "%s" "${original_base_url}" | sed "s/'/''/g")"
  docker compose exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "update sources set base_url='${escaped_original}' where name='${source_name}';" >/dev/null
fi

echo "Smoke test passed."
