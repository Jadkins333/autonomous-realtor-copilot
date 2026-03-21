from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.common import CoverageSummary


class TruthFreshness(BaseModel):
    fetched_at: datetime | None = None
    ttl_seconds: int | None = None
    staleness: str | None = None
    is_stale: bool | None = None


class TruthInput(BaseModel):
    value: Any = None
    fields: list[str] = Field(default_factory=list)
    ids: list[str] = Field(default_factory=list)


class TruthProvenanceItem(BaseModel):
    source_id: str | None = None
    provenance_record_id: str | None = None
    raw_url: str
    freshness: TruthFreshness


class TruthProvenance(BaseModel):
    sources: list[TruthProvenanceItem] = Field(default_factory=list)


class TruthMetricResponse(BaseModel):
    status: Literal["ok", "insufficient_data"]
    insufficient_data: bool
    formula_key: str
    formula_version: str
    formula_markdown: str
    computed_at: datetime
    value: dict[str, Any]
    inputs: dict[str, TruthInput]
    provenance: TruthProvenance
    freshness: TruthFreshness
    coverage_summary: CoverageSummary
    missing_inputs: list[str] = Field(default_factory=list)
