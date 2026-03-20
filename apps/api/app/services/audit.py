from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.entities import ActivityEvent


def record_activity_event(
    db: Session,
    *,
    tenant_id: UUID,
    entity_type: str,
    entity_id: str,
    event_type: str,
    metadata: dict,
    actor_user_id: UUID | None = None,
) -> ActivityEvent:
    event = ActivityEvent(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        event_type=event_type,
        metadata_json=metadata,
    )
    db.add(event)
    return event
