# Functional Go-Live Checklist Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring the app to a verified locally functional state and identify the remaining gaps for real-world production use.

**Architecture:** Use the existing Docker-based runtime to validate the seeded demo flow end-to-end, then separate local-demo readiness from production readiness. This avoids speculative changes and uses the repo's own setup, doctor, smoke, web test, and build gates as the source of truth.

**Tech Stack:** Docker Compose, FastAPI, PostgreSQL/PostGIS, Redis, Celery, Next.js, pnpm, bash setup scripts

---

### Task 1: Verify local prerequisites and config

**Files:**
- Review: `Z:\autonomous-realtor-copilot\.env.example`
- Review: `Z:\autonomous-realtor-copilot\scripts\setup.sh`
- Review: `Z:\autonomous-realtor-copilot\scripts\doctor.sh`

**Step 1: Confirm `.env` exists**

Run: `if exist .env (echo EXISTS) else (echo MISSING)`
Expected: `EXISTS`

**Step 2: Confirm Docker is available**

Run: `docker info`
Expected: Docker daemon info returns successfully

**Step 3: Confirm repo scripts match expected startup flow**

Run: `pnpm run project:doctor`
Expected: health output or actionable failures for missing services

### Task 2: Bring up the local stack

**Files:**
- Review: `Z:\autonomous-realtor-copilot\docker-compose.yml`
- Execute: `Z:\autonomous-realtor-copilot\scripts\setup.sh`

**Step 1: Bootstrap dependencies and stack**

Run: `pnpm run project:setup`
Expected: installs dependencies, starts containers, runs migrations, seeds demo data, and passes smoke checks

**Step 2: Verify runtime services**

Run: `pnpm run project:doctor`
Expected: all doctor checks pass

### Task 3: Verify application-level behavior

**Files:**
- Review: `Z:\autonomous-realtor-copilot\README.md`
- Review: `Z:\autonomous-realtor-copilot\docs\HANDOFF.md`

**Step 1: Verify web regression gate**

Run: `pnpm test:web`
Expected: web test suite passes

**Step 2: Verify web production build**

Run: `pnpm build:web`
Expected: Next.js build succeeds

**Step 3: Record functional readiness**

Expected:
- Local demo mode is functional when Docker stack, doctor, smoke, tests, and build pass.
- Production use still requires real provider credentials, secure secrets, live source configuration, deployment, monitoring, backups, and compliance sign-off.
