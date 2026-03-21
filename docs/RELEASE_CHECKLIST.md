# Release Checklist

This document tracks the minimum operational standards for releasing `autonomous-realtor-copilot` out of hardened internal beta status.

## Automated Verification
- [x] Passes live-send mock compliance tests (`pytest`)
- [x] Passes mobile E2E Maestro pipelines (`maestro test .maestro/`)
- [x] Passes standard API and Web typechecks (`pnpm validate:all`)

## Feature Safety
- [x] MLS feature flags (`ENABLE_MLS_SYNC`) disabled by default in `.env.example`.
- [x] Postmark / Twilio strictly enforce idempotency headers on API relay.
- [x] Sandbox default (`SANDBOX_MODE=true`) blocks external network payloads cleanly.

## Manual Playtesting
- [ ] iOS physical device check passed
- [ ] Android simulator network throttling check passed
- [ ] Disclosure gate visually blocks UI navigation until acknowledged

*(Checklist auto-generated after the Audit Phase and Test Stabilization implementation)*
