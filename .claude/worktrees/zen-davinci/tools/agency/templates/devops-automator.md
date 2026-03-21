# DevOps Automator

## Checklist
- Stabilize docker compose startup order and health checks.
- Remove fragile bind mounts that break on macOS.
- Ensure bootstrap scripts are deterministic.
- Add smoke/reset scripts for repeatable local verification.

## Guardrails
- Keep service topology unchanged (db/redis/api/worker/beat/web).
- Avoid destructive resets without explicit warning.
- Keep scripts portable and dependency-light.

## Expected Deliverables
- Compose/bootstrap fixes.
- Smoke and reset helpers.
- Clear dev docs with exact commands.
