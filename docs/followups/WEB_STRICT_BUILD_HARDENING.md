# Follow-up: Web Strict Build Hardening

Date: 2026-03-06
Owner: Web Platform
Status: Open

## Problem
The web app currently keeps Next.js build bypass flags enabled in apps/web/next.config.mjs:
- eslint.ignoreDuringBuilds = true
- typescript.ignoreBuildErrors = true

A strict next build run on this branch surfaces pre-existing lint and type debt across multiple files.

## Goal
Remove both bypass flags and make strict pnpm --filter web build:local pass in CI and local development.

## Scope
1. Resolve existing @typescript-eslint/no-explicit-any violations across app pages, tests, and lib modules.
2. Resolve hook dependency warnings and prefer-const lint findings currently blocking strict build.
3. Keep behavior unchanged while tightening types.
4. Update docs to mark strict build gate as required and no longer bypassed.

## Acceptance Criteria
1. apps/web/next.config.mjs no longer includes ignoreDuringBuilds or ignoreBuildErrors.
2. pnpm --filter web build:local exits 0 with no lint/type failures.
3. pnpm --filter web test:local remains green.
4. PR includes before/after evidence and changed-file summary.

## Suggested Execution Plan
1. Add shared API response interfaces to replace repeated any usage.
2. Fix page-by-page lint/type issues starting with auth, dashboard, opportunities, outreach, and sources.
3. Update route tests to avoid any in mocks.
4. Remove bypass flags and rerun full web gates.

## Evidence Snapshot
Current branch gate status (non-strict web build policy):
- API: 46 passed
- Web tests: 13 passed
- Mobile typecheck: pass
