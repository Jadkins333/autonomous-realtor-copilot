from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import Parcel, ProvenanceRecord, Source, VowAccessProfile
from app.models.enums import SourceOrigin
from app.services.disclosures import build_public_page_compliance, evaluate_disclosure_gate
from app.services.insights import compute_parcel_insights, parcel_detail_metrics
from app.services.provenance import build_provenance
from app.services.source_restrictions import (
    build_restricted_content,
    build_vow_registration_state,
    derive_restricted_actions,
    evaluate_source_restrictions,
    normalize_origin_metadata,
    normalize_source_origin,
)

settings = get_settings()


def search_parcels(
    db: Session,
    tenant_id: UUID,
    query: str,
    *,
    user_id: UUID | None = None,
    surface: str = "authenticated_api",
) -> list[dict[str, Any]]:
    parcels = list(
        db.execute(
            select(Parcel)
            .where(
                Parcel.tenant_id == tenant_id,
                (Parcel.address.ilike(f"%{query}%")) | (Parcel.parcel_number.ilike(f"%{query}%")),
            )
            .order_by(Parcel.updated_at.desc())
            .limit(50)
        ).scalars()
    )

    return [
        _build_parcel_response(
            db,
            parcel,
            user_id=user_id,
            surface=surface,
            include_detail=False,
        )
        for parcel in parcels
    ]


def get_parcel_detail(
    db: Session,
    tenant_id: UUID,
    parcel_id: UUID,
    *,
    user_id: UUID | None = None,
    surface: str = "authenticated_api",
) -> dict[str, Any]:
    parcel = db.execute(
        select(Parcel).where(Parcel.tenant_id == tenant_id, Parcel.id == parcel_id)
    ).scalar_one_or_none()
    if not parcel:
        raise ValueError("Parcel not found")

    return _build_parcel_response(db, parcel, user_id=user_id, surface=surface, include_detail=True)


def _build_parcel_response(
    db: Session,
    parcel: Parcel,
    *,
    user_id: UUID | None,
    surface: str,
    include_detail: bool,
) -> dict[str, Any]:
    provenance = _get_provenance_record(db, parcel.provenance_id)
    source = _get_source(db, provenance.source_id) if provenance else None
    origin = normalize_source_origin(parcel.source_origin)
    metadata = _build_origin_metadata(parcel, source)
    vow_profile = _get_vow_access_profile(db, parcel.tenant_id, user_id, metadata) if origin == SourceOrigin.vow else None
    vow_registration = build_vow_registration_state(vow_profile, metadata) if origin == SourceOrigin.vow else None
    policy = evaluate_source_restrictions(
        origin,
        surface=surface,
        metadata=metadata,
        vow_registration=vow_registration,
    )
    restricted_content = build_restricted_content(origin, policy)
    restricted_actions = derive_restricted_actions(policy)
    provenance_payload = build_provenance(
        provenance.source_id if provenance else None,
        provenance.raw_url if provenance else "seed://parcels",
        provenance.external_id if provenance else parcel.parcel_number,
        provenance,
    )
    freshness = provenance_payload["freshness"]
    base_payload = _base_payload(
        parcel,
        policy=policy,
        restricted_content=restricted_content,
        freshness=freshness,
        source=source,
        metadata=metadata,
        origin=origin,
        restricted_actions=restricted_actions,
        vow_registration=vow_registration,
        disclosure_status=evaluate_disclosure_gate(
            db,
            tenant_id=parcel.tenant_id,
            user_id=user_id,
            action="property_marketing_action",
            property_id=parcel.id,
            jurisdiction=parcel.state,
            log_presentation=False,
        ),
        public_page_compliance=build_public_page_compliance(
            jurisdiction=parcel.state,
            freshness=freshness,
        ),
    )

    if not include_detail or restricted_content["blocked"]:
        return {
            **base_payload,
            "attributes_json": {},
            "provenance": provenance_payload,
            "permits_summary": {},
            "flood_zone": {},
            "nearby_pois": [],
            "transit_proximity": {},
            "timeline": [],
            "insights": {},
        }

    details = parcel_detail_metrics(db, parcel.tenant_id, parcel.id)
    insights = compute_parcel_insights(db, parcel.tenant_id, parcel.id)
    return {
        **base_payload,
        "attributes_json": parcel.attributes_json,
        "provenance": provenance_payload,
        **details,
        "insights": insights,
    }


def _base_payload(
    parcel: Parcel,
    *,
    policy: dict[str, Any],
    restricted_content: dict[str, Any],
    freshness: dict[str, Any],
    source: Source | None,
    metadata: dict[str, Any],
    origin: SourceOrigin,
    restricted_actions: list[str],
    vow_registration: dict[str, Any] | None,
    disclosure_status: dict[str, Any],
    public_page_compliance: dict[str, Any],
) -> dict[str, Any]:
    blocked = bool(restricted_content["blocked"])
    address = parcel.address if not blocked else "Restricted property detail"
    parcel_number = parcel.parcel_number if not blocked else "Restricted"
    city = parcel.city if not blocked else "Restricted"
    state = parcel.state if not blocked else ""
    zip_code = parcel.zip if not blocked else ""

    attribution_requirements = list(metadata.get("attribution_requirements") or [])
    if not attribution_requirements and source and source.license_notes:
        attribution_requirements = [source.license_notes]

    return {
        "id": str(parcel.id),
        "parcel_number": parcel_number,
        "address": address,
        "city": city,
        "state": state,
        "zip": zip_code,
        "updated_at": parcel.updated_at,
        "source_origin": origin.value,
        "field_origin_mode": str(metadata.get("field_origin_mode", "record_level")),
        "display_policy": policy,
        "freshness": freshness,
        "attribution_requirements": attribution_requirements,
        "restricted_actions": restricted_actions,
        "restricted_content": restricted_content,
        "vow_registration": vow_registration,
        "disclosure_status": disclosure_status,
        "public_page_compliance": public_page_compliance,
    }


def _build_origin_metadata(parcel: Parcel, source: Source | None) -> dict[str, Any]:
    origin = normalize_source_origin(parcel.source_origin)
    metadata = normalize_origin_metadata(origin, parcel.source_origin_details_json)
    metadata.setdefault("market", settings.default_locale)
    metadata.setdefault("source_name", source.name if source else origin.value)
    if source and source.license_notes and not metadata.get("attribution_requirements"):
        metadata["attribution_requirements"] = [source.license_notes]
    return metadata


def _get_provenance_record(db: Session, provenance_id: UUID | None) -> ProvenanceRecord | None:
    if not provenance_id:
        return None
    return db.execute(select(ProvenanceRecord).where(ProvenanceRecord.id == provenance_id)).scalar_one_or_none()


def _get_source(db: Session, source_id: UUID | None) -> Source | None:
    if not source_id:
        return None
    return db.execute(select(Source).where(Source.id == source_id)).scalar_one_or_none()


def _get_vow_access_profile(
    db: Session,
    tenant_id: UUID,
    user_id: UUID | None,
    metadata: dict[str, Any],
) -> VowAccessProfile | None:
    if not user_id:
        return None
    market = str(metadata.get("market") or settings.default_locale)
    source_name = str(metadata.get("source_name") or SourceOrigin.vow.value)
    return db.execute(
        select(VowAccessProfile).where(
            VowAccessProfile.tenant_id == tenant_id,
            VowAccessProfile.user_id == user_id,
            VowAccessProfile.market == market,
            VowAccessProfile.source_name == source_name,
        )
    ).scalar_one_or_none()
