# Architecture Overview

## Stack
- Frontend: Next.js 14, TypeScript, Tailwind, shadcn-style components, NextAuth credentials.
- Backend: FastAPI, SQLAlchemy 2, Pydantic v2, Celery worker + beat.
- Data: PostgreSQL 16 + PostGIS, Redis.

## Core flows
1. Startup: Alembic migration runs, then seed bootstrap creates tenant/user/definitions and ingests seed-backed public data.
2. Ingestion: Connectors attempt live public endpoints, fallback to seed data on failure, write `source_runs` and `provenance_records`.
3. Insights: Metric definitions + metric values persist formulas, inputs, provenance, and freshness metadata.
4. Outreach: Draft-first approval with compliance gates, sandbox send defaults, STOP opt-out and suppression.

## Truth Layer
Every insight payload includes:
- `metric_key` and `version`
- `formula_markdown`
- `inputs`
- `provenance`
- freshness state inside provenance records
