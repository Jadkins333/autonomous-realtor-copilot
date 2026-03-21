from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class EnrollmentOut(BaseModel):
    id: UUID
    contact_id: UUID
    contact_name: str
    contact_email: str | None
    state: str
    enrolled_at: datetime
    next_step_at: datetime | None

    model_config = {"from_attributes": True}


class ContactMessageOut(BaseModel):
    id: UUID
    channel: str
    direction: str
    status: str
    subject: str | None
    body_preview: str
    created_at: datetime
    sent_at: datetime | None

    model_config = {"from_attributes": True}


class ContactEnrollmentOut(BaseModel):
    id: UUID
    sequence_id: UUID
    sequence_name: str
    state: str
    enrolled_at: datetime
    next_step_at: datetime | None

    model_config = {"from_attributes": True}
