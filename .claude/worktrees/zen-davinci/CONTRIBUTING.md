# Contributing

## Change Workflow

- Group edits by feature/fix into logical batches.
- Avoid micro-commits for one-line tweaks unless they unblock CI.
- Prefer minimal diffs; preserve current architecture unless a bug requires structural change.
- For local coding assistants: batch file edits and run one verification pass per batch.

## Local Verification

1. `pnpm install`
2. `pnpm dev:api`
3. `pnpm dev:web`
4. `EXPO_PUBLIC_API_BASE_URL=http://localhost:8000 pnpm dev:mobile`
5. `bash scripts/smoke.sh`

