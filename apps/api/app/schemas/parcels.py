from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.disclosures import DisclosureGateDecisionOut


class FreshnessSummary(BaseModel):
    fetched_at: str | None = None
    ttl_seconds: int | None = None
    staleness: str = "unknown"
    is_stale: bool | None = None


class SourceDisplayPolicy(BaseModel):
    can_display_public: bool
    can_display_authenticated: bool
    requires_vow_registration: bool
    can_cache_offline: bool
    can_export: bool
    can_use_in_ai_summary: bool
    can_use_in_mobile: bool
    block_reason_codes: list[str] = Field(default_factory=list)
    required_prerequisites: list[str] = Field(default_factory=list)
    current_surface: str = "authenticated_api"
    current_surface_allowed: bool = False


class RestrictedContentState(BaseModel):
    blocked: bool
    title: str | None = None
    message: str | None = None
    reason_codes: list[str] = Field(default_factory=list)


class VowRegistrationState(BaseModel):
    market: str | None = None
    source_name: str | None = None
    enabled_for_market_source: bool = False
    registrant_name: str | None = None
    registrant_email: str | None = None
    valid_email: bool = False
    terms_of_use_acknowledged: bool = False
    verification_state: str = "not_started"
    accepted_at: str | None = None
    acceptance_record: dict[str, Any] | None = None
    terms_version: str | None = None


class PublicPageComplianceOut(BaseModel):
    jurisdiction: str | None = None
    last_updated_at: str | None = None
    status: str
    message: str
    update_window_days: int | None = None


class ParcelSearchResult(BaseModel):
    id: UUID
    parcel_number: str
    address: str
    city: str
    state: str
    zip: str
    updated_at: datetime
    source_origin: str
    field_origin_mode: str = "record_level"
    display_policy: SourceDisplayPolicy
    freshness: FreshnessSummary
    attribution_requirements: list[str] = Field(default_factory=list)
    restricted_actions: list[str] = Field(default_factory=list)
    restricted_content: RestrictedContentState
    vow_registration: VowRegistrationState | None = None
    disclosure_status: DisclosureGateDecisionOut
    public_page_compliance: PublicPageComplianceOut


class ParcelDetailResponse(ParcelSearchResult):
    attributes_json: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, Any] = Field(default_factory=dict)
    permits_summary: dict[str, Any] = Field(default_factory=dict)
    flood_zone: dict[str, Any] = Field(default_factory=dict)
    nearby_pois: list[dict[str, Any]] = Field(default_factory=list)
    transit_proximity: dict[str, Any] = Field(default_factory=dict)
    timeline: list[dict[str, Any]] = Field(default_factory=list)
    insights: dict[str, Any] = Field(default_factory=dict)
