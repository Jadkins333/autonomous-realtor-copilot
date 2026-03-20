from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from app.copilot.agents.base import AgentContext
from app.copilot.agents.property_intel import PropertyIntelAgent
from app.models.enums import SourceOrigin
from app.services.source_restrictions import (
    build_vow_registration_state,
    derive_restricted_actions,
    evaluate_source_restrictions,
)


def test_public_record_visible_normally() -> None:
    policy = evaluate_source_restrictions(SourceOrigin.public_record, surface="web")

    assert policy["can_display_public"] is True
    assert policy["can_display_authenticated"] is True
    assert policy["can_cache_offline"] is True
    assert policy["can_export"] is True
    assert policy["can_use_in_ai_summary"] is True
    assert policy["current_surface_allowed"] is True


def test_unknown_restricted_fails_closed() -> None:
    policy = evaluate_source_restrictions(SourceOrigin.unknown_restricted, surface="web")

    assert policy["can_display_public"] is False
    assert policy["can_display_authenticated"] is False
    assert policy["current_surface_allowed"] is False
    assert "unknown_restricted_origin" in policy["block_reason_codes"]


def test_idx_restrictions_respect_surface_and_explicit_flags() -> None:
    metadata = {
        "rules_configured": True,
        "allow_public_display": True,
        "allow_authenticated_display": True,
        "allow_mobile": True,
        "allow_offline_cache": False,
        "allow_export": False,
        "allow_ai_summary": False,
        "controlled_surfaces": ["web", "mobile"],
    }

    web_policy = evaluate_source_restrictions(SourceOrigin.idx, surface="web", metadata=metadata)
    mobile_policy = evaluate_source_restrictions(SourceOrigin.idx, surface="mobile", metadata=metadata)
    ai_policy = evaluate_source_restrictions(SourceOrigin.idx, surface="ai_summary", metadata=metadata)

    assert web_policy["current_surface_allowed"] is True
    assert mobile_policy["current_surface_allowed"] is True
    assert ai_policy["current_surface_allowed"] is False
    assert "ai_summary_not_permitted" in ai_policy["block_reason_codes"]


def test_vow_origin_blocked_until_registration_prerequisites_are_met() -> None:
    metadata = {
        "rules_configured": True,
        "vow_enabled": True,
        "allow_authenticated_display": True,
        "allow_mobile": True,
    }
    registration = build_vow_registration_state(None, {"market": "columbus_oh", "source_name": "demo_vow", **metadata})

    policy = evaluate_source_restrictions(
        SourceOrigin.vow,
        surface="web",
        metadata={"market": "columbus_oh", "source_name": "demo_vow", **metadata},
        vow_registration=registration,
    )

    assert policy["current_surface_allowed"] is False
    assert policy["requires_vow_registration"] is True
    assert "vow_prerequisites_incomplete" in policy["block_reason_codes"]
    assert "registrant_name" in policy["required_prerequisites"]
    assert "verification" in policy["required_prerequisites"]


def test_vow_origin_allows_authenticated_display_when_registration_is_complete() -> None:
    metadata = {
        "market": "columbus_oh",
        "source_name": "demo_vow",
        "rules_configured": True,
        "vow_enabled": True,
        "allow_authenticated_display": True,
        "allow_mobile": True,
    }
    registration = build_vow_registration_state(
        SimpleNamespace(
            registrant_name="Pat Buyer",
            registrant_email="pat@example.com",
            valid_email=True,
            terms_of_use_acknowledged=True,
            verification_state="verified",
            terms_accepted_at=SimpleNamespace(isoformat=lambda: "2026-03-19T12:00:00+00:00"),
            acceptance_record_json={"terms_version": "2026-03"},
        ),
        metadata,
    )

    policy = evaluate_source_restrictions(
        SourceOrigin.vow,
        surface="web",
        metadata=metadata,
        vow_registration=registration,
    )

    assert policy["current_surface_allowed"] is True
    assert policy["can_display_authenticated"] is True
    assert policy["required_prerequisites"] == []


def test_export_and_offline_restrictions_are_explicit() -> None:
    policy = evaluate_source_restrictions(
        SourceOrigin.licensed_feed_other,
        surface="web",
        metadata={"rules_configured": True, "allow_authenticated_display": True},
    )
    restricted_actions = derive_restricted_actions(policy)

    assert policy["can_export"] is False
    assert policy["can_cache_offline"] is False
    assert "export" in restricted_actions
    assert "offline_cache" in restricted_actions


def test_ai_summary_is_blocked_when_origin_policy_disallows_it(monkeypatch) -> None:
    blocked_detail = {
        "source_origin": "idx",
        "display_policy": {
            "can_use_in_ai_summary": False,
            "current_surface_allowed": False,
            "block_reason_codes": ["ai_summary_not_permitted"],
        },
        "restricted_content": {
            "blocked": True,
            "message": "IDX-origin property data is blocked until market-specific rules are configured for this surface.",
            "reason_codes": ["ai_summary_not_permitted"],
        },
        "provenance": {
            "provenance_record_id": str(uuid4()),
            "freshness": {"staleness": "fresh"},
        },
    }

    class FakeDB:
        def execute(self, _statement):
            return SimpleNamespace(
                scalar_one_or_none=lambda: SimpleNamespace(id=uuid4(), address="145 N High St", parcel_number="010-123")
            )

    monkeypatch.setattr("app.copilot.agents.property_intel.get_parcel_detail", lambda *_args, **_kwargs: blocked_detail)

    result = PropertyIntelAgent().run(
        AgentContext(
            db=FakeDB(),
            tenant_id=uuid4(),
            user_id=uuid4(),
            message="property profile for 145 N High St",
        )
    )

    assert result.status == "blocked"
    assert "AI summary blocked" in result.text
    assert result.data["source_origin"] == "idx"
