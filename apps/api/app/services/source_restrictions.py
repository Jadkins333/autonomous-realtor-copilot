from __future__ import annotations

from collections.abc import Iterable
from email.utils import parseaddr
from typing import Any

from app.models.enums import SourceOrigin, VowVerificationState

SAFE_ORIGINS = {SourceOrigin.public_record, SourceOrigin.broker_owned}
CONTROLLED_SURFACES = {"web", "mobile"}


def normalize_source_origin(value: Any) -> SourceOrigin:
    if isinstance(value, SourceOrigin):
        return value
    try:
        return SourceOrigin(str(value))
    except ValueError:
        return SourceOrigin.unknown_restricted


def normalize_origin_metadata(origin: SourceOrigin, raw_metadata: dict[str, Any] | None) -> dict[str, Any]:
    metadata = dict(raw_metadata or {})
    metadata.setdefault("field_origin_mode", "record_level")
    metadata.setdefault("field_origins", {})
    metadata.setdefault("rules_configured", origin in SAFE_ORIGINS)
    metadata.setdefault("attribution_requirements", [])
    metadata.setdefault("controlled_surfaces", [])
    metadata.setdefault("allow_public_display", origin in SAFE_ORIGINS)
    metadata.setdefault("allow_authenticated_display", origin in SAFE_ORIGINS)
    metadata.setdefault("allow_mobile", origin in SAFE_ORIGINS)
    metadata.setdefault("allow_offline_cache", origin == SourceOrigin.public_record)
    metadata.setdefault("allow_export", origin in SAFE_ORIGINS)
    metadata.setdefault("allow_ai_summary", origin in SAFE_ORIGINS)
    metadata.setdefault("vow_enabled", False)
    return metadata


def build_vow_registration_state(profile: Any | None, metadata: dict[str, Any]) -> dict[str, Any]:
    registrant_name = getattr(profile, "registrant_name", None)
    registrant_email = getattr(profile, "registrant_email", None)
    valid_email = bool(getattr(profile, "valid_email", False) and _looks_like_email(registrant_email))
    accepted_at = getattr(profile, "terms_accepted_at", None)
    acceptance_record = dict(getattr(profile, "acceptance_record_json", {}) or {})
    verification_state = getattr(profile, "verification_state", VowVerificationState.not_started)
    if isinstance(verification_state, VowVerificationState):
        verification_label = verification_state.value
    else:
        verification_label = str(verification_state or VowVerificationState.not_started.value)

    return {
        "market": metadata.get("market"),
        "source_name": metadata.get("source_name"),
        "enabled_for_market_source": bool(metadata.get("rules_configured") and metadata.get("vow_enabled")),
        "registrant_name": registrant_name,
        "registrant_email": registrant_email,
        "valid_email": valid_email,
        "terms_of_use_acknowledged": bool(getattr(profile, "terms_of_use_acknowledged", False)),
        "verification_state": verification_label,
        "accepted_at": accepted_at.isoformat() if accepted_at else None,
        "acceptance_record": acceptance_record or None,
        "terms_version": metadata.get("terms_version"),
    }


def evaluate_source_restrictions(
    origin: SourceOrigin | str,
    *,
    surface: str,
    metadata: dict[str, Any] | None = None,
    vow_registration: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_origin = normalize_source_origin(origin)
    normalized_metadata = normalize_origin_metadata(normalized_origin, metadata)
    registration = vow_registration or build_vow_registration_state(None, normalized_metadata)
    reasons: list[str] = []
    prerequisites: list[str] = []

    policy = {
        "can_display_public": False,
        "can_display_authenticated": False,
        "requires_vow_registration": normalized_origin == SourceOrigin.vow,
        "can_cache_offline": False,
        "can_export": False,
        "can_use_in_ai_summary": False,
        "can_use_in_mobile": False,
    }

    if normalized_origin in SAFE_ORIGINS:
        policy.update(
            can_display_public=True,
            can_display_authenticated=True,
            can_cache_offline=bool(normalized_metadata.get("allow_offline_cache")),
            can_export=bool(normalized_metadata.get("allow_export")),
            can_use_in_ai_summary=bool(normalized_metadata.get("allow_ai_summary")),
            can_use_in_mobile=bool(normalized_metadata.get("allow_mobile")),
        )
    elif normalized_origin == SourceOrigin.idx:
        if not normalized_metadata.get("rules_configured"):
            reasons.append("idx_rules_not_configured")
        else:
            policy.update(
                can_display_public=bool(normalized_metadata.get("allow_public_display")),
                can_display_authenticated=bool(normalized_metadata.get("allow_authenticated_display")),
                can_cache_offline=bool(normalized_metadata.get("allow_offline_cache")),
                can_export=bool(normalized_metadata.get("allow_export")),
                can_use_in_ai_summary=bool(normalized_metadata.get("allow_ai_summary")),
                can_use_in_mobile=bool(normalized_metadata.get("allow_mobile")),
            )
            _enforce_controlled_surface(surface, normalized_metadata.get("controlled_surfaces"), reasons)
    elif normalized_origin == SourceOrigin.vow:
        if not normalized_metadata.get("rules_configured") or not normalized_metadata.get("vow_enabled"):
            reasons.append("vow_not_enabled_for_market_source")
            prerequisites.append("market_vow_enablement")
        else:
            prerequisites.extend(_missing_vow_prerequisites(registration))
            if prerequisites:
                reasons.append("vow_prerequisites_incomplete")
            else:
                policy.update(
                    can_display_authenticated=bool(normalized_metadata.get("allow_authenticated_display", True)),
                    can_cache_offline=bool(normalized_metadata.get("allow_offline_cache")),
                    can_export=bool(normalized_metadata.get("allow_export")),
                    can_use_in_ai_summary=bool(normalized_metadata.get("allow_ai_summary")),
                    can_use_in_mobile=bool(normalized_metadata.get("allow_mobile")),
                )
                _enforce_controlled_surface(surface, normalized_metadata.get("controlled_surfaces"), reasons)
    elif normalized_origin == SourceOrigin.licensed_feed_other:
        if not normalized_metadata.get("rules_configured"):
            reasons.append("licensed_feed_rules_not_configured")
        else:
            policy.update(
                can_display_public=bool(normalized_metadata.get("allow_public_display")),
                can_display_authenticated=bool(normalized_metadata.get("allow_authenticated_display")),
                can_cache_offline=bool(normalized_metadata.get("allow_offline_cache")),
                can_export=bool(normalized_metadata.get("allow_export")),
                can_use_in_ai_summary=bool(normalized_metadata.get("allow_ai_summary")),
                can_use_in_mobile=bool(normalized_metadata.get("allow_mobile")),
            )
    else:
        reasons.append("unknown_restricted_origin")

    current_surface_allowed = _current_surface_allowed(surface, normalized_origin, policy)
    if not current_surface_allowed:
        reasons.append(_surface_block_reason(surface))

    return {
        **policy,
        "requires_vow_registration": normalized_origin == SourceOrigin.vow,
        "block_reason_codes": _dedupe(reasons),
        "required_prerequisites": _dedupe(prerequisites),
        "current_surface": surface,
        "current_surface_allowed": current_surface_allowed,
    }


def derive_restricted_actions(policy: dict[str, Any]) -> list[str]:
    restricted_actions: list[str] = []
    if not bool(policy.get("current_surface_allowed")):
        restricted_actions.append("display")
    if not bool(policy.get("can_export")):
        restricted_actions.extend(["export", "share"])
    if not bool(policy.get("can_cache_offline")):
        restricted_actions.append("offline_cache")
    if not bool(policy.get("can_use_in_ai_summary")):
        restricted_actions.append("ai_summary")
    if not bool(policy.get("can_use_in_mobile")):
        restricted_actions.append("mobile_display")
    return _dedupe(restricted_actions)


def build_restricted_content(
    origin: SourceOrigin | str,
    policy: dict[str, Any],
) -> dict[str, Any]:
    normalized_origin = normalize_source_origin(origin)
    if bool(policy.get("current_surface_allowed")):
        return {
            "blocked": False,
            "title": None,
            "message": None,
            "reason_codes": [],
        }

    reason_codes = list(policy.get("block_reason_codes", []))
    if normalized_origin == SourceOrigin.vow and "vow_not_enabled_for_market_source" in reason_codes:
        message = "VOW access is not enabled for this market/source."
    elif normalized_origin == SourceOrigin.vow:
        message = "VOW registration prerequisites are required before this property can be displayed."
    elif normalized_origin == SourceOrigin.idx:
        message = "IDX-origin property data is blocked until market-specific rules are configured for this surface."
    elif normalized_origin == SourceOrigin.licensed_feed_other:
        message = "Licensed feed restrictions are not configured for this market/source."
    elif normalized_origin == SourceOrigin.unknown_restricted:
        message = "Restricted source-origin data is blocked until it is explicitly classified and configured."
    else:
        message = "This property is blocked on the current surface by source-origin restrictions."

    return {
        "blocked": True,
        "title": "Restricted content",
        "message": message,
        "reason_codes": reason_codes,
    }


def _missing_vow_prerequisites(vow_registration: dict[str, Any]) -> list[str]:
    if not vow_registration.get("enabled_for_market_source"):
        return ["market_vow_enablement"]

    missing: list[str] = []
    if not vow_registration.get("registrant_name"):
        missing.append("registrant_name")
    if not vow_registration.get("valid_email"):
        missing.append("valid_email")
    if not vow_registration.get("terms_of_use_acknowledged"):
        missing.append("terms_of_use_acknowledgement")
    if vow_registration.get("verification_state") != VowVerificationState.verified.value:
        missing.append("verification")
    if not vow_registration.get("accepted_at"):
        missing.append("timestamped_acceptance_record")
    return missing


def _enforce_controlled_surface(
    surface: str,
    controlled_surfaces: Iterable[Any] | None,
    reasons: list[str],
) -> None:
    normalized_surfaces = {str(item) for item in controlled_surfaces or [] if item}
    if surface in CONTROLLED_SURFACES and normalized_surfaces and surface not in normalized_surfaces:
        reasons.append(f"surface_not_allowed_{surface}")


def _current_surface_allowed(surface: str, origin: SourceOrigin, policy: dict[str, Any]) -> bool:
    if surface == "public":
        return bool(policy.get("can_display_public"))
    if surface == "web":
        return bool(policy.get("can_display_authenticated"))
    if surface == "mobile":
        return bool(policy.get("can_display_authenticated") and policy.get("can_use_in_mobile"))
    if surface == "ai_summary":
        return bool(policy.get("can_use_in_ai_summary"))
    if origin in SAFE_ORIGINS:
        return bool(policy.get("can_display_authenticated"))
    return False


def _surface_block_reason(surface: str) -> str:
    if surface == "mobile":
        return "mobile_display_not_permitted"
    if surface == "ai_summary":
        return "ai_summary_not_permitted"
    if surface == "public":
        return "public_display_not_permitted"
    if surface == "web":
        return "authenticated_display_not_permitted"
    return "surface_not_permitted"


def _looks_like_email(value: Any) -> bool:
    if not value:
        return False
    _, parsed = parseaddr(str(value))
    if "@" not in parsed:
        return False
    local, _, domain = parsed.partition("@")
    return bool(local and "." in domain)


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped
