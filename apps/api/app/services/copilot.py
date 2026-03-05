from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.copilot.agents.base import AgentContext
from app.copilot.router import route_message


def run_copilot_command(db: Session, tenant_id: UUID, user_id: UUID, text: str) -> dict:
    return route_message(AgentContext(db=db, tenant_id=tenant_id, user_id=user_id, message=text))
