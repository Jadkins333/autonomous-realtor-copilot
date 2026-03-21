from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ContactCreate(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    timezone: str | None = None
    tags_json: list[str] = Field(default_factory=list)
    notes: str | None = None
    stage: str = "sphere"
    lead_source: str | None = None
    household_name: str | None = None
    birthday: date | None = None
    home_anniversary: date | None = None
    referral_source: str | None = None
    preferred_channel: str | None = None
    client_summary: str | None = None
    assigned_user_id: UUID | None = None
    last_contact_at: datetime | None = None
    next_step_due_at: datetime | None = None
    next_step_note: str | None = None
    priority: str = "normal"


class ContactUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    timezone: str | None = None
    tags_json: list[str] | None = None
    notes: str | None = None
    stage: str | None = None
    lead_source: str | None = None
    household_name: str | None = None
    birthday: date | None = None
    home_anniversary: date | None = None
    referral_source: str | None = None
    preferred_channel: str | None = None
    client_summary: str | None = None
    assigned_user_id: UUID | None = None
    last_contact_at: datetime | None = None
    next_step_due_at: datetime | None = None
    next_step_note: str | None = None
    priority: str | None = None


class ContactOut(BaseModel):
    id: UUID
    name: str
    email: str | None = None
    phone: str | None = None
    timezone: str | None = None
    tags_json: list[str]
    notes: str | None = None
    stage: str
    lead_source: str | None = None
    household_name: str | None = None
    birthday: date | None = None
    home_anniversary: date | None = None
    referral_source: str | None = None
    preferred_channel: str | None = None
    client_summary: str | None = None
    assigned_user_id: UUID | None = None
    last_contact_at: datetime | None = None
    next_step_due_at: datetime | None = None
    next_step_note: str | None = None
    priority: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ContactTaskOut(BaseModel):
    id: UUID
    title: str
    status: str
    priority: str
    due_at: datetime | None = None
    created_at: datetime


class ContactDealOut(BaseModel):
    id: UUID
    title: str
    deal_type: str
    stage: str
    priority: str
    status: str
    target_close_date: date | None = None
    next_milestone_at: datetime | None = None
    updated_at: datetime


class ContactActivityOut(BaseModel):
    id: UUID
    entity_type: str
    entity_id: str
    event_type: str
    metadata_json: dict = Field(default_factory=dict)
    created_at: datetime


class ContactEventCreate(BaseModel):
    event_type: str = "call"
    body: str
    deal_id: UUID | None = None


class ContactEventOut(BaseModel):
    id: UUID
    contact_id: UUID
    deal_id: UUID | None = None
    deal_title: str | None = None
    event_type: str
    body: str
    created_at: datetime
