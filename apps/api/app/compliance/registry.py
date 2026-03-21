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
    "consent_proof_missing": ComplianceRuleMeta(
        rule_key="consent_proof_missing",
        doc_path="docs/compliance/tcpa.md",
        authoritative_links=(
            "https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts",
        ),
    ),
    "consent_stale": ComplianceRuleMeta(
        rule_key="consent_stale",
        doc_path="docs/compliance/tcpa.md",
        authoritative_links=(
            "https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts",
        ),
    ),
    "consent_revoked": ComplianceRuleMeta(
        rule_key="consent_revoked",
        doc_path="docs/compliance/tcpa.md",
        authoritative_links=(
            "https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts",
        ),
    ),
    "recipient_timezone_missing": ComplianceRuleMeta(
        rule_key="recipient_timezone_missing",
        doc_path="docs/compliance/tcpa.md",
        authoritative_links=(
            "https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-64/subpart-L/section-64.1200",
        ),
    ),
    "fair_housing_flagged": ComplianceRuleMeta(
        rule_key="fair_housing_flagged",
        doc_path="docs/compliance/fair_housing_advertising.md",
        authoritative_links=(
            "https://www.hud.gov/program_offices/fair_housing_equal_opp/advertising_and_marketing",
        ),
    ),
    "agency_relationship_required": ComplianceRuleMeta(
        rule_key="agency_relationship_required",
        doc_path="docs/compliance/ohio_disclosures.md",
        authoritative_links=(
            "https://com.ohio.gov/divisions-and-programs/real-estate-and-professional-licensing",
        ),
    ),
    "agency_relationship_version_superseded": ComplianceRuleMeta(
        rule_key="agency_relationship_version_superseded",
        doc_path="docs/compliance/ohio_disclosures.md",
        authoritative_links=(
            "https://com.ohio.gov/divisions-and-programs/real-estate-and-professional-licensing",
        ),
    ),
    "seller_fair_housing_required": ComplianceRuleMeta(
        rule_key="seller_fair_housing_required",
        doc_path="docs/compliance/fair_housing_advertising.md",
        authoritative_links=(
            "https://www.hud.gov/program_offices/fair_housing_equal_opp/advertising_and_marketing",
        ),
    ),
    "seller_fair_housing_version_superseded": ComplianceRuleMeta(
        rule_key="seller_fair_housing_version_superseded",
        doc_path="docs/compliance/fair_housing_advertising.md",
        authoritative_links=(
            "https://www.hud.gov/program_offices/fair_housing_equal_opp/advertising_and_marketing",
        ),
    ),
    "policy_passed": ComplianceRuleMeta(
        rule_key="policy_passed",
        doc_path="docs/compliance/tcpa.md",
        authoritative_links=(
            "https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts",
        ),
    ),
}
