from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ComplianceRuleMeta:
    rule_key: str
    doc_path: str
    authoritative_links: tuple[str, ...]


COMPLIANCE_RULE_REGISTRY: dict[str, ComplianceRuleMeta] = {
    "consent_required": ComplianceRuleMeta(
        rule_key="consent_required",
        doc_path="docs/compliance/tcpa.md",
        authoritative_links=(
            "https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts",
            "https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-64/subpart-L/section-64.1200",
        ),
    ),
    "suppressed_contact": ComplianceRuleMeta(
        rule_key="suppressed_contact",
        doc_path="docs/compliance/tcpa.md",
        authoritative_links=(
            "https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts",
        ),
    ),
    "quiet_hours": ComplianceRuleMeta(
        rule_key="quiet_hours",
        doc_path="docs/compliance/tcpa.md",
        authoritative_links=(
            "https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-64/subpart-L/section-64.1200",
        ),
    ),
    "frequency_cap": ComplianceRuleMeta(
        rule_key="frequency_cap",
        doc_path="docs/compliance/tcpa.md",
        authoritative_links=(
            "https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts",
        ),
    ),
    "stop_opt_out": ComplianceRuleMeta(
        rule_key="stop_opt_out",
        doc_path="docs/compliance/tcpa.md",
        authoritative_links=(
            "https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts",
        ),
    ),
    "stop_on_reply": ComplianceRuleMeta(
        rule_key="stop_on_reply",
        doc_path="docs/compliance/tcpa.md",
        authoritative_links=(
            "https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts",
        ),
    ),
    "sandbox_default": ComplianceRuleMeta(
        rule_key="sandbox_default",
        doc_path="docs/compliance/can_spam.md",
        authoritative_links=(
            "https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business",
        ),
    ),
}
