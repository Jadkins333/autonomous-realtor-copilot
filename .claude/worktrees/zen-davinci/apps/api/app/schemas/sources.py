from typing import Optional

from pydantic import BaseModel


class SourceStatusItemOut(BaseModel):
 source_name: str
 mode: str
 state: str
 reachable: Optional[bool] = None
 is_stale: bool
 last_run_started_at: Optional[str] = None
 last_run_finished_at: Optional[str] = None
 last_success_at: Optional[str] = None
 last_error: Optional[str] = None
 drift_detected: bool
 drift_reason: Optional[str] = None
 dlq_count: int
 paused_reason: Optional[str] = None
 updated_at: str


class SourceStatusOut(BaseModel):
 items: list[SourceStatusItemOut]
