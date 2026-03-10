# Launch Readiness Checklist

This checklist is specific to the current `codex/reconcile-ui-llm` product surface.

## Product Honesty

- Voice is either genuinely available through Twilio or clearly unavailable in UI/API copy.
- AI outputs are labeled as assistive or generated.
- Deterministic scores, compliance decisions, and execution state remain authoritative.
- Provider-unavailable states are understandable and fail safe.

## External Integrations

- `PUBLIC_API_BASE_URL` is set to the exact public HTTPS API base seen by vendors.
- Twilio inbound webhook points to `${PUBLIC_API_BASE_URL}/webhooks/twilio/inbound`.
- Twilio status callback points to `${PUBLIC_API_BASE_URL}/webhooks/twilio/status`.
- Twilio voice TwiML URL is reachable at `${PUBLIC_API_BASE_URL}/webhooks/twilio/voice/twiml/{message_id}`.
- Twilio voice status callback points to `${PUBLIC_API_BASE_URL}/webhooks/twilio/voice/status`.
- `TWILIO_WEBHOOK_AUTH_TOKEN` is set, or `TWILIO_AUTH_TOKEN` is intentionally reused for signature validation.
- `TWILIO_VOICE_FROM_NUMBER` or a voice-capable `TWILIO_FROM_NUMBER` is configured.
- Postmark delivery webhook points to `${PUBLIC_API_BASE_URL}/webhooks/postmark/delivery`.
- Postmark bounce webhook points to `${PUBLIC_API_BASE_URL}/webhooks/postmark/bounce`.
- `POSTMARK_WEBHOOK_USERNAME` and `POSTMARK_WEBHOOK_PASSWORD` are configured in both the app and Postmark.
- A real staging/public callback round-trip has been captured from Twilio.
- A real staging/public outbound voice call has been captured from Twilio, including TwiML fetch and final call status.
- A real staging/public callback round-trip has been captured from Postmark.

## Local-First LLM

- `LLM_ENABLED=true` only when a local provider is intentionally available.
- `LLM_PROVIDER`, `LLM_BASE_URL`, and `LLM_MODEL` match the running provider.
- `GET /copilot/llm-status` reports the expected provider and reachability.
- Live-provider smoke evidence exists at `artifacts/verification/llm-live-smoke.json`.
- Offline fallback smoke has been rerun after config changes.
- Generated outreach rewrites still pass the deterministic compliance post-check.

## Verification Gates

- `python -m pytest apps/api/tests -q`
- `python -m pytest apps/api/tests/test_webhook_delivery_callbacks.py -q`
- `pnpm --filter web test:local`
- `pnpm --filter web build`
- `python scripts/llm_live_smoke.py --output artifacts/verification/llm-live-smoke.json`
- `python scripts/llm_smoke.py`

## Still Manual

- Twilio console/webhook configuration review
- Twilio voice caller ID, TwiML fetch, and status callback review
- Postmark server webhook configuration review
- Public HTTPS reachability from vendor systems
- Real SMS/email/voice provider delivery in a staging environment with sandbox disabled
