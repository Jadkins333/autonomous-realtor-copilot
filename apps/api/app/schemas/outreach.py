from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DraftMessageOut(BaseModel):
    id: UUID
    pack_id: UUID | None = None
    contact_id: UUID
    channel: str
    subject: str | None = None
    body: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DraftPackCreateIn(BaseModel):
    contact_id: UUID
    parcel_id: UUID | None = None
    objective: str = Field(min_length=3, max_length=2000)
    channels: list[str] = Field(min_length=1)
    sandbox: bool = True


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
