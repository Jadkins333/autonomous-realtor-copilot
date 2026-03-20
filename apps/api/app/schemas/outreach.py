from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.disclosures import DisclosureGateDecisionOut


class FairHousingScanOut(BaseModel):
    blocked: bool
    flagged_terms: list[str] = Field(default_factory=list)
    reason_codes: list[str] = Field(default_factory=list)
    explanations: list[str] = Field(default_factory=list)


class PolicyDecisionOut(BaseModel):
    allowed: bool
    reason_codes: list[str] = Field(default_factory=list)
    human_readable_explanations: list[str] = Field(default_factory=list)
    evaluated_at: datetime
    recipient_timezone_used: str | None = None
    consent_evidence_refs: list[str] = Field(default_factory=list)
    delivery_mode: str
    fair_housing_scan: FairHousingScanOut | None = None


class SendAttemptOut(BaseModel):
    id: UUID
    final_status: str
    provider_selected: str | None = None
    provider_message_id: str | None = None
    completed_at: datetime | None = None
    policy_snapshot: PolicyDecisionOut | None = None


class DraftMessageOut(BaseModel):
    id: UUID
    pack_id: UUID | None = None
    property_id: UUID | None = None
    contact_id: UUID
    channel: str
    subject: str | None = None
    body: str
    status: str
    created_at: datetime
    approval_state: str = "draft"
    compliance_snapshot: PolicyDecisionOut | None = None
    disclosure_status: DisclosureGateDecisionOut | None = None
    fair_housing_scan: FairHousingScanOut | None = None
    sandbox_indicator: str | None = None
    last_send_attempt: SendAttemptOut | None = None

    model_config = {"from_attributes": True}


class DraftPackCreateIn(BaseModel):
    contact_id: UUID
    parcel_id: UUID | None = None
    objective: str = Field(min_length=3, max_length=2000)
    channels: list[str] = Field(min_length=1)
    sandbox: bool = True


class DraftMessageUpdateIn(BaseModel):
    subject: str | None = Field(default=None, max_length=255)
    body: str | None = Field(default=None, max_length=2000)


class DraftPackSubmitOut(BaseModel):
    id: UUID
    status: str
    submitted_at: datetime


class DraftPackOut(BaseModel):
    id: UUID
    created_at: datetime
    created_by_user_id: UUID
    parcel_id: UUID | None = None
    contact_id: UUID | None = None
    status: str
    sandbox: bool
    objective: str
    drafts: list[DraftMessageOut] = Field(default_factory=list)


class DraftPacksListOut(BaseModel):
    items: list[DraftPackOut]
    next_cursor: str | None = None


class DraftActionOut(BaseModel):
    id: UUID
    pack_id: UUID | None = None
    status: str
    approval_state: str
    pack_status: str | None = None
    reason: str | None = None
    reason_codes: list[str] = Field(default_factory=list)
    explanations: list[str] = Field(default_factory=list)
    policy_snapshot: PolicyDecisionOut | None = None
    disclosure_status: DisclosureGateDecisionOut | None = None
    send_attempt_id: UUID | None = None
