from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class DealCreate(BaseModel):
    title: str
    deal_type: str = "seller"
    stage: str = "new_lead"
    priority: str = "normal"
    status: str = "open"
    contact_id: UUID | None = None
    parcel_id: UUID | None = None
    primary_agent_user_id: UUID | None = None
    list_price: int | None = None
    target_price: int | None = None
    target_close_date: date | None = None
    next_milestone_at: datetime | None = None
    notes: str | None = None


class DealUpdate(BaseModel):
    title: str | None = None
    deal_type: str | None = None
    stage: str | None = None
    priority: str | None = None
    status: str | None = None
    contact_id: UUID | None = None
    parcel_id: UUID | None = None
    primary_agent_user_id: UUID | None = None
    list_price: int | None = None
    target_price: int | None = None
    target_close_date: date | None = None
    next_milestone_at: datetime | None = None
    notes: str | None = None


class DealOut(BaseModel):
    id: UUID
    title: str
    deal_type: str
    stage: str
    priority: str
    status: str
    contact_id: UUID | None = None
    parcel_id: UUID | None = None
    primary_agent_user_id: UUID | None = None
    list_price: int | None = None
    target_price: int | None = None
    target_close_date: date | None = None
    next_milestone_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
    contact_name: str | None = None
    parcel_address: str | None = None
    open_task_count: int = 0
    overdue_task_count: int = 0


class DealTaskOut(BaseModel):
    id: UUID
    title: str
    status: str
    priority: str
    due_at: datetime | None = None
    created_at: datetime
