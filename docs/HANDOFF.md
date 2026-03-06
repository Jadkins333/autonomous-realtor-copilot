# HANDOFF: Autonomous Realtor Intelligence Copilot (Repo-Verified)
File: HANDOFF.md

## A) Executive Summary
- Product: multi-surface real-estate copilot focused on Columbus public-data workflows (web PWA + Expo mobile + FastAPI backend) with ingestion, insights, outreach approval, and copilot routing.
- What it does today:
  - Auth: demo credentials -> JWT (`/auth/login`) and NextAuth session bridge (`apps/web/lib/auth.ts`).
  - Property flow: parcel search/detail + map + permits/flood/transit/POI + timeline (`apps/api/app/services/parcels.py`, `apps/web/app/properties/`, `apps/mobile/app/(app)/properties/`).
  - Opportunities: deterministic heat/distress event-driven list and event log (`apps/api/app/services/opportunities.py`, web/mobile opportunities screens).
  - Truth Layer: metric definitions/values/provenance persisted and returned with formula/inputs/freshness (`apps/api/app/models/entities.py`, `apps/api/app/schemas/truth.py`, `apps/web/lib/truth.ts`).
  - Outreach: draft-first + approval APIs + compliance gating + STOP webhook handling (`apps/api/app/services/outreach.py`, `apps/api/app/services/compliance.py`).
  - Source ops: persisted source status, pause/resume, DLQ replay and drift guard (`apps/api/app/services/source_ops.py`, `apps/api/app/api/routes_sources.py`).
- Intentional non-goals/currently disabled:
  - MLS/RESO runtime sync is disabled by default (`ENABLE_MLS_SYNC=false` in `.env.example`; NotImplemented stubs in `apps/api/app/integrations/reso/client.py`).
  - Sandbox send default is ON (`SANDBOX_MODE=true` in `.env.example`; enforced in `approve_and_send` in `apps/api/app/services/outreach.py`).

## B) Monorepo Architecture Map
### Top-level map
- `apps/api`: FastAPI app, SQLAlchemy models, Alembic migrations, Celery worker/beat, seed bootstrap.
- `apps/web`: Next.js 14 App Router app with NextAuth, API proxy, PWA assets/SW.
- `apps/mobile`: Expo Router app with SecureStore auth and React Native screens.
- `docs`: architecture, compliance docs, dev notes, agency usage.
- `tools/agency`: local role-planning CLI.
- `tools/agency-agents`: vendored upstream roster snapshot + refresh script.
- `scripts`: setup/doctor/smoke/reset checks.
- `seed`: demo JSON fixtures (public-data fallback).
- `docker-compose.yml`: local runtime wiring.

### API app (`apps/api`)
- Entrypoints:
  - App: `apps/api/app/main.py` (`FastAPI(...)`, middleware, router include).
  - API router: `apps/api/app/api/router.py`.
  - Container start: `apps/api/scripts/start_api.sh` -> `alembic upgrade head` -> `python -m app.seed` -> uvicorn.
  - Worker/beat: `apps/api/scripts/start_worker.sh`, `apps/api/scripts/start_beat.sh`.
- Core modules:
  - Models: `apps/api/app/models/entities.py`, enums in `apps/api/app/models/enums.py`.
  - Services: ingestion, insights, opportunities, outreach, compliance, diagnostics under `apps/api/app/services/`.
  - Integrations: auditor/arcgis/overpass/gtfs/reso stubs under `apps/api/app/integrations/`.
- Env dependencies (primary): `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `SANDBOX_MODE`, source URLs, provider keys (see `.env.example`).

### Web app (`apps/web`)
- Entrypoints:
  - App router root: `apps/web/app/layout.tsx`.
- Pages under `apps/web/app/`.
  - NextAuth route: `apps/web/app/api/auth/[...nextauth]/route.ts`.
  - API proxy route: `apps/web/app/api/proxy/[...path]/route.ts`.
- Core modules:
  - Auth wiring: `apps/web/lib/auth.ts`, `apps/web/components/auth-guard.tsx`.
  - Shared fetch layer: `apps/web/lib/api.ts`.
  - PWA pieces: `apps/web/public/manifest.webmanifest`, `apps/web/public/sw.js`, `apps/web/components/pwa-register.tsx`, `apps/web/app/offline/page.tsx`.
- Env dependencies: `NEXT_PUBLIC_API_BASE_URL`, `API_INTERNAL_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_ENABLE_SW`.

### Mobile app (`apps/mobile`)
- Entrypoints:
  - Expo entry: `apps/mobile/index.js`.
  - Router root: `apps/mobile/app/_layout.tsx`.
  - Auth screen: `apps/mobile/app/(auth)/login.tsx`.
  - App tabs group: `apps/mobile/app/(app)/_layout.tsx`.
- Core modules:
  - Auth context + token persistence: `apps/mobile/lib/auth-context.tsx`.
  - API client: `apps/mobile/lib/api.ts`.
  - Provenance modal: `apps/mobile/components/provenance-modal.tsx`.
- Env dependencies: `EXPO_PUBLIC_API_BASE_URL`.

### Shared packages
- Workspace file (`pnpm-workspace.yaml`) includes only `apps/web` and `apps/mobile`.
- No separate reusable shared package module is currently part of the pnpm workspace.

## C) Runtime Stack & One-Command Setup
### Docker Compose services and wiring
Defined in `docker-compose.yml`:
- `db`: `postgis/postgis:16-3.4`, port `5432`, healthcheck via `pg_isready`.
- `redis`: `redis:7-alpine`, port `6379`, healthcheck `redis-cli ping`.
- `api`: built from `apps/api/Dockerfile`, port `8000`, depends on db/redis health.
- `worker`: same image, command `bash scripts/start_worker.sh`.
- `beat`: same image, command `bash scripts/start_beat.sh`.
- `web`: built from `apps/web/Dockerfile`, port `3000`, depends on `api`.

### Seed/fixture mechanism
- API image contains `apps/api/seed/` JSON files.
- Startup script copies seed files to writable `SEED_DIR` (`apps/api/scripts/prepare_seed.sh` -> `/tmp/app_seed`).
- Seed bootstrap (`apps/api/app/seed.py`) creates:
  - tenant/demo admin user,
  - metric definitions,
  - contacts + consent,
  - 10 outreach sequences + steps,
  - parcel/permit/flood/poi/transit fixtures,
  - fixed missing-signals parcel (`TEST_PARCEL_MISSING_SIGNALS_ID`),
  - optional live ingestion unless `SEED_DETERMINISTIC_ONLY=true`.

### Demo mode behavior
- `SANDBOX_MODE=true` default (`.env.example`).
- Connectors try live first; fallback to seed JSON if unavailable (`apps/api/app/services/ingestion.py`).
- Source status marks mode/state/drift/dlq counts in `source_status`.

### Startup commands and script naming
- One-command stack from README: `docker compose up --build` (`README.md`).
- Project scripts from root `package.json`:
  - `pnpm run project:setup` -> `scripts/setup.sh`.
  - `pnpm run project:doctor` -> `scripts/doctor.sh`.
- Why `project:*`: avoids conflict with pnpm builtins (`README.md`, `DEV.md`).

## D) API Surface Area (FastAPI)
Router include list: `apps/api/app/api/router.py`.

### Health/Auth
- `GET /healthz` (public)
  - Owner: `apps/api/app/api/routes_health.py` (`healthz`).
  - Response: `{ "ok": true }`.
- `GET /metrics` (public)
  - Owner: `apps/api/app/api/routes_health.py` (`metrics`), payload from `apps/api/app/services/metrics.py` (`get_metrics_payload`).
  - Response keys: `parcels`, `permits`, `messages`, `drafts`, `dlq_size`, `last_source_run_status`, `last_source_run_started_at`.
- `POST /auth/login` (public)
  - Owner: `apps/api/app/api/routes_auth.py` (`login`).
  - Request: `LoginRequest` (`apps/api/app/schemas/auth.py`) `{email,password}`.
  - Response: `TokenResponse` `{access_token, token_type, user}`.

### Parcels/Negotiation
- `GET /parcels/search?query=` (bearer)
  - Owner: `apps/api/app/api/routes_parcels.py` (`parcels_search`).
  - Response model: `list[ParcelSearchResult]` (`schemas/parcels.py`).
- `GET /parcels/{parcel_id}` (bearer)
  - Owner: `apps/api/app/api/routes_parcels.py` (`parcel_detail`), service `apps/api/app/services/parcels.py` (`get_parcel_detail`).
  - Response: parcel core + provenance + permit summary + flood + POIs + transit + timeline + `insights` block.
- `GET /parcels/{parcel_id}/negotiation` (bearer)
  - Owner: `apps/api/app/api/routes_parcels.py` (`parcel_negotiation`), service `apps/api/app/services/negotiation.py` (`compute_negotiation_insight`).
  - Deterministic score/rules + insufficient_data handling.

### Opportunities
- `GET /opportunities` (bearer)
  - Owner: `apps/api/app/api/routes_opportunities.py` (`opportunities`), service `apps/api/app/services/opportunities.py` (`list_opportunities`).
  - Response: `{status, model_version, items[]}` with heat/distress/provenance fields.
- `GET /opportunities/events` (bearer)
  - Owner: `apps/api/app/api/routes_opportunities.py` (`opportunity_events`).
  - Query: `parcel_id?`, `severity?`, `days`, `limit`.
- `POST /opportunities/{parcel_id}/status` (bearer)
  - Owner: `apps/api/app/api/routes_opportunities.py` (`update_opportunity_status`).
  - Request: `OpportunityStatusUpdateRequest` (`schemas/opportunities.py`).
  - Side effect: writes `opportunity_states` and creates `opportunity_events` `event_type=status_change`.

### Ingestion/Insights
- `POST /ingest/run` (bearer)
  - Owner: `apps/api/app/api/routes_ingest.py` (`ingest_run`) -> `apps/api/app/services/ingestion.py` (`run_ingestion`).
- `GET /insights/city/columbus` (bearer)
  - Owner: `apps/api/app/api/routes_insights.py` (`city_columbus`) -> `compute_micro_market_nowcast`.
- `GET /insights/parcels/{parcel_id}` (bearer)
  - Owner: `apps/api/app/api/routes_insights.py` (`parcel_insights`) -> `compute_parcel_insights`.
- `POST /insights/marketing-package/score` (bearer)
  - Owner: `apps/api/app/api/routes_insights.py` (`marketing_score`).
  - Request: `MarketingPackageInput` (`schemas/insights.py`).
  - Response shape from `score_marketing_package` includes score/breakdown/flagged_terms/formula/provenance.

### Contacts/Sequences
- `GET /contacts` (bearer)
- `POST /contacts` (bearer)
- `GET /contacts/{contact_id}` (bearer)
- `PUT /contacts/{contact_id}` (bearer)
- `DELETE /contacts/{contact_id}` (bearer)
  - Owner: `apps/api/app/api/routes_contacts.py`.
  - Models: `ContactCreate/Update/Out` in `schemas/contacts.py`.
- `GET /sequences` (bearer)
- `POST /sequences/{sequence_id}/enroll/{contact_id}` (bearer)
  - Owner: `routes_sequences.py`, service `services/sequences.py`.

### Outreach/Webhooks
- `GET /outreach/drafts` (bearer)
- `POST /outreach/draft-pack` (bearer)
  - Request: `DraftPackCreateIn`; response `DraftPackOut`.
- `POST /outreach/draft-pack/{pack_id}/submit` (bearer)
- `GET /outreach/draft-pack/{pack_id}` (bearer)
- `GET /outreach/draft-packs?status&cursor&limit` (bearer)
- `POST /outreach/drafts/{message_id}/approve` (bearer)
- `POST /outreach/drafts/{message_id}/reject` (bearer)
- `POST /outreach/{message_id}/approve_and_send` (bearer)
  - Owner: `apps/api/app/api/routes_outreach.py`, service `services/outreach.py`.
- `POST /webhooks/twilio/inbound` (public)
  - Owner: `routes_webhooks.py`, form fields `From`, `Body`, `MessageSid`.
  - Effect: inbound message row + STOP opt-out/suppression + stop-on-reply logic in `handle_inbound_sms`.

### Copilot
- `GET /copilot/agents` (bearer)
  - Owner: `apps/api/app/api/routes_copilot.py` (`copilot_agents`); source `apps/api/app/copilot/registry.py`.
- `POST /copilot/chat` (bearer)
  - Request: `CopilotRequest` (`schemas/copilot.py`) `{message}`.
  - Response: `CopilotChatResponse` fields `{status,text,data,missing_inputs,trace}`.
  - Trace contract built in `apps/api/app/copilot/router.py`:
    - `selected_agent`, `decisions[]`, `tools_used[]`,
    - `provenance {provenance_record_ids, source_run_ids}`,
    - `freshness {sources[], summary}`.

### Sources/System (diagnostics/admin)
- `GET /sources/status` (bearer)
  - Any authenticated role.
- `POST /sources/{source_name}/pause` (admin)
- `POST /sources/{source_name}/resume` (admin)
- `POST /sources/{source_name}/dlq/replay` (admin)
  - Returns HTTP 409 when replay blocked (drift/paused).
- `POST /sources/{source_name}/debug/drift` (admin + debug gate)
  - Blocked when `ENVIRONMENT=production` or `DEBUG_DIAG=false`.
- `GET /system/diagnostics` (admin)
  - coarse status only (no secrets).

## E) Data Model (DB)
Source of truth: `apps/api/app/models/entities.py` + Alembic revisions under `apps/api/alembic/versions/`.

### Core tables
- Tenancy/auth: `tenants`, `users`.
- Sources/provenance: `sources`, `source_status`, `source_runs`, `provenance_records`, `schema_drift_dlq`.
- Truth layer: `metric_definitions`, `metric_values`.
- Real estate: `parcels`, `permits`, `flood_zones`, `poi_features`, `transit_stops`.
- Outreach/compliance: `contacts`, `consent_events`, `suppression_list`, `conversations`, `messages`, `outreach_draft_packs`, `sequences`, `sequence_steps`, `sequence_enrollments`, `compliance_events`.
- Opportunities: `opportunity_events`, `opportunity_states`.

### Key query columns/constraints
- Unique constraints:
  - `users(tenant_id,email)`
  - `metric_definitions(key,version)`
  - `source_status(source_name)`
  - `schema_drift_dlq(dedupe_key)`
  - `opportunity_events(dedupe_key)`
  - `opportunity_states(tenant_id,parcel_id)`
- Spatial columns (PostGIS):
  - `parcels.geom/centroid`, `permits.geom`, `flood_zones.geom`, `poi_features.geom`, `transit_stops.geom`.
- Explicit indexes (migrations):
  - `ix_opportunity_events_tenant_created`, `ix_opportunity_events_parcel` (`0003_opportunity_events.py`).
  - `ix_messages_pack_id` (`0004_draft_packs_negotiation_truth.py`).

### Migration files
- `0001_initial.py`: baseline schema.
- `0002_source_status_and_dlq_dedupe.py`: `source_status` + DLQ dedupe fields.
- `0003_opportunity_events.py`: opportunity event table/indexes.
- `0004_draft_packs_negotiation_truth.py`: draft packs, opportunity states, metric required inputs.

## F) Truth Layer Contract
### Canonical no-fabricate rule in code
- Coverage is deterministic: `compute_coverage_summary` in `apps/api/app/services/coverage.py`.
- Required inputs come from metric definitions (`metric_definitions.required_inputs_json`) and are checked before scoring in insights/negotiation services.
- Missing required input path returns `status="insufficient_data"` and numeric score `null` where required (e.g., nowcast/negotiation).

### Canonical schema
- API Pydantic model: `apps/api/app/schemas/truth.py` (`TruthMetricResponse`) with:
  - `formula_key`, `formula_version`, `formula_markdown`
  - `inputs` (`TruthInput` has `value`, `fields`, `ids`)
  - `provenance.sources[]` (`source_id`, `raw_url`, freshness)
  - `freshness` (`fetched_at`, `ttl_seconds`, `staleness`, `is_stale`)
  - `coverage_summary`, `missing_inputs`, `insufficient_data`.
- Web TS mirror + runtime guard:
- `apps/web/lib/truth.ts` (`TruthMetricResponse`, `isTruthMetricResponse(...)`).
  - Unit tests: `apps/web/lib/truth.test.ts`.

### Provenance/freshness internals
- Provenance rows: `provenance_records` model fields include `source_id`, `raw_url`, `raw_hash`, `fetched_at`, `ttl_seconds`, `raw_json`.
- Freshness evaluation: `apps/api/app/services/provenance.py` (`freshness`).
- Staleness based on `now - fetched_at > ttl_seconds`.

### Formula locations and computation
- Definitions seeded/updated in `apps/api/app/seed.py` (`_ensure_metric_definitions`).
- Compute logic:
  - `micro_market_nowcast_v1` in `apps/api/app/services/insights.py` (`compute_micro_market_nowcast`).
  - `marketing_package_health_v1` in `apps/api/app/services/insights.py` (`score_marketing_package`).
  - `renovation_roi_v1`, `insurance_pressure_v1` in `apps/api/app/services/insights.py` (`compute_parcel_insights`).
  - `negotiation_motivation_v1` in `apps/api/app/services/negotiation.py` (`compute_negotiation_insight`).
- Metric values persisted via `_store_metric_value` in each service.

## G) Ingestion System
### Supported sources and modes
Defined in `services/ingestion.py`:
- `franklin_auditor` via `JsonRestConnector`.
- `columbus_arcgis_permits` via `ArcGISFeatureServiceClient`.
- `fema_nfhl` via `ArcGISFeatureServiceClient` when URL configured.
- `osm_overpass` via `OverpassClient`.
- `cota_gtfs` via `GTFSClient` when URL configured.

Modes:
- `live` when fetch succeeds.
- `fixture` when fallback seed used or source paused.
Stored in `source_status.mode`.

### Drift detection / DLQ / replay
- Payload validation with Pydantic models (`ParcelPayload`, `PermitPayload`, etc.).
- Drift/error rows written to `schema_drift_dlq` via `_record_schema_drift`.
- Stable dedupe key strategy: `sha256(source|external_id|event_type|payload_version)` in `_dlq_dedupe_key`.
- Replay endpoint (`replay_source_dlq`) blocked when:
  - `drift_detected=true`, or
  - source state `paused`.
- Replay idempotency:
  - skips previously replayed (`last_replayed_at` set),
  - skips duplicate unchanged provenance hashes.

### Circuit breaker / retry / idempotency
- Circuit breaker class: `apps/api/app/utils/circuit_breaker.py`.
- Breaker instances per source in `BREAKERS` map in `ingestion.py`.
- On live failure/open breaker: fallback to seed, status partial/failure.
- Idempotent provenance skip: `_upsert_provenance` compares `raw_hash` and TTL.
- Explicit jittered retry loop: UNKNOWN (no general retry-with-jitter implementation found in current connectors).

### Source status persistence and pause/resume behavior
- Persisted in `source_status` table (`apps/api/app/models/entities.py`, `SourceStatus`).
- Lifecycle operations in `services/source_ops.py`:
  - start touch, finish touch,
  - pause/resume,
  - drift debug set,
  - DLQ count recompute.
- Drift rule: drift forces paused state and replay block until resolved.

## H) Outreach + Compliance (Sandbox-First)
### Consent/suppression/quiet-hours/frequency/reply-stop
Implemented in:
- Policy checks: `apps/api/app/services/compliance.py` (`enforce_outbound_policy`).
- Inbound STOP + suppression: `apps/api/app/services/outreach.py` (`handle_inbound_sms`).
- Sequence stop-on-reply: `apps/api/app/services/compliance.py` (`stop_enrollments_on_reply`) called by inbound handler.

Rule behavior in code:
- SMS/voice require explicit opt-in (`has_explicit_channel_consent`).
- Suppression list blocks outbound.
- Quiet hours enforced (`America/New_York`, defaults 8-21 from config).
- Frequency cap enforced (`settings.frequency_cap_per_day`, default 3).
- STOP keywords trigger `consent_events opt_out` + `suppression_list` + compliance event.
- Optional global revocation controlled by `ENFORCE_GLOBAL_REVOCATION`.

### Provider interfaces and sandbox behavior
- Provider interfaces and implementations: `apps/api/app/services/providers.py`.
  - Email: console + Postmark.
  - SMS: console + Twilio.
- Provider selection by `SANDBOX_MODE` + credentials (`get_email_provider`, `get_sms_provider`).
- Approval/send flow in `apps/api/app/services/outreach.py` (`approve_and_send`).

### Sequences and enrollments
- Seeded templates: 10 sequence keys in `apps/api/app/seed.py` (`_ensure_sequences`).
- Enrollment and first draft generation: `apps/api/app/services/sequences.py` (`enroll_contact_in_sequence`).
- Worker progression: `advance_sequence_steps` run by Celery task `advance_sequences_task`.

### Compliance docs and code linkage
Docs under `docs/compliance/`:
- `NOTICE.md`, `tcpa.md`, `can_spam.md`, `fair_housing_advertising.md`, `reso_web_api.md`.
- Compliance registry map: `apps/api/app/compliance/registry.py` (`rule_key -> doc_path + links`).
- Registry test: `apps/api/tests/test_compliance_registry.py` validates rule keys and doc links.

## I) Web App (Next.js)
### Routes/pages
Under `apps/web/app`:
- `/dashboard`, `/setup`, `/sources`, `/opportunities`, `/opportunities/events`, `/properties`, `/properties/[id]`, `/contacts`, `/outreach`, `/copilot`, `/copilot/agents`, `/login`, `/offline`.
- API routes: `/api/auth/[...nextauth]`, `/api/proxy/[...path]`.

### Key UI modules
- Copilot chat + trace UX: `apps/web/app/copilot/page.tsx`.
- Provenance drawer: `apps/web/components/provenance-drawer.tsx`.
- Setup/health and source admin pages: `apps/web/app/setup/page.tsx`, `apps/web/app/sources/page.tsx`.
- Opportunity views: `apps/web/app/opportunities/`.
- Property detail map/timeline: `apps/web/app/properties/[id]/page.tsx`, `components/property-map.tsx`.
- Global banners:
  - fixture banner from `/sources/status`: `components/fixture-mode-banner.tsx`.
  - offline banner: `components/offline-banner.tsx`.

### PWA + SW behavior
- Manifest: `apps/web/public/manifest.webmanifest`.
- SW: `apps/web/public/sw.js`.
  - Precache static essentials (`/offline`, manifest, icons, apple icon, favicon).
  - Navigate requests: network-first fallback to `/offline`.
  - Static assets: cache-first.
  - `/api/proxy/*`: network-first with cache fallback.
- SW registration guard: `components/pwa-register.tsx` registers only in production unless `NEXT_PUBLIC_ENABLE_SW=true`.
- Verified icon binaries:
  - `file` reports valid PNG/ICO for icon assets.

### Build wrapper behavior (Node 25 host)
- `apps/web/scripts/build.js` and `apps/web/scripts/test.js` detect Node >=25 and run Docker Node20 path.
- Docker path uses `docker compose run --build --rm web pnpm build:local` / `pnpm run test:local`.
- Web Dockerfile: `apps/web/Dockerfile`.

## J) Mobile App (Expo)
### Navigation layout
- Root auth gate: `apps/mobile/app/_layout.tsx`.
- Auth stack/group: `apps/mobile/app/(auth)/login.tsx`.
- App tabs: `apps/mobile/app/(app)/_layout.tsx`.
- Tabs include: dashboard, opportunities, properties, contacts, outreach, copilot.

### Key screens and parity
- Dashboard: market snapshot + provenance modal + tour mode (`app/(app)/dashboard.tsx`).
- Opportunities list: `app/(app)/opportunities.tsx`.
- Properties search/detail map: `app/(app)/properties/index.tsx`, `[id].tsx`.
- Contacts CRUD: `app/(app)/contacts/index.tsx`.
- Outreach: drafts list + approve action (`app/(app)/outreach/index.tsx`).
- Copilot chat + agents view: `app/(app)/copilot/index.tsx`, `copilot/agents.tsx`.

### Auth/token handling vs web
- Mobile:
- direct API login (`apps/mobile/lib/api.ts` `login` to `/auth/login`),
  - token/user persisted in SecureStore (`lib/auth-context.tsx`).
- Web:
  - NextAuth credentials provider hits `/api/proxy/auth/login`,
  - api token injected into NextAuth JWT/session (`apps/web/lib/auth.ts`).

### Maps and platform guards
- Uses `react-native-maps` in property detail.
- Coordinates fallback when missing/invalid to Columbus defaults.
- iPad support enabled in `apps/mobile/app.json` (`ios.supportsTablet=true`).

## K) Observability & Diagnostics
- API logs are structured JSON formatter (`apps/api/app/core/logging.py`).
- `request_id` generated in middleware (`apps/api/app/main.py`, `request_context_middleware`) and emitted in response header `x-request-id`.
- `/healthz`: liveness.
- `/metrics`: row counts + last source run status (`services/metrics.py`).
- `/system/diagnostics`:
  - admin-only,
  - returns build/db/redis/heartbeat/source reachability/env checklist (`services/system_diag.py`),
  - avoids secrets by design (coarse booleans/messages).

## L) Tests, Smoke, Acceptance Gates
### API tests (`apps/api/tests`)
- Compliance policy checks: `test_compliance.py`.
- Compliance registry/doc links: `test_compliance_registry.py`.
- Copilot trace contract and outreach writer constraints: `test_copilot_trace_contract.py`, `test_copilot_outreach_writer.py`.
- Coverage math: `test_coverage_summary.py`.
- Draft pack + opportunity status event behavior: `test_draft_packs_and_opportunity_status.py`.
- Insufficient-data contracts: `test_insufficient_data_contract.py`, `test_truth_layer_no_fabricate.py`.
- Live-source fallback contract: `test_live_source_contract_fallback.py`.
- Sources/system auth + admin gating: `test_sources_system_routes.py`.
- RESO disabled stub check: `test_reso_stub.py`.

### Web tests
- `apps/web/lib/truth.test.ts` (truth response guard).
- `apps/web/lib/utils.test.ts` (utility class merge).

### Smoke gates (`scripts/smoke.sh`)
Asserts include:
- health + metrics + web login route reachability.
- demo login token issuance.
- parcels detail/opportunities/event route shapes.
- city truth/provenance contract keys present.
- missing-signals parcel returns `insufficient_data`.
- Twilio-style STOP webhook path triggers:
  - sms opt_out consent row,
  - suppression row,
  - subsequent SMS draft approval blocked with compliance event.
- sandbox approval blocked and compliance event recorded.
- drift debug set -> replay refusal (409) -> clear drift -> deterministic replay response.
- forced source unreachable -> source marked stale while core parcel/insight calls still work.

### Commands validated during this handoff
- `docker compose ps` (all services up).
- `curl http://localhost:8000/healthz` -> `{"ok":true}`.
- `curl http://localhost:8000/metrics` -> JSON counts.
- `pnpm run project:doctor` -> all checks passed.
- `pnpm smoke` -> passed.
- `pnpm --filter web build` -> passed (Docker Node20 wrapper path).
- `pnpm --filter web test` -> passed (vitest via Docker wrapper).
- `docker compose exec -T api pytest -q` -> `34 passed`.

Coverage gaps observed:
- No dedicated web integration test for API proxy route behavior under header/body edge cases.
- No mobile automated test suite (UI/API interactions are runtime-only).
- Mobile `tsc --noEmit` command did not complete within 45s in this environment (see Known Issues).

## M) Known Issues / Footguns
1. Mobile TS typecheck hangs in this environment:
- Command `pnpm --filter mobile exec tsc --noEmit` timed out at 45s during this handoff.
- `tsc --showConfig` works; full noEmit run appears to stall.

2. Outreach provider send path likely contains unreachable provider branch:
- In `apps/api/app/services/outreach.py` (`approve_and_send`), email/sms blocks include unconditional `return {\"status\":\"failed\", ...}` directly after missing-contact guard block, which appears to bypass provider send path even when contact data exists.

3. Next build skips strict type/lint checks by config:
- `apps/web/next.config.mjs` sets `typescript.ignoreBuildErrors=true` and `eslint.ignoreDuringBuilds=true`.

4. Reserved pnpm script-name caveat:
- Project intentionally uses `project:setup`/`project:doctor` to avoid pnpm builtin collisions (`README.md`, `DEV.md`).

5. Security posture caveat:
- API CORS currently allows all origins (`allow_origins=["*"]` in `apps/api/app/main.py`).

6. Debug drift endpoint exposure risk if misconfigured:
- `/sources/{source_name}/debug/drift` is blocked in production and when `DEBUG_DIAG=false`, but should remain carefully controlled in non-prod.

## N) Roadmap (Strictly Derived From Missing Pieces)
### Baseline comparison source
- Full original MVP spec document was **not found as a file inside this repo**.
- Comparison baseline used: `README.md`, `docs/architecture.md`, API routes/services/models/tests currently present.
- UNKNOWN to confirm exact historical requirement text: any external prompt/spec not checked into repository.

### Missing/partial items and smallest next steps
1. Mobile parity for draft packs (pack list/detail/approve/reject)
- Current mobile outreach uses only legacy `/outreach/drafts` + approve.
- Next step: add mobile screens/actions for `/outreach/draft-packs`, `/outreach/draft-pack/{id}`, `/outreach/drafts/{id}/approve|reject`.
- Likely files: `apps/mobile/app/(app)/outreach/index.tsx`, new nested screens, `apps/mobile/lib/api.ts`, `apps/mobile/lib/types.ts`.

2. Mobile fixture-mode banner from `/sources/status`
- Web has persistent fixture banner; mobile currently does not.
- Next step: fetch `/sources/status` in mobile app shell and render non-dismissible fixture notice.
- Likely files: `apps/mobile/app/(app)/_layout.tsx` or shared component + `lib/api.ts`.

3. Web proxy behavior tests
- Proxy implementation exists, but no explicit test coverage for header stripping/body forwarding.
- Next step: add focused test for `app/api/proxy/[...path]/route.ts` request/response pass-through.
- Likely files: add a new test file under `apps/web/app/api/proxy/` (or integration harness under web tests).

4. Explicit retry-with-jitter for connector live calls
- Circuit breaker + fallback exists; generalized retry-with-jitter loop not present.
- Next step: add bounded retry helper used by connector fetch functions before fallback.
- Likely files: `apps/api/app/services/ingestion.py` and/or integration client wrappers.

5. Outreach real-send code-path verification
- Due likely early-return bug in `approve_and_send`, non-sandbox sends may never execute provider sends.
- Next step: patch conditionals and add tests for successful provider invocation when `SANDBOX_MODE=false` + contact channel present.
- Likely files: `apps/api/app/services/outreach.py`, `apps/api/tests/` (new focused tests).

### MLS/RESO future status
- Current status: disabled plugin scaffold only (`apps/api/app/integrations/reso/`).
- To enable later: tenant credential storage + metadata sync + resource mapping + explicit legal/commercial credential workflow + guarded feature flag rollout.

## O) Phase2 Redo Update (2026-03-05)
Resolved in branch `codex/phase2-sources-ui-tests`:
- Ingestion now uses bounded retry with backoff+jitter before fixture fallback (`apps/api/app/services/ingestion.py`).
- Outreach approve/send bug fixed for non-sandbox email/sms sends; missing-contact failures now return safely and keep `pack_status` guarded (`apps/api/app/services/outreach.py`).
- `/sources/status` now has an explicit response schema contract (`apps/api/app/schemas/sources.py`, `apps/api/app/api/routes_sources.py`).
- Mobile outreach now supports draft pack list + detail + submit + approve + reject actions (`apps/mobile/app/(app)/outreach/index.tsx`, `apps/mobile/lib/api.ts`).
- Fixture banner no longer silently swallows source-status failures; dev-visible warning path added (`apps/web/components/fixture-mode-banner.tsx`).
- Web proxy route tests added and Vitest discovery expanded to include app route tests (`apps/web/app/api/proxy/[...path]/route.test.ts`, `apps/web/vitest.config.ts`).

New regression coverage:
- `apps/api/tests/test_phase2_handoff_regressions.py` verifies retry+jitter behavior, outreach pack-status safety in approve/send error path, and authenticated `/sources/status` response shape.
- `apps/web/app/api/proxy/[...path]/route.test.ts` verifies GET query/header stripping, POST body forwarding, response header sanitization, path-segment encoding, and undefined-path root fallback.

## P) Mobile Fixture Banner Follow-up (2026-03-05)
- Added mobile fixture-mode visibility in app shell via `/sources/status` polling.
- New banner component: `apps/mobile/components/fixture-mode-banner.tsx`.
- App tabs shell now mounts the banner globally: `apps/mobile/app/(app)/_layout.tsx`.
- Mobile API now exposes typed source-status client call: `apps/mobile/lib/api.ts`, `apps/mobile/lib/types.ts`.
- Failure path is dev-visible (warning text + console warning) rather than silently hidden.
- Verification: `pnpm --filter mobile exec tsc --noEmit -p tsconfig.check.json` passed.

## Q) Outreach Provider Path Regression Coverage (2026-03-05)
- Added regression tests proving non-sandbox approve/send invokes live provider path for both email and sms drafts.
- File: `apps/api/tests/test_phase2_handoff_regressions.py`.
- New tests:
 - `test_approve_and_send_email_non_sandbox_invokes_provider`
 - `test_approve_and_send_sms_non_sandbox_invokes_provider`
- Assertions include provider invocation arguments, sent status transition, provider message id propagation, and pack status passthrough.

## R) Web Fixture Banner Test Coverage (2026-03-05)
- Added component tests for fixture banner behavior under failure and success paths.
- File: `apps/web/app/fixture-mode-banner.test.tsx`.
- Covers:
 - dev-visible warning when session cache parse fails,
 - dev-visible warning when `/sources/status` refresh fails,
 - fixture banner visibility when a critical source reports `mode=fixture`.
- Minor compatibility fix for Vitest JSX runtime: `apps/web/components/fixture-mode-banner.tsx` now imports `React` default.

## S) Script Line Ending Hardening (2026-03-05)
- Added repo `.gitattributes` rule: `*.sh text eol=lf`.
- Prevents Windows checkout CRLF from breaking bash scripts (`set -euo pipefail` / `pipefail\r` errors).
- Verified with:
 - `pnpm run project:doctor` (all checks passed)
 - `pnpm smoke` (passed end-to-end).

## T) CORS Policy Hardening (2026-03-05)
- Replaced API CORS wildcard defaults with explicit configurable origins.
- New setting: `CORS_ALLOW_ORIGINS` (comma-separated), default `http://localhost:3000,http://127.0.0.1:3000`.
- Middleware now derives `allow_credentials` from origin mode (`false` for wildcard, `true` otherwise).
- Files: `apps/api/app/core/config.py`, `apps/api/app/main.py`, `.env.example`.
- Added regression coverage: `apps/api/tests/test_cors_policy.py` (config parsing, wildcard handling, preflight allow-origin behavior).


## U) Stability Hardening Follow-up (2026-03-06)
- Added explicit `HEAD` handler in web proxy route and expanded route tests to cover `HEAD` and `OPTIONS` forwarding semantics (`apps/web/app/api/proxy/[...path]/route.ts`, `apps/web/app/api/proxy/[...path]/route.test.ts`).
- Proxy context typing is now optional-safe for path params (`path?: string[]`), matching undefined-path fallback behavior used in tests.
- API pytest warning noise reduced with explicit async fixture loop scope and known passlib crypt deprecation filter in `apps/api/pyproject.toml`; current gate output is clean (`44 passed`).
- Mobile outreach draft-pack surface now uses typed pack models and guarded async actions with user-visible failure alerts; action buttons are disabled while a request is in-flight to prevent duplicate submissions (`apps/mobile/app/(app)/outreach/index.tsx`, `apps/mobile/lib/api.ts`, `apps/mobile/lib/types.ts`).
- Web Vitest config migrated to ESM (`apps/web/vitest.config.mts`) to remove the Vite CJS Node API deprecation warning during local test runs.
- Repository line-ending policy expanded beyond shell scripts: `.gitattributes` now enforces LF for `*.ts`, `*.tsx`, `*.js`, `*.mjs`, `*.cjs`, and `*.json` to prevent recurring CRLF churn on Windows checkouts.
- Repeated verification after each chunk: `docker compose exec -T api pytest -q` (`44 passed`), `pnpm --filter web test:local` (`13 passed`), `pnpm --filter mobile exec tsc --noEmit -p tsconfig.check.json` (pass).
