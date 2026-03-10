# TCPA Policy Guardrails (SMS And Voice Policy Controls)

This project uses conservative, configurable policy defaults for outbound messaging.
The product can actively send SMS and outbound voice calls when the deployment has the required provider configuration and sandbox mode is off.
See [Compliance Notice](./NOTICE.md).

Implementation defaults:
- Human approval before send remains the default product flow.
- SMS and voice outbound are blocked unless latest channel consent is `opt_in` for that specific channel.
- Inbound STOP-style keywords create `opt_out` + suppression immediately with auditable timestamps.
- Operational target is immediate processing with an auditable timeline and a configurable outer SLA.
- Quiet hours and daily frequency caps are policy controls and can be tuned per deployment.
- Voice scripts are served only from approved draft content through a signed Twilio TwiML endpoint.
- If Twilio Voice configuration is incomplete, the UI/API must show voice as unavailable and fail closed.
- Global cross-channel revocation is a separate feature flag (`ENFORCE_GLOBAL_REVOCATION`, default `false`).

Implementation note:
- Voice execution remains provider-driven but compliance-governed: consent, suppression, quiet hours, frequency caps, and truthful call-state persistence all stay deterministic inside the app.

Policy notes:
- TCPA/FCC interpretation and case law can change over time.
- Revocation frameworks have had partial delays/waivers, so behavior should remain policy-driven in code.
- FCC materials use "as soon as practicable" framing for honoring revocations, with specific implementation timelines depending on rule context.

References:
- FCC consumer guide (primary): https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts
- FCC TCPA rule text (47 CFR 64.1200): https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-64/subpart-L/section-64.1200
- FCC 2024 AI/robocall rules update: https://www.fcc.gov/document/fcc-adopts-rules-protect-consumers-ai-generated-robocalls
- FDIC TCPA manual overview (secondary): https://www.fdic.gov/consumer-compliance-examination-manual/viii-5-telephone-consumer-protection-act
