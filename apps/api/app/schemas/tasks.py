from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    status: str = "open"
    priority: str = "normal"
    due_at: datetime | None = None
    contact_id: UUID | None = None
    parcel_id: UUID | None = None
    deal_id: UUID | None = None
    assigned_user_id: UUID | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    due_at: datetime | None = None
    contact_id: UUID | None = None
    parcel_id: UUID | None = None
    deal_id: UUID | None = None
    assigned_user_id: UUID | None = None


class TaskOut(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    status: str
    priority: str
    due_at: datetime | None = None
    contact_id: UUID | None = None
    parcel_id: UUID | None = None
    deal_id: UUID | None = None
    assigned_user_id: UUID | None = None
    completed_at: datetime | None = None
    created_at: datetime
    contact_name: str | None = None
    deal_title: str | None = None
    parcel_address: str | None = None
