# CAN-SPAM Compliance (Email)

This project enforces draft-first outbound email controls through suppression handling and auditable message state transitions.

Implementation notes:
- Email sends are staged by default in sandbox mode.
- Suppression and opt-out state are enforced before outbound send.
- Compliance events are persisted in `compliance_events` for audit traceability.
- Policy settings are implementation defaults and should be treated as configurable controls, not legal conclusions.

Reference:
- FTC CAN-SPAM compliance guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
