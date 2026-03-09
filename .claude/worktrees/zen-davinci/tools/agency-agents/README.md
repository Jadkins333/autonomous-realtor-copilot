# Agency Agents Vendor Folder

This folder vendors a curated snapshot of the upstream roster from:

- https://github.com/msitarzewski/agency-agents

## Refresh

From repository root:

```bash
python3 tools/agency-agents/refresh_roster.py
```

The script downloads the upstream tarball and writes markdown files into `tools/agency-agents/upstream/`.
No git submodule is used.

## Why this exists

`apps/api/app/copilot/agents/` uses this roster as developer guidance for specialized agent roles while keeping runtime outputs deterministic and compliance-safe in demo mode.
