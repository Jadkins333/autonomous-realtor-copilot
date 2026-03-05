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
