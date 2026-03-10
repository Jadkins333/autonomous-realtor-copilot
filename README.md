# Autonomous Realtor Intelligence Copilot — Columbus, Ohio (Public-Data MVP)

Complete monorepo implementing a runnable public-data real-estate copilot with Truth Layer provenance, ingestion fallback, outreach compliance enforcement, installable web PWA, and Expo mobile app.

## Locked Stack
- Monorepo: `pnpm workspace` + Python backend
- Web: Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn-style UI components, NextAuth Credentials, PWA install support
- Mobile: Expo (React Native + Expo Router + SecureStore)
- API: Python 3.11, FastAPI, SQLAlchemy 2, GeoAlchemy2, Pydantic v2
- DB: PostgreSQL 16 + PostGIS
- Queue/Scheduler: Redis + Celery + Celery Beat
- Migrations: Alembic
- Auth: NextAuth on web, signed JWT on API
- Maps: MapLibre (web), react-native-maps (mobile)
- Observability: JSON logs + request id + `/metrics`
- Testing: `pytest` (api), `vitest` (web)
- Lint/Format: `ruff` + `black` (api), `eslint` + `prettier` (web)

## Quick Start (Docker)
1. Copy env file if needed:
```bash
cp .env.example .env
```
2. Start stack:
```bash
docker compose up --build
```
3. Open:
- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:8000/healthz](http://localhost:8000/healthz), [http://localhost:8000/metrics](http://localhost:8000/metrics)
- Postgres: `localhost:5432`

Detailed local workflow: [DEV.md](./DEV.md)

> Note: use `pnpm run project:setup` and `pnpm run project:doctor`.  
> `pnpm setup` and `pnpm doctor` are pnpm builtins and do not run this project's scripts.

## Demo Credentials
- Tenant slug: `demo-realty`
- Email: `agent@demo.local`
- Password: `demo123`

These are seeded automatically at first boot (`apps/api/scripts/start_api.sh` runs migration + seed bootstrap).

## Demo Mode Behavior
- `SANDBOX_MODE=true` by default.
- Outreach approvals remain non-sending in sandbox mode and return `blocked_sandbox` with a compliance audit event.
- Voice outreach is a real Twilio channel only when `SANDBOX_MODE=false`, `PUBLIC_API_BASE_URL` is set, and Twilio voice credentials are configured. Otherwise the UI/API mark voice as unavailable and fail closed.
- Public-data connectors try live URLs first, then fallback to synthetic seed files.
- Source failures are non-fatal and recorded in `source_runs`.
- Drift policy: when schema drift is detected, the source is auto-paused and DLQ replay is blocked until drift is resolved.
- DLQ entries use stable dedupe keys so repeated drift failures do not create duplicate queue rows.
- On macOS, API/worker/beat use container-local seed copies (`/tmp/app_seed`) to avoid bind-mount file lock issues.

## PWA (apps/web)
The web app is installable as a PWA and includes:
- `manifest.webmanifest`
- install icons (`192x192`, `512x512`, apple-touch icon)
- service worker (`public/sw.js`)
- offline route (`/offline`)
- API proxy (`/api/proxy/[...path]`) used by frontend fetches

### Install on iOS
1. Open the web app in Safari.
2. Tap Share.
3. Tap **Add to Home Screen**.
4. Launch from home screen for standalone mode.

### Install on Android
1. Open the web app in Chrome.
2. Tap the install prompt or menu.
3. Tap **Install app** / **Add to Home screen**.

### PWA Dev Command
```bash
pnpm dev:web
```

## Mobile App (apps/mobile)
Expo app reusing the same FastAPI backend with JWT stored in SecureStore.

### Included Screens
1. Login
2. Dashboard (market snapshot + quick links)
3. Properties search
4. Property Detail (map + insights + provenance modal)
5. Contacts (list + add/edit)
6. Outreach drafts (approve action)
7. Copilot chat

### Mobile API Base URL
Set `EXPO_PUBLIC_API_BASE_URL` in `.env.example` / environment:
- iOS simulator: `http://localhost:8000`
- Physical device: `http://<your-lan-ip>:8000`

### Mobile Dev Commands
```bash
pnpm install
pnpm dev:mobile
```

Then choose iOS/Android from Expo CLI.

## Root Scripts
- `pnpm run project:setup` — bootstrap local environment, migrations, deterministic seed, smoke checks
- `pnpm run project:doctor` — diagnostics for docker/api/db/redis/worker/web reachability
- `pnpm dev:web` — run Next.js web app
- `pnpm dev:api` — run API stack via docker compose (db/redis/api/worker/beat)
- `pnpm dev:mobile` — run Expo mobile app
- `pnpm smoke` — run API smoke checks (health, metrics, login, parcel query)
- `pnpm agency --role \"...\" --task \"...\"` — run internal agency role planner

## Internal Agency CLI
Developer-only utility based on locally vendored agent templates.

```bash
pnpm agency --role "Backend Architect" --task "Fix macOS seed file locking in docker"
```

Docs:
- [Agency CLI usage](./docs/agency/USAGE.md)
- Vendored upstream roster snapshot: `tools/agency-agents/upstream/`

## Enabling Real Providers Safely
Set `SANDBOX_MODE=false` only after credentials are configured.

### Postmark (Email)
Required env:
- `POSTMARK_SERVER_TOKEN`
- `POSTMARK_SENDER_EMAIL`

### Twilio (SMS)
Required env:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `TWILIO_VOICE_FROM_NUMBER` (optional; falls back to `TWILIO_FROM_NUMBER`)
- `PUBLIC_API_BASE_URL` set to the exact public HTTPS API base seen by Twilio/Postmark, including any path prefix such as `https://staging.example.com/api`
- `TWILIO_WEBHOOK_AUTH_TOKEN` to verify inbound/status callbacks if you want a dedicated verification secret

Twilio callback routes require `X-Twilio-Signature` validation. If `TWILIO_WEBHOOK_AUTH_TOKEN` is unset, the app falls back to `TWILIO_AUTH_TOKEN`.

Twilio console/staging callback URLs:
- Inbound SMS webhook: `${PUBLIC_API_BASE_URL}/webhooks/twilio/inbound`
- Delivery status webhook: `${PUBLIC_API_BASE_URL}/webhooks/twilio/status`
- Voice TwiML webhook: `${PUBLIC_API_BASE_URL}/webhooks/twilio/voice/twiml/{message_id}`
- Voice status webhook: `${PUBLIC_API_BASE_URL}/webhooks/twilio/voice/status`

SMS falls back to console behavior when Twilio SMS credentials are missing. Voice does not fake-send: it remains unavailable until the Twilio Voice env is complete.

### Delivery Webhooks
- `POSTMARK_WEBHOOK_USERNAME`
- `POSTMARK_WEBHOOK_PASSWORD`
- `POST /webhooks/twilio/status` records Twilio SMS delivery and failure receipts.
- `POST /webhooks/twilio/voice/twiml/{message_id}` serves approved TwiML for outbound calls.
- `POST /webhooks/twilio/voice/status` records Twilio voice lifecycle events (`queued`, `initiated`, `ringing`, `in-progress`, `completed`, `busy`, `no-answer`, `canceled`, `failed`).
- `POST /webhooks/postmark/delivery` records successful Postmark deliveries.
- `POST /webhooks/postmark/bounce` marks failed deliveries and suppresses hard-bounced email contacts.
- `POST /webhooks/twilio/inbound` and `POST /webhooks/twilio/status` now reject missing or invalid Twilio signatures.
- `POST /webhooks/twilio/voice/twiml/{message_id}` and `POST /webhooks/twilio/voice/status` also require valid Twilio signatures.
- `POST /webhooks/postmark/delivery` and `POST /webhooks/postmark/bounce` now require HTTP Basic auth using `POSTMARK_WEBHOOK_USERNAME` and `POSTMARK_WEBHOOK_PASSWORD`.

Postmark webhooks are configured on the Postmark server itself; point them at:
- `${PUBLIC_API_BASE_URL}/webhooks/postmark/delivery`
- `${PUBLIC_API_BASE_URL}/webhooks/postmark/bounce`

Staging-readiness note: this repo now has test coverage proving Twilio signature validation against a staging-style external base URL, but it has not yet completed a real Twilio/Postmark callback round-trip from a public deployment.

## Local-First LLM Configuration
Required env:
- `LLM_ENABLED=true`
- `LLM_PROVIDER=ollama` with `LLM_BASE_URL=http://localhost:11434`
  or `LLM_PROVIDER=lmstudio` with `LLM_BASE_URL=http://localhost:1234`
- `LLM_MODEL=<local model name>`

Optional tuning:
- `LLM_TIMEOUT_SECONDS`
- `LLM_MAX_TOKENS`
- `LLM_TEMPERATURE`

Behavior notes:
- Deterministic results remain authoritative whether the provider is online or offline.
- `/copilot/llm-status` reports live reachability.
- Ollama uses `/api/generate`; LM Studio uses `/v1/chat/completions`.
- If the provider is unavailable, copilot falls back to deterministic-only output and generation endpoints fail closed or return `unavailable=true`.

## Architecture Summary
- `apps/api`: ingestion, truth-layer metrics, property hub APIs, compliance-enforced outreach, Twilio SMS + voice webhooks.
- `apps/web`: dashboard, copilot, property hub/detail with provenance drawer, contacts CRUD, outreach approvals, PWA install/offline support.
- `apps/mobile`: Expo Router app for the same backend endpoints and workflows.
- `seed/`: synthetic parcels, permits, flood zones, POIs, transit stops, mortgage-rate trend series.
- `docs/compliance`: source-linked compliance references used by enforcement points.

## Truth Layer Storage
Metrics are never fabricated. Values are computed from stored data and include metadata persisted in:
- `metric_definitions`: key/version + formula markdown
- `metric_values`: computed outputs + `inputs_json` + `provenance_json`
- `provenance_records`: source identifiers, raw URL/hash, fetched time, TTL, raw payload

Responses include:
- `metric_key`, `version`
- `formula_markdown`
- `inputs`
- `provenance`
- freshness state (`fetched_at`, `ttl_seconds`, staleness)

## Compliance Enforcement (Code + Docs)
Code-enforced controls include:
- Consent gating for SMS and voice outbound (`opt_in` required per channel)
- STOP keyword inbound handling (`opt_out` + suppression immediately)
- Quiet hours (`8am–9pm America/New_York`)
- Frequency cap (max `3` outbound/day/channel/contact)
- Stop-on-reply enrollment stop
- Optional global revocation policy toggle (`ENFORCE_GLOBAL_REVOCATION=false` by default)
- Voice call scripts are served only from approved draft content, and Twilio voice callbacks are signature-verified before status changes are persisted.

Compliance behavior is implemented as configurable product policy defaults and audit controls, not legal advice.
See [Compliance Notice](./docs/compliance/NOTICE.md).

Reference docs:
- [CAN-SPAM](./docs/compliance/can_spam.md)
- [TCPA](./docs/compliance/tcpa.md)
- [Fair Housing Advertising](./docs/compliance/fair_housing_advertising.md)
- [RESO Web API Core](./docs/compliance/reso_web_api.md)

## API Endpoints Implemented
- `GET /healthz`
- `GET /metrics`
- `POST /auth/login`
- `GET /parcels/search?query=`
- `GET /parcels/{parcel_id}`
- `GET /opportunities`
- `GET /opportunities/events`
- `POST /ingest/run`
- `GET /insights/city/columbus`
- `GET /insights/parcels/{parcel_id}`
- `POST /insights/marketing-package/score`
- `GET/POST/GET(id)/PUT/DELETE /contacts`
- `GET /sequences`
- `POST /sequences/{sequence_id}/enroll/{contact_id}`
- `GET /outreach/drafts`
- `GET /outreach/voice-status`
- `POST /outreach/{message_id}/approve_and_send`
- `POST /webhooks/twilio/inbound`
- `POST /webhooks/twilio/status`
- `POST /webhooks/twilio/voice/twiml/{message_id}`
- `POST /webhooks/twilio/voice/status`
- `POST /webhooks/postmark/delivery`
- `POST /webhooks/postmark/bounce`
- `POST /copilot/chat`
- `GET /copilot/agents`

## Notes
- MLS/RESO module exists at `apps/api/app/integrations/reso/` and is disabled by default with explicit `NotImplementedError` unless enabled via env and paid credentials.
- No MLS scraping is implemented in MVP.
- Developer reset helper: `bash scripts/reset-dev.sh`.
