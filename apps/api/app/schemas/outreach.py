from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class DraftMessageOut(BaseModel):
    id: UUID
    contact_id: UUID
    channel: str
    subject: str | None = None
    body: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
