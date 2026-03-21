from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import Contact, ContactEvent, Deal, Task
from app.services.workspace import get_today_workspace, serialize_deal

ACTIVE_LISTING_STAGES = {"listing_prep", "active_listing"}
BUYER_STAGE_HINTS = {"buyer", "preapproved", "touring", "offer"}
INACTIVE_CONTACT_STAGES = {"closed", "archive"}
PRIORITY_SCORES = {"urgent": 4, "high": 3, "normal": 2, "low": 1}


def _utcnow() -> datetime:
    return datetime.now(tz=UTC)


def _latest_contact_event_map(db: Session, tenant_id: UUID) -> dict[UUID, datetime]:
    rows = db.execute(
        select(ContactEvent.contact_id, func.max(ContactEvent.created_at))
        .where(ContactEvent.tenant_id == tenant_id)
        .group_by(ContactEvent.contact_id)
    ).all()
    return {contact_id: created_at for contact_id, created_at in rows if created_at is not None}


def _priority_score(value: str | None) -> int:
    return PRIORITY_SCORES.get((value or "normal").lower(), 0)


def _is_buyer_contact(contact: Contact) -> bool:
    stage = (contact.stage or "").lower()
    tags = [str(tag).lower() for tag in contact.tags_json or []]
    return any(hint in stage for hint in BUYER_STAGE_HINTS) or any("buyer" in tag for tag in tags)


def _hot_buyer_entry(contact: Contact, last_event_at: datetime | None, now: datetime) -> dict | None:
    if contact.stage in INACTIVE_CONTACT_STAGES or not _is_buyer_contact(contact):
        return None

    score = _priority_score(contact.priority) * 10
    reasons: list[str] = []
    if contact.next_step_due_at and contact.next_step_due_at <= now + timedelta(days=2):
        score += 8
        reasons.append("follow-up due soon")
    if last_event_at and last_event_at >= now - timedelta(days=14):
        score += 5
        reasons.append("recent activity")
    if contact.next_step_note:
        score += 2
        reasons.append(contact.next_step_note[:80])
    if contact.preferred_channel:
        reasons.append(f"prefers {contact.preferred_channel}")

    return {
        "id": contact.id,
        "name": contact.name,
        "stage": contact.stage,
        "priority": contact.priority,
        "preferred_channel": contact.preferred_channel,
        "next_step_due_at": contact.next_step_due_at,
        "next_step_note": contact.next_step_note,
        "last_event_at": last_event_at,
        "score": score,
        "reasons": reasons[:3],
    }


def build_business_snapshot(db: Session, tenant_id: UUID) -> dict:
    now = _utcnow()
    workspace = get_today_workspace(db, tenant_id)
    latest_contact_events = _latest_contact_event_map(db, tenant_id)

    deals = list(
        db.execute(select(Deal).where(Deal.tenant_id == tenant_id).order_by(Deal.updated_at.desc())).scalars()
    )
    contacts = list(
        db.execute(select(Contact).where(Contact.tenant_id == tenant_id).order_by(Contact.created_at.desc())).scalars()
    )

    active_listings = [
        serialize_deal(db, deal)
        for deal in deals
        if deal.status != "closed" and (deal.stage in ACTIVE_LISTING_STAGES or deal.deal_type == "listing")
    ][:5]

    hot_buyers = []
    for contact in contacts:
        last_event_at = latest_contact_events.get(contact.id) or contact.last_contact_at or contact.created_at
        entry = _hot_buyer_entry(contact, last_event_at, now)
        if entry is not None:
            hot_buyers.append(entry)
    hot_buyers.sort(
        key=lambda item: (
            -item["score"],
            item["next_step_due_at"] or datetime.max.replace(tzinfo=UTC),
            item["last_event_at"] or datetime.min.replace(tzinfo=UTC),
        )
    )

    open_tasks = db.execute(
        select(func.count(Task.id)).where(Task.tenant_id == tenant_id, Task.status != "completed")
    ).scalar_one()
    open_deals = db.execute(
        select(func.count(Deal.id)).where(Deal.tenant_id == tenant_id, Deal.status != "closed")
    ).scalar_one()

    return {
        "summary": {
            "contacts": len(contacts),
            "open_deals": int(open_deals or 0),
            "open_tasks": int(open_tasks or 0),
            "active_listings": len(active_listings),
            "hot_buyers": len(hot_buyers),
        },
        "today": workspace,
        "active_listings": active_listings,
        "hot_buyers": hot_buyers[:5],
        "coach_alerts": workspace.get("coach_alerts", [])[:5],
        "deals_at_risk": workspace.get("deals_at_risk", [])[:5],
        "follow_ups": workspace.get("follow_ups", [])[:5],
        "reengage": workspace.get("reengage", [])[:5],
    }
