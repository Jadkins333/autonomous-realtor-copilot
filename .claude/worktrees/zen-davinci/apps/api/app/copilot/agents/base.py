from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session


@dataclass
class AgentContext:
    db: Session
    tenant_id: UUID
    message: str
    user_id: UUID | None = None


class AgentTraceRefs(BaseModel):
    provenance_record_ids: list[str] = Field(default_factory=list)
    source_run_ids: list[str] = Field(default_factory=list)
    freshness: list[dict] = Field(default_factory=list)


class AgentResult(BaseModel):
    text: str
    data: dict = Field(default_factory=dict)
    tools_used: list[str] = Field(default_factory=list)
    status: str = "ok"
    missing_inputs: list[str] = Field(default_factory=list)
    trace_refs: AgentTraceRefs = Field(default_factory=AgentTraceRefs)


class AgentMatch(BaseModel):
    matched: bool
    reason: str


class CopilotAgent(Protocol):
    key: str
    name: str
    description: str
    mission: str
    sample_prompts: list[str]

    def match(self, message: str) -> AgentMatch:
        ...

    def run(self, context: AgentContext) -> AgentResult:
        ...
