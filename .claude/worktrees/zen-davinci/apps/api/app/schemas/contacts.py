from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ContactCreate(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    tags_json: list[str] = Field(default_factory=list)
    notes: str | None = None


class ContactUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    tags_json: list[str] | None = None
    notes: str | None = None


class ContactOut(BaseModel):
    id: UUID
    name: str
    email: str | None = None
    phone: str | None = None
    tags_json: list[str]
    notes: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
