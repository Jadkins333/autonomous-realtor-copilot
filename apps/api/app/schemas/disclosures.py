from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class BlockingDisclosureOut(BaseModel):
    gate_id: UUID
    gate_key: str
    disclosure_definition_id: UUID
    disclosure_key: str
    disclosure_type: str
    disclosure_version_id: UUID
    title: str
    version: str
    effective_date: date
    acknowledgement_mode: str
    trigger_event: str
    required_before_action: str
    typed_ack_text: str | None = None
    message: str
    guidance: str
    summary: str
    human_readable_message: str
    reason_code: str


class DisclosureGateDecisionOut(BaseModel):
    allowed: bool
    blocking_disclosures: list[BlockingDisclosureOut] = Field(default_factory=list)
    reason_codes: list[str] = Field(default_factory=list)
    human_readable_messages: list[str] = Field(default_factory=list)
    jurisdiction: str


class DisclosureVersionOut(BaseModel):
    id: UUID
    disclosure_definition_id: UUID
    disclosure_key: str
    disclosure_type: str
    jurisdiction: str
    version: str
    title: str
    body_markdown: str
    effective_date: date
    acknowledgement_mode: str
    typed_ack_text: str | None = None


class DisclosureAcknowledgementIn(BaseModel):
    disclosure_version_id: UUID
    workflow_action: str = Field(min_length=2, max_length=128)
    contact_id: UUID | None = None
    client_id: str | None = None
    parcel_id: UUID | None = None
    listing_id: str | None = None
    acknowledgement_mode: str = Field(min_length=2, max_length=64)
    acknowledgement_artifact: dict = Field(default_factory=dict)
    signature_payload: dict = Field(default_factory=dict)
    device_metadata: dict = Field(default_factory=dict)
    actor_source: dict = Field(default_factory=dict)


class DisclosureEvaluateIn(BaseModel):
    action: str = Field(min_length=2, max_length=128)
    contact_id: UUID | None = None
    property_id: UUID | None = None
    source: str = "ui"
    log_presentation: bool = False


class DisclosureAcknowledgeCompatIn(BaseModel):
    action: str = Field(min_length=2, max_length=128)
    disclosure_version_id: UUID
    contact_id: UUID | None = None
    property_id: UUID | None = None
    source: str = "ui"
    checkbox_acknowledged: bool = False
    typed_acknowledgement: str | None = None


class DisclosureAcknowledgementOut(BaseModel):
    acknowledgement_id: UUID
    acknowledged_at: datetime
    disclosure_gate: DisclosureGateDecisionOut
