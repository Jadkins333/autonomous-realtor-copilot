# Development Commands

> Use `pnpm run project:setup` and `pnpm run project:doctor` for this repo.  
> `pnpm setup` and `pnpm doctor` are pnpm builtins and are not project bootstrap/diagnostics.

## Install

```bash
cd "/Users/jon/Desktop/autonomous-realtor-copilot"
pnpm install
```

## API Stack (Docker)

```bash
pnpm dev:api
```

Services started: `db`, `redis`, `api`, `worker`, `beat`.

## Web

```bash
pnpm dev:web
```

Open: `http://localhost:3000`

## Mobile

iOS simulator:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000 pnpm dev:mobile
```

Physical device (same LAN):

```bash
EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:8000 pnpm dev:mobile
```

## Smoke Check

```bash
bash scripts/smoke.sh
```

## Bootstrap + Doctor

```bash
pnpm run project:setup
pnpm run project:doctor
```

## Reset Local Dev

```bash
bash scripts/reset-dev.sh
```

## Policy Guardrail

- Compliance controls are policy-driven defaults (`SANDBOX_MODE`, consent gates, quiet hours, caps, suppression) and should be treated as configurable deployment policy.

## Staging / Deployment Config

Set `PUBLIC_API_BASE_URL` to the exact public HTTPS base URL that external providers hit, including any path prefix.

Examples:
- `https://staging.example.com/api`
- `https://demo.example.com/backend`

Provider callback targets:
- Twilio inbound: `${PUBLIC_API_BASE_URL}/webhooks/twilio/inbound`
- Twilio status: `${PUBLIC_API_BASE_URL}/webhooks/twilio/status`
- Twilio voice TwiML: `${PUBLIC_API_BASE_URL}/webhooks/twilio/voice/twiml/{message_id}`
- Twilio voice status: `${PUBLIC_API_BASE_URL}/webhooks/twilio/voice/status`
- Postmark delivery: `${PUBLIC_API_BASE_URL}/webhooks/postmark/delivery`
- Postmark bounce: `${PUBLIC_API_BASE_URL}/webhooks/postmark/bounce`

Auth config:
- Twilio webhook validation uses `TWILIO_WEBHOOK_AUTH_TOKEN` when set, otherwise `TWILIO_AUTH_TOKEN`
- Postmark webhook auth uses `POSTMARK_WEBHOOK_USERNAME` + `POSTMARK_WEBHOOK_PASSWORD`
- Twilio Voice additionally needs `TWILIO_VOICE_FROM_NUMBER` or a voice-capable `TWILIO_FROM_NUMBER`
- Voice UI stays unavailable until `SANDBOX_MODE=false`, `PUBLIC_API_BASE_URL` is set, and Twilio voice env is complete

## Local-First LLM Config

Ollama example:
```bash
LLM_ENABLED=true
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2
```

LM Studio example:
```bash
LLM_ENABLED=true
LLM_PROVIDER=lmstudio
LLM_BASE_URL=http://localhost:1234
LLM_MODEL=<your-loaded-model>
```

Validation commands:
```bash
python scripts/llm_live_smoke.py --output artifacts/verification/llm-live-smoke.json
python scripts/llm_smoke.py
```

Important: the live smoke proves local provider behavior only. It does not prove a deployed/public callback round-trip from Twilio or Postmark.
