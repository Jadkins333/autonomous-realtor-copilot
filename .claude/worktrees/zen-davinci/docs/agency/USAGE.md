# Agency CLI Usage

The agency CLI provides internal developer role modes based on locally vendored templates.

## Command

```bash
pnpm agency --role "Backend Architect" --task "Fix macOS seed file locking in docker"
```

## Supported Roles

- Frontend Developer
- Backend Architect
- Mobile App Builder
- DevOps Automator
- AI Engineer
- Reality Checker

## Output

The CLI prints JSON with:

- `checklist`
- `guardrails`
- `expected_deliverables`
- `role_specific_plan`
- `acceptance_criteria`

## Examples

```bash
pnpm agency --role "Frontend Developer" --task "Harden copilot page trace UX"
pnpm agency --role "Mobile App Builder" --task "Fix property map edge cases on iPad"
pnpm agency --role "DevOps Automator" --task "Stabilize docker compose startup on macOS"
```

## Notes

- Templates live in `tools/agency/templates`.
- Upstream agency roster snapshot is vendored in `tools/agency-agents/upstream`.
- This is a developer workflow utility only, not an end-user runtime feature.
