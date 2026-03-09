# Copilot Agent System + Agency Roster

This project includes an internal deterministic Copilot agent system for runtime routing and traceability.

## Upstream Roster

- Source roster: https://github.com/msitarzewski/agency-agents
- Local vendor location: `tools/agency-agents/upstream/`
- Refresh script: `tools/agency-agents/refresh_roster.py`

## Internal Runtime Agents

Implemented in `apps/api/app/copilot/agents/`:

- `property_intel`: Parcel profile + insights
- `outreach_writer`: Sandbox outreach draft generation
- `compliance_checker`: Policy and fair-housing language checks
- `market_analyst`: City nowcast and market summary
- `data_provenance_explainer`: Formula/input/provenance explanation

## Routing

- Registry: `apps/api/app/copilot/registry.py`
- Router: `apps/api/app/copilot/router.py`
- Endpoints:
  - `GET /copilot/agents`
  - `POST /copilot/chat`

`POST /copilot/chat` always returns a trace object with:

- selected agent
- decision notes
- tools used
- provenance references
- freshness summary

## Determinism + Safety

- Runtime outputs are deterministic and rules/data-driven in demo mode.
- No external paid keys are required.
- No hidden prompts or credentials are returned in trace payloads.
