# PR Draft: Phase2 Sources/UI/Tests Redo + Audit Reconciliation

## Title
Phase2 redo: ingestion jitter retry, outreach safety, sources status contract, mobile draft-pack flow, fixture/proxy test coverage

## Base / Head
- base: main
- head: codex/phase2-sources-ui-tests

## Summary
This PR delivers the phase2 redo items end-to-end across API, web, mobile, and tests, then reconciles audit documentation with current branch reality.

### Delivered
- Ingestion retry-with-jitter plus retry error context logging.
- Outreach approve/send non-sandbox provider path fix with pack_status safety.
- Typed /sources/status response contract.
- Mobile draft-pack list/detail submit approve reject flow with guarded async actions.
- Fixture banner failure visibility (no silent swallow).
- Web proxy route behavior tests and Vitest discovery improvements.
- Additional hardening: CORS origin policy tests, malformed flood-zone warning path coverage, line-ending enforcement.

## Evidence
Latest gates on this branch:
- docker compose exec -T api pytest -q => 46 passed
- pnpm --filter web test:local => 13 passed
- pnpm --filter mobile exec tsc --noEmit -p tsconfig.check.json => pass

## Audit Artifacts
- docs/HANDOFF.md (historical sections explicitly marked and reconciled)
- docs/AUDIT_REPORT.md (control-to-evidence matrix)
- docs/followups/WEB_STRICT_BUILD_HARDENING.md (tracked hardening follow-up)

## Notes
- gh CLI is not installed in the local environment, so this file is prepared for manual PR creation in GitHub UI.
