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
- FDIC TCPA manual overview: https://www.fdic.gov/consumer-compliance-examination-manual/viii-5-telephone-consumer-protection-act
- FCC 2024 AI/robocall rules announcement: https://www.fcc.gov/document/fcc-adopts-rules-protect-consumers-ai-generated-robocalls
- FCC limited-delay announcement (2025): https://www.fcc.gov/document/fcc-delays-part-robocall-rule-may-impact-bank-text-messages-0
