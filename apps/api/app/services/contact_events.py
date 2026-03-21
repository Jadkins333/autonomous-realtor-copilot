from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Contact, ContactEvent, Deal


def _utcnow() -> datetime:
    return datetime.now(tz=UTC)


def log_contact_event(
    db: Session,
    *,
    tenant_id: UUID,
    contact_id: UUID,
    event_type: str,
    body: str,
    deal_id: UUID | None = None,
    created_at: datetime | None = None,
    touch_last_contact: bool = False,
) -> ContactEvent:
    event_time = created_at or _utcnow()
    event = ContactEvent(
        tenant_id=tenant_id,
        contact_id=contact_id,
        deal_id=deal_id,
        event_type=event_type,
        body=body,
        created_at=event_time,
    )
    db.add(event)

    if touch_last_contact:
        contact = db.execute(
            select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if contact and (contact.last_contact_at is None or contact.last_contact_at < event_time):
            contact.last_contact_at = event_time

    return event


def serialize_contact_event(db: Session, event: ContactEvent) -> dict:
    deal = db.execute(select(Deal).where(Deal.id == event.deal_id)).scalar_one_or_none() if event.deal_id else None
    return {
        "id": event.id,
        "contact_id": event.contact_id,
        "deal_id": event.deal_id,
        "deal_title": deal.title if deal else None,
        "event_type": event.event_type,
        "body": event.body,
        "created_at": event.created_at,
    }
