# Twilio Voice Staging Runbook

Use this runbook only for a real external Twilio voice verification pass. Do not mark voice as externally verified until every step below succeeds against a public HTTPS API base URL.

## What This Runbook Proves

A successful pass proves all of the following on a public or staging deployment:

- Twilio accepts an outbound voice call request from the app
- Twilio can fetch approved TwiML from the app
- the called party hears the approved script
- Twilio posts signed voice status callbacks back to the app
- the app persists truthful call lifecycle state

## Required Environment

Set these on the deployed API environment before the test:

- `SANDBOX_MODE=false`
- `PUBLIC_API_BASE_URL=https://staging.example.com/api`
- `TWILIO_ACCOUNT_SID=<real account or subaccount sid>`
- `TWILIO_AUTH_TOKEN=<matching auth token>`
- `TWILIO_FROM_NUMBER=<Twilio number>`
- `TWILIO_VOICE_FROM_NUMBER=<voice-capable Twilio number>` or leave blank to reuse `TWILIO_FROM_NUMBER`
- `TWILIO_WEBHOOK_AUTH_TOKEN=<optional dedicated signature secret>` or leave blank to reuse `TWILIO_AUTH_TOKEN`
- `DATABASE_URL=<staging database>`
- `REDIS_URL=<staging redis>`

This repo’s current voice availability gate will stay closed unless all of these are true:

- `SANDBOX_MODE=false`
- Twilio account credentials are set
- `TWILIO_VOICE_FROM_NUMBER` or `TWILIO_FROM_NUMBER` is present
- `PUBLIC_API_BASE_URL` is present

## Twilio Console Setup

Outbound voice in this app passes the TwiML URL and status callback URL directly in the Twilio Calls API request, so you do not need to configure per-number webhook URLs for the outbound flow.

You still must verify the following in Twilio:

- the caller ID number is voice-capable
- the caller ID number belongs to the same Twilio account or subaccount as `TWILIO_ACCOUNT_SID`
- outbound geographic permissions include the destination region
- if the Twilio account is still on trial, the destination phone number is verified in Twilio

## Public URL Shapes Twilio Must Reach

Assuming `PUBLIC_API_BASE_URL=https://staging.example.com/api`, the app will hand Twilio these exact URLs:

- TwiML fetch URL: `https://staging.example.com/api/webhooks/twilio/voice/twiml/{message_id}`
- voice status callback URL: `https://staging.example.com/api/webhooks/twilio/voice/status`

Both routes require a valid Twilio signature.

## Prepare Demo Data

These commands assume the seeded demo tenant and credentials used by the repo smoke scripts.

```bash
docker compose up -d db redis
cd apps/api
../../.venv/Scripts/python -m alembic upgrade head
SEED_DETERMINISTIC_ONLY=true ../../.venv/Scripts/python -m app.seed
cd ../..
```

Seeded demo auth:

- tenant slug: `demo-realty`
- email: `agent@demo.local`
- password: `demo123`

## Start The API With Public Config

If you are verifying from a local machine, expose the API with a public HTTPS tunnel first and set `PUBLIC_API_BASE_URL` to that exact external URL.

Example Windows `cmd.exe` session:

```bat
set SANDBOX_MODE=false
set PUBLIC_API_BASE_URL=https://staging.example.com/api
set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
set TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
set TWILIO_FROM_NUMBER=+16145551234
set TWILIO_VOICE_FROM_NUMBER=+16145551234
set TWILIO_WEBHOOK_AUTH_TOKEN=
set DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/realtor_copilot
set REDIS_URL=redis://localhost:6379/0
pnpm dev:api
```

Health check:

```bash
curl -fsS https://staging.example.com/api/healthz
```

## Get A JWT

```bash
LOGIN_RESPONSE="$(curl -fsS -X POST https://staging.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"tenant_slug":"demo-realty","email":"agent@demo.local","password":"demo123"}')"

TOKEN="$(python - <<'PY' "${LOGIN_RESPONSE}"
import json,sys
print(json.loads(sys.argv[1])["access_token"])
PY
)"
```

## Confirm Voice Availability Gate Is Open

```bash
curl -fsS https://staging.example.com/api/outreach/voice-status \
  -H "Authorization: Bearer ${TOKEN}"
```

Expected response shape:

```json
{
  "available": true,
  "provider": "twilio_voice",
  "reason": null
}
```

If `available` is `false`, stop. Do not attempt a voice verification until the gate is green.

## Create A Real Voice Draft Pack

Pick a contact with:

- a valid phone number
- voice consent already present
- no suppression row for `voice`
- no quiet-hours block
- no daily cap block

Get one contact id:

```bash
CONTACTS_RESPONSE="$(curl -fsS https://staging.example.com/api/contacts \
  -H "Authorization: Bearer ${TOKEN}")"

CONTACT_ID="$(python - <<'PY' "${CONTACTS_RESPONSE}"
import json,sys
rows=json.loads(sys.argv[1])
print(rows[0]["id"])
PY
)"
```

Create a voice draft pack:

```bash
PACK_RESPONSE="$(curl -fsS -X POST https://staging.example.com/api/outreach/draft-pack \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"contact_id\":\"${CONTACT_ID}\",\"objective\":\"Staging voice verification\",\"channels\":[\"voice\"],\"sandbox\":true}")"

PACK_ID="$(python - <<'PY' "${PACK_RESPONSE}"
import json,sys
payload=json.loads(sys.argv[1])
print(payload["id"])
PY
)"

DRAFT_ID="$(python - <<'PY' "${PACK_RESPONSE}"
import json,sys
payload=json.loads(sys.argv[1])
print(payload["drafts"][0]["id"])
PY
)"
```

Submit the pack:

```bash
curl -fsS -X POST "https://staging.example.com/api/outreach/draft-pack/${PACK_ID}/submit" \
  -H "Authorization: Bearer ${TOKEN}"
```

Approve and send the voice draft:

```bash
curl -fsS -X POST "https://staging.example.com/api/outreach/drafts/${DRAFT_ID}/approve" \
  -H "Authorization: Bearer ${TOKEN}"
```

Expected immediate response:

- `status` is not `blocked`, `blocked_sandbox`, or `unavailable`
- `provider_message_id` is a real Twilio `CallSid`
- the draft status is an initial provider state such as `queued` or `initiated`

## What To Verify Externally

Twilio Console:

- the outbound call exists with the returned `CallSid`
- the call request used the expected `From` and `To`
- the TwiML request to `/webhooks/twilio/voice/twiml/{message_id}` returned HTTP `200`
- Twilio posted status callbacks to `/webhooks/twilio/voice/status`

Called party:

- the phone rings
- the called party hears the approved script text, not placeholder content

## Expected State Transitions

Typical voice lifecycle in this app:

`draft -> submitted -> queued/initiated -> ringing -> in_progress -> completed`

Possible non-success terminal states:

- `busy`
- `no_answer`
- `canceled`
- `failed`

Any compliance block must fail closed before Twilio receives a call request. In that case, the app should return one of:

- `blocked`
- `blocked_sandbox`
- `unavailable`

No real `CallSid` should be stored when compliance blocks the call before provider send.

## API And DB Inspection Points

List the draft state:

```bash
curl -fsS https://staging.example.com/api/outreach/drafts \
  -H "Authorization: Bearer ${TOKEN}"
```

Inspect the specific draft in Postgres:

```bash
docker compose exec -T db psql -U postgres -d realtor_copilot -x -c \
  "select id, channel, status, provider_message_id, meta_json from messages where id='${DRAFT_ID}'::uuid;"
```

Expected DB truth after a successful provider send:

- `channel='voice'`
- `provider_message_id` contains the Twilio `CallSid`
- `meta_json.voice_twiml_url` matches the public base URL
- `meta_json.voice_status_callback_url` matches the public base URL
- `meta_json.provider_event_history` grows as Twilio callbacks arrive

Inspect compliance audit rows:

```bash
docker compose exec -T db psql -U postgres -d realtor_copilot -x -c \
  "select event_type, rule_key, details_json from compliance_events where subject_id='${DRAFT_ID}';"
```

For a successful call, you should not see a final blocking event. If the call is blocked, this table is the source of truth for why.

## Failure Interpretation

If the app responds with `blocked_sandbox`:

- `SANDBOX_MODE` is still true in the deployed API

If the app responds with `unavailable`:

- one or more voice env requirements are still missing

If Twilio creates the call but never fetches TwiML:

- `PUBLIC_API_BASE_URL` is wrong
- the public route is unreachable from Twilio
- signature verification is rejecting the request because the base URL shape is wrong

If Twilio fetches TwiML but no callbacks persist:

- the callback URL is unreachable
- signature verification is rejecting callbacks
- the deployed API logs should show the rejected request

## Evidence Required To Mark External Verification Complete

Do not mark Twilio voice as externally verified until you have all of:

- the `approve` API response with a real `CallSid`
- Twilio console evidence that the call request executed
- evidence that Twilio fetched the public TwiML URL successfully
- evidence that the called party heard the approved script
- persisted callback-driven final status in `messages.status`
