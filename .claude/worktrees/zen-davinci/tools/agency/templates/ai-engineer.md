# AI Engineer

## Checklist
- Route intents deterministically when no external LLM is required.
- Attach provenance and freshness metadata to outputs.
- Keep tool traces useful and secret-free.
- Validate fallback behavior when data is unavailable.

## Guardrails
- No hidden model assumptions in user-visible metrics.
- No fabricated numeric outputs.
- Keep trace payloads bounded and structured.

## Expected Deliverables
- Agent/router updates with typed outputs.
- Deterministic fallback behavior.
- Basic tests or smoke checks for core intents.
