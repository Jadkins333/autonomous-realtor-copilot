# Reconciliation UI + LLM Launch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish one verified branch that combines the rescued redesign, the real LLM layer if it passes proof, the deterministic core, and the next highest-leverage launch blocker work.

**Architecture:** Start from the redesign rescue branch in a clean worktree, verify the redesign in code and runtime, verify the LLM layer from its committed branch and any stranded worktree state, then integrate only the proven changes onto a single branch. After the combined branch is stable, address the highest-leverage launch blocker without weakening deterministic authority or compliance controls.

**Tech Stack:** Git worktrees, FastAPI, SQLAlchemy, pytest, Next.js 14, Tailwind, Vitest, Playwright, local Docker services, local uvicorn, pnpm

---

### Task 1: Audit Git Topology And Stranded State

**Files:**
- Inspect: `.git`
- Inspect: `.claude/worktrees/zen-davinci/`
- Inspect: `apps/api/app/services/llm/`
- Inspect: `apps/api/app/services/llm_features/`
- Inspect: `artifacts/redesign/`

**Step 1: Capture branch, worktree, stash, and status evidence**

Run: `git branch -a -vv`
Expected: local `rescue/codex-redesign-backup`, local `claude/zen-davinci`, and their remote counterparts are visible

**Step 2: Capture worktree mapping**

Run: `git worktree list --porcelain`
Expected: the rescue checkout and the Claude worktree are listed with exact paths and HEAD SHAs

**Step 3: Prove the key commits exist**

Run: `git show --stat --summary 114f05c`
Run: `git show --stat --summary c6a4341`
Expected: redesign files are in `114f05c`; LLM provider/router/route/test files are in `c6a4341`

**Step 4: Identify stranded changes**

Run: `git status --short --branch`
Run: `git -C .claude/worktrees/zen-davinci status --short --branch`
Run: `git stash list`
Expected: any uncommitted root/worktree/stash work is documented explicitly before integration

**Step 5: Commit the audit notes**

```bash
git add docs/plans/2026-03-10-reconciliation-ui-llm-launch.md
git commit -m "docs: add reconciliation implementation plan"
```

### Task 2: Verify The Redesign In Code And Runtime

**Files:**
- Inspect: `apps/web/app/globals.css`
- Inspect: `apps/web/tailwind.config.ts`
- Inspect: `apps/web/components/site-shell.tsx`
- Inspect: `apps/web/components/ui/button.tsx`
- Inspect: `apps/web/components/ui/card.tsx`
- Inspect: `apps/web/components/ui/badge.tsx`
- Inspect: `apps/web/components/ui/table.tsx`
- Inspect: `apps/web/components/ui/input.tsx`
- Inspect: `apps/web/components/ui/textarea.tsx`
- Inspect: `apps/web/components/ui/page-header.tsx`
- Inspect: `apps/web/components/ui/empty-state.tsx`
- Inspect: `apps/web/app/dashboard/page.tsx`
- Inspect: `apps/web/app/contacts/page.tsx`
- Inspect: `apps/web/app/contacts/[id]/page.tsx`
- Inspect: `apps/web/app/sequences/page.tsx`
- Inspect: `apps/web/app/sources/page.tsx`
- Inspect: `apps/web/scripts/capture-redesign-screenshots.mjs`

**Step 1: Install web dependencies in the clean worktree**

Run: `pnpm install`
Expected: workspace dependencies install without lockfile drift

**Step 2: Verify the web branch builds from the redesign commit**

Run: `pnpm --filter web build`
Expected: successful production build on the rescue-based worktree

**Step 3: Start the web app against a live API**

Run: `pnpm --filter web next start --port 3100`
Expected: server responds on `http://localhost:3100`

**Step 4: Capture live redesign proof**

Run: `node apps/web/scripts/capture-redesign-screenshots.mjs audit --start-server --port=3100`
Expected: fresh screenshots generated for sidebar, dashboard, contacts, contact detail, sequences, and sources

**Step 5: Regenerate montage proof**

Run: `node apps/web/scripts/generate-redesign-proof.mjs --start-server --port=3104`
Expected: refreshed montage and responsive proof assets

### Task 3: Verify The LLM Layer Without Trusting Claims

**Files:**
- Inspect: `apps/api/app/core/config.py`
- Inspect: `apps/api/app/services/llm/provider.py`
- Inspect: `apps/api/app/services/llm/ollama.py`
- Inspect: `apps/api/app/services/llm/lmstudio.py`
- Inspect: `apps/api/app/services/llm_features/narrator.py`
- Inspect: `apps/api/app/services/llm_features/outreach_drafter.py`
- Inspect: `apps/api/app/services/llm_features/contact_summarizer.py`
- Inspect: `apps/api/app/services/llm_features/score_explainer.py`
- Inspect: `apps/api/app/copilot/router.py`
- Inspect: `apps/api/app/api/routes_copilot.py`
- Inspect: `apps/api/app/api/routes_outreach.py`
- Inspect: `apps/api/app/api/routes_contacts.py`
- Inspect: `apps/api/app/api/routes_parcels.py`
- Inspect: `apps/api/tests/test_llm_provider.py`
- Inspect: `apps/api/tests/test_llm_features.py`
- Inspect: `apps/web/app/copilot/page.tsx`
- Inspect: `apps/web/app/contacts/[id]/page.tsx`

**Step 1: Create a clean runtime for local API verification**

Run: `python -m venv .venv`
Run: `.venv\\Scripts\\pip install -r apps/api/requirements.txt`
Expected: local API dependencies installed in the worktree

**Step 2: Verify provider/unit behavior**

Run: `.venv\\Scripts\\python -m pytest apps/api/tests/test_llm_provider.py -q`
Expected: provider abstraction and graceful failure tests pass

**Step 3: Verify feature/router behavior**

Run: `.venv\\Scripts\\python -m pytest apps/api/tests/test_llm_features.py -q`
Expected: narration, rewrite, summarizer, score explanation, and fallback tests pass

**Step 4: Start the API locally from the integrated code path**

Run: `.venv\\Scripts\\python -m uvicorn app.main:app --host 127.0.0.1 --port 58001`
Expected: local API responds from the worktree code

**Step 5: Exercise live endpoints with and without provider availability**

Run: `curl http://127.0.0.1:58001/copilot/llm-status`
Expected: `available=false` when no provider is running, deterministic chat still works

### Task 4: Reconcile Into One Branch

**Files:**
- Modify: `apps/api/app/api/routes_contacts.py`
- Modify: `apps/api/app/api/routes_copilot.py`
- Modify: `apps/api/app/api/routes_outreach.py`
- Modify: `apps/api/app/api/routes_parcels.py`
- Modify: `apps/api/app/copilot/router.py`
- Modify: `apps/api/app/core/config.py`
- Modify: `apps/api/app/schemas/copilot.py`
- Modify: `apps/web/app/contacts/[id]/page.tsx`
- Modify: `apps/web/app/contacts/[id]/page.test.tsx`
- Modify: `apps/web/app/copilot/page.tsx`
- Modify: `apps/web/app/copilot/page.test.tsx`
- Modify: `apps/web/components/site-shell.tsx`
- Modify: `apps/web/app/globals.css`

**Step 1: Cherry-pick the verified LLM commit onto the redesign branch**

Run: `git cherry-pick c6a4341`
Expected: conflicts appear only in overlapping UI/API files

**Step 2: Resolve conflicts by preserving redesign surfaces and deterministic authority**

Expected:
- redesigned shell/primitives/pages remain visually intact
- LLM changes stay additive
- deterministic text/data/compliance/state remain authoritative

**Step 3: Verify no stranded files are being silently dropped**

Run: `git diff --stat rescue/codex-redesign-backup..HEAD`
Expected: redesign files still present and LLM files/routes/tests added

**Step 4: Commit the reconciliation**

```bash
git add apps/api apps/web docs/plans/2026-03-10-reconciliation-ui-llm-launch.md
git commit -m "feat: reconcile redesign with llm integration"
```

### Task 5: Verify The Combined Product

**Files:**
- Inspect: `apps/api/tests/`
- Inspect: `apps/web/app/`
- Inspect: `artifacts/redesign/`

**Step 1: Run targeted API suites**

Run: `.venv\\Scripts\\python -m pytest apps/api/tests/test_llm_provider.py apps/api/tests/test_llm_features.py apps/api/tests/test_sequences_contacts_detail.py -q`
Expected: all targeted LLM and deterministic regression tests pass

**Step 2: Run broader API regression**

Run: `.venv\\Scripts\\python -m pytest apps/api/tests -q`
Expected: full API suite passes or any failures are documented precisely

**Step 3: Run web tests**

Run: `pnpm --filter web test:local`
Expected: all vitest suites pass on the reconciled branch

**Step 4: Run production build**

Run: `pnpm --filter web build`
Expected: production build succeeds

**Step 5: Run smoke proof**

Run: `pnpm --filter web test:e2e`
Expected: golden workflow passes against the reconciled runtime or failures are documented with exact evidence

### Task 6: Implement The Highest-Leverage Launch Blocker

**Files:**
- Inspect: `apps/api/app/api/routes_webhooks.py`
- Inspect: `apps/api/app/services/outreach.py`
- Inspect: `apps/api/app/services/sequences.py`
- Inspect: `apps/api/app/workers/tasks.py`
- Inspect: `apps/api/tests/`

**Step 1: Re-audit the claimed blocker against the reconciled branch**

Run: `git grep -n "STOP|stop_on_reply|twilio|postmark|voice|sequence" -- apps/api/app apps/api/tests`
Expected: distinguish “missing” from “present but incomplete”

**Step 2: Write the failing test for the highest-priority real blocker**

Expected: the first implementation change starts with a red test covering the verified gap

**Step 3: Implement the smallest safe fix**

Expected: deterministic execution, compliance, and source-of-truth records remain authoritative

**Step 4: Re-run targeted verification**

Run: `.venv\\Scripts\\python -m pytest <targeted-tests> -q`
Expected: the new blocker test passes and existing behavior does not regress
