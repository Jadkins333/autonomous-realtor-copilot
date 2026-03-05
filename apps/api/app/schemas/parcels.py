from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ParcelSearchResult(BaseModel):
    id: UUID
    parcel_number: str
    address: str
    city: str
    state: str
    zip: str
    updated_at: datetime

    model_config = {"from_attributes": True}
