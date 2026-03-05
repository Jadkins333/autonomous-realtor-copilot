from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class Freshness(BaseModel):
    fetched_at: datetime
    ttl_seconds: int
    staleness: str


class ProvenanceEnvelope(BaseModel):
    source_id: UUID | None = None
    raw_url: str | None = None
    external_id: str | None = None
    freshness: Freshness | None = None
