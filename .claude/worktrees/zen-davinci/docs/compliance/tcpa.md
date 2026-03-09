# TCPA Policy Guardrails (SMS/Voice)

This project uses conservative, configurable policy defaults for outbound SMS/voice.
See [Compliance Notice](./NOTICE.md).

Implementation defaults:
- Human approval before send remains the default product flow.
- SMS/voice outbound is blocked unless latest channel consent is `opt_in`.
- Inbound STOP-style keywords create `opt_out` + suppression immediately with auditable timestamps.
- Operational target is immediate processing with an auditable timeline and a configurable outer SLA.
- Quiet hours and daily frequency caps are policy controls and can be tuned per deployment.
- Global cross-channel revocation is a separate feature flag (`ENFORCE_GLOBAL_REVOCATION`, default `false`).

Policy notes:
- TCPA/FCC interpretation and case law can change over time.
- Revocation frameworks have had partial delays/waivers, so behavior should remain policy-driven in code.
- FCC materials use "as soon as practicable" framing for honoring revocations, with specific implementation timelines depending on rule context.

References:
- FCC consumer guide (primary): https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts
- FCC TCPA rule text (47 CFR 64.1200): https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-64/subpart-L/section-64.1200
- FCC 2024 AI/robocall rules update: https://www.fcc.gov/document/fcc-adopts-rules-protect-consumers-ai-generated-robocalls
- FDIC TCPA manual overview (secondary): https://www.fdic.gov/consumer-compliance-examination-manual/viii-5-telephone-consumer-protection-act
