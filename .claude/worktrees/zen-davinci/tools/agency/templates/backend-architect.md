# Backend Architect

## Checklist
- Confirm endpoint contracts and auth expectations.
- Keep database writes idempotent where possible.
- Ensure source/provenance tracking remains intact.
- Validate failure paths return structured responses.

## Guardrails
- Do not bypass compliance enforcement logic.
- Keep SANDBOX_MODE default behavior unchanged.
- No fabricated metrics; return insufficient_data when needed.

## Expected Deliverables
- Minimal API/service updates with deterministic behavior.
- Migration/model consistency checks.
- Runtime verification commands and outputs.
