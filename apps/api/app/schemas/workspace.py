from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.deals import DealOut
from app.schemas.tasks import TaskOut


class FollowUpContactOut(BaseModel):
    id: UUID
    name: str
    stage: str
    priority: str
    next_step_due_at: datetime | None = None
    next_step_note: str | None = None
    last_contact_at: datetime | None = None
    preferred_channel: str | None = None


class ReengageContactOut(BaseModel):
    id: UUID
    name: str
    stage: str
    priority: str
    preferred_channel: str | None = None
    last_event_at: datetime | None = None
    trigger: str
    trigger_date: datetime | None = None
    detail: str


class ComingUpContactOut(BaseModel):
    id: UUID
    name: str
    stage: str
    priority: str
    preferred_channel: str | None = None
    last_event_at: datetime | None = None
    occasion: str
    occasion_date: datetime
    detail: str


class PipelineStageSummary(BaseModel):
    stage: str
    count: int


class CoachAlertOut(BaseModel):
    id: str
    title: str
    detail: str
    href: str
    cta_label: str
    tone: str


class TodaySummaryOut(BaseModel):
    open_tasks: int
    overdue_tasks: int
    due_today: int
    active_deals: int
    deals_at_risk: int
    follow_ups_due: int


class TodayWorkspaceOut(BaseModel):
    summary: TodaySummaryOut
    coach_alerts: list[CoachAlertOut] = Field(default_factory=list)
    urgent_tasks: list[TaskOut] = Field(default_factory=list)
    due_today_tasks: list[TaskOut] = Field(default_factory=list)
    follow_ups: list[FollowUpContactOut] = Field(default_factory=list)
    reengage: list[ReengageContactOut] = Field(default_factory=list)
    coming_up: list[ComingUpContactOut] = Field(default_factory=list)
    deals_at_risk: list[DealOut] = Field(default_factory=list)
    pipeline: list[PipelineStageSummary] = Field(default_factory=list)


class CaptureOpportunityOut(BaseModel):
    deal_id: UUID
    task_id: UUID
    deal_title: str
    task_title: str
