from pydantic import BaseModel, Field


class OpportunityStatusUpdateRequest(BaseModel):
    status: str = Field(min_length=2, max_length=32)
    reason: str | None = Field(default=None, max_length=512)
