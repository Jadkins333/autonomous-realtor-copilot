from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.entities import ActivityEvent, Contact, ContactEvent, Deal, Parcel, Task
from app.services.audit import record_activity_event
from app.services.contact_events import log_contact_event

ACTIVE_DEAL_STAGES = {
    "new_lead",
    "active_buyer",
    "active_seller",
    "listing_prep",
    "active_listing",
    "under_contract",
    "escrow",
}
RISK_STAGES = {"under_contract", "escrow", "active_listing", "active_buyer", "active_seller"}


def _utcnow() -> datetime:
    return datetime.now(tz=UTC)


def _end_of_today() -> datetime:
    now = _utcnow()
    return datetime.combine(now.date(), time.max, tzinfo=UTC)


def _stage_label(value: str) -> str:
    return value.replace("_", " ")


def _status_label(value: str) -> str:
    return value.replace("_", " ")


def _listing_attention_alert(deal: Deal, *, overdue_count: int, stale_days: int) -> dict:
    if overdue_count > 0:
        detail = (
            f"{deal.title} has {overdue_count} overdue task"
            f"{'' if overdue_count == 1 else 's'} in {deal.stage.replace('_', ' ')}."
        )
    else:
        detail = f"{deal.title} has not been updated in {stale_days} days. Review price, positioning, and next steps."
    return {
        "id": f"listing-{deal.id}",
        "title": "Listing needs a strategy check",
        "detail": detail,
        "href": f"/deals/{deal.id}",
        "cta_label": "Review listing",
        "tone": "warn",
        "_sort": (0, -overdue_count, -stale_days),
    }


def _deal_risk_alert(deal: Deal, *, overdue_count: int) -> dict:
    milestone_text = (
        f"Milestone due {_format_due_at(deal.next_milestone_at)}."
        if deal.next_milestone_at
        else "Milestone timing needs review."
    )
    if overdue_count > 0:
        detail = (
            f"{deal.title} is at risk with {overdue_count} overdue task"
            f"{'' if overdue_count == 1 else 's'}. {milestone_text}"
        )
    else:
        detail = f"{deal.title} is at risk. {milestone_text}"
    return {
        "id": f"risk-{deal.id}",
        "title": "Deal needs intervention",
        "detail": detail,
        "href": f"/deals/{deal.id}",
        "cta_label": "Rescue deal",
        "tone": "danger",
        "_sort": (0, -overdue_count, deal.next_milestone_at or datetime.max.replace(tzinfo=UTC)),
    }


def _format_due_at(value: datetime | None) -> str:
    if value is None:
        return "No due date"
    return value.strftime("%b %-d at %-I:%M %p")


def _safe_annual_date(year: int, month: int, day: int) -> date:
    if month == 2 and day == 29:
        try:
            return date(year, month, day)
        except ValueError:
            return date(year, 2, 28)
    return date(year, month, day)


def _next_annual_occurrence(value: date | None, now: datetime) -> datetime | None:
    if value is None:
        return None
    this_year = _safe_annual_date(now.year, value.month, value.day)
    occurrence = datetime.combine(this_year, time(hour=9), tzinfo=UTC)
    if occurrence < now:
        next_year = _safe_annual_date(now.year + 1, value.month, value.day)
        occurrence = datetime.combine(next_year, time(hour=9), tzinfo=UTC)
    return occurrence


def _latest_contact_event_map(db: Session, tenant_id: UUID) -> dict[UUID, datetime]:
    rows = db.execute(
        select(ContactEvent.contact_id, func.max(ContactEvent.created_at))
        .where(ContactEvent.tenant_id == tenant_id)
        .group_by(ContactEvent.contact_id)
    ).all()
    return {contact_id: created_at for contact_id, created_at in rows if created_at is not None}


def serialize_task(db: Session, task: Task) -> dict:
    contact = db.execute(select(Contact).where(Contact.id == task.contact_id)).scalar_one_or_none() if task.contact_id else None
    deal = db.execute(select(Deal).where(Deal.id == task.deal_id)).scalar_one_or_none() if task.deal_id else None
    parcel = db.execute(select(Parcel).where(Parcel.id == task.parcel_id)).scalar_one_or_none() if task.parcel_id else None
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "due_at": task.due_at,
        "contact_id": task.contact_id,
        "parcel_id": task.parcel_id,
        "deal_id": task.deal_id,
        "assigned_user_id": task.assigned_user_id,
        "completed_at": task.completed_at,
        "created_at": task.created_at,
        "contact_name": contact.name if contact else None,
        "deal_title": deal.title if deal else None,
        "parcel_address": parcel.address if parcel else None,
    }


def serialize_deal(db: Session, deal: Deal) -> dict:
    contact = db.execute(select(Contact).where(Contact.id == deal.contact_id)).scalar_one_or_none() if deal.contact_id else None
    parcel = db.execute(select(Parcel).where(Parcel.id == deal.parcel_id)).scalar_one_or_none() if deal.parcel_id else None
    open_task_count = db.execute(
        select(func.count(Task.id)).where(Task.deal_id == deal.id, Task.status != "completed")
    ).scalar_one()
    overdue_task_count = db.execute(
        select(func.count(Task.id)).where(
            Task.deal_id == deal.id,
            Task.status != "completed",
            Task.due_at.is_not(None),
            Task.due_at < _utcnow(),
        )
    ).scalar_one()
    return {
        "id": deal.id,
        "title": deal.title,
        "deal_type": deal.deal_type,
        "stage": deal.stage,
        "priority": deal.priority,
        "status": deal.status,
        "contact_id": deal.contact_id,
        "parcel_id": deal.parcel_id,
        "primary_agent_user_id": deal.primary_agent_user_id,
        "list_price": deal.list_price,
        "target_price": deal.target_price,
        "target_close_date": deal.target_close_date,
        "next_milestone_at": deal.next_milestone_at,
        "notes": deal.notes,
        "created_at": deal.created_at,
        "updated_at": deal.updated_at,
        "contact_name": contact.name if contact else None,
        "parcel_address": parcel.address if parcel else None,
        "open_task_count": int(open_task_count or 0),
        "overdue_task_count": int(overdue_task_count or 0),
    }


def list_deals(db: Session, tenant_id: UUID) -> list[dict]:
    deals = list(
        db.execute(select(Deal).where(Deal.tenant_id == tenant_id).order_by(Deal.updated_at.desc())).scalars()
    )
    return [serialize_deal(db, deal) for deal in deals]


def get_deal(db: Session, tenant_id: UUID, deal_id: UUID) -> Deal | None:
    return db.execute(select(Deal).where(Deal.tenant_id == tenant_id, Deal.id == deal_id)).scalar_one_or_none()


def get_deal_detail(db: Session, tenant_id: UUID, deal_id: UUID) -> dict:
    deal = get_deal(db, tenant_id, deal_id)
    if deal is None:
        raise ValueError("Deal not found")
    tasks = list(
        db.execute(select(Task).where(Task.tenant_id == tenant_id, Task.deal_id == deal_id).order_by(Task.created_at.desc())).scalars()
    )
    activity_filters = [(ActivityEvent.entity_type == "deal") & (ActivityEvent.entity_id == str(deal_id))]
    if tasks:
        activity_filters.append(
            (ActivityEvent.entity_type == "task") & (ActivityEvent.entity_id.in_([str(task.id) for task in tasks]))
        )
    activity = list(
        db.execute(
            select(ActivityEvent)
            .where(ActivityEvent.tenant_id == tenant_id, or_(*activity_filters))
            .order_by(ActivityEvent.created_at.desc())
            .limit(25)
        ).scalars()
    )
    return {
        **serialize_deal(db, deal),
        "tasks": [serialize_task(db, task) for task in tasks],
        "activity": [
            {
                "id": item.id,
                "entity_type": item.entity_type,
                "entity_id": item.entity_id,
                "event_type": item.event_type,
                "metadata_json": item.metadata_json,
                "created_at": item.created_at,
            }
            for item in activity
        ],
    }


def create_deal(db: Session, tenant_id: UUID, actor_user_id: UUID | None, payload: dict) -> dict:
    deal = Deal(
        tenant_id=tenant_id,
        title=payload["title"],
        deal_type=payload.get("deal_type") or "seller",
        stage=payload.get("stage") or "new_lead",
        priority=payload.get("priority") or "normal",
        status=payload.get("status") or "open",
        contact_id=payload.get("contact_id"),
        parcel_id=payload.get("parcel_id"),
        primary_agent_user_id=payload.get("primary_agent_user_id") or actor_user_id,
        list_price=payload.get("list_price"),
        target_price=payload.get("target_price"),
        target_close_date=payload.get("target_close_date"),
        next_milestone_at=payload.get("next_milestone_at"),
        notes=payload.get("notes"),
        updated_at=_utcnow(),
    )
    db.add(deal)
    db.flush()
    record_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type="deal",
        entity_id=str(deal.id),
        event_type="deal_created",
        metadata={
            "stage": deal.stage,
            "deal_type": deal.deal_type,
            "contact_id": str(deal.contact_id) if deal.contact_id else None,
        },
    )
    if deal.contact_id:
        log_contact_event(
            db,
            tenant_id=tenant_id,
            contact_id=deal.contact_id,
            deal_id=deal.id,
            event_type="deal_milestone",
            body=f"Opened deal: {deal.title} ({_stage_label(deal.stage)}).",
        )
    db.commit()
    return serialize_deal(db, deal)


def update_deal(db: Session, tenant_id: UUID, deal_id: UUID, actor_user_id: UUID | None, payload: dict) -> dict:
    deal = get_deal(db, tenant_id, deal_id)
    if deal is None:
        raise ValueError("Deal not found")

    previous_stage = deal.stage
    for key, value in payload.items():
        setattr(deal, key, value)
    deal.updated_at = _utcnow()
    db.flush()

    event_type = "deal_updated"
    metadata = {"stage": deal.stage, "priority": deal.priority}
    if previous_stage != deal.stage:
        event_type = "deal_stage_changed"
        metadata["from_stage"] = previous_stage
        metadata["to_stage"] = deal.stage
    metadata["contact_id"] = str(deal.contact_id) if deal.contact_id else None

    record_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type="deal",
        entity_id=str(deal.id),
        event_type=event_type,
        metadata=metadata,
    )
    if deal.contact_id:
        if previous_stage != deal.stage:
            log_contact_event(
                db,
                tenant_id=tenant_id,
                contact_id=deal.contact_id,
                deal_id=deal.id,
                event_type="deal_milestone",
                body=f"Deal moved from {_stage_label(previous_stage)} to {_stage_label(deal.stage)}.",
            )
    db.commit()
    return serialize_deal(db, deal)


def list_tasks(db: Session, tenant_id: UUID, *, status: str | None = None) -> list[dict]:
    stmt = select(Task).where(Task.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(Task.status == status)
    tasks = list(db.execute(stmt.order_by(Task.due_at.asc().nulls_last(), Task.created_at.desc())).scalars())
    return [serialize_task(db, task) for task in tasks]


def get_task(db: Session, tenant_id: UUID, task_id: UUID) -> Task | None:
    return db.execute(select(Task).where(Task.tenant_id == tenant_id, Task.id == task_id)).scalar_one_or_none()


def create_task(db: Session, tenant_id: UUID, actor_user_id: UUID | None, payload: dict) -> dict:
    related_deal = None
    if payload.get("deal_id"):
        related_deal = get_deal(db, tenant_id, payload["deal_id"])
    task = Task(
        tenant_id=tenant_id,
        title=payload["title"],
        description=payload.get("description"),
        status=payload.get("status") or "open",
        priority=payload.get("priority") or "normal",
        due_at=payload.get("due_at"),
        contact_id=payload.get("contact_id") or (related_deal.contact_id if related_deal else None),
        parcel_id=payload.get("parcel_id"),
        deal_id=payload.get("deal_id"),
        assigned_user_id=payload.get("assigned_user_id") or actor_user_id,
        created_by_user_id=actor_user_id,
        completed_at=_utcnow() if payload.get("status") == "completed" else None,
    )
    db.add(task)
    db.flush()
    record_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type="task",
        entity_id=str(task.id),
        event_type="task_created",
        metadata={
            "priority": task.priority,
            "deal_id": str(task.deal_id) if task.deal_id else None,
            "contact_id": str(task.contact_id) if task.contact_id else None,
        },
    )
    if task.contact_id and task.status == "completed":
        log_contact_event(
            db,
            tenant_id=tenant_id,
            contact_id=task.contact_id,
            deal_id=task.deal_id,
            event_type="task_complete",
            body=f'Completed task: "{task.title}".',
        )
    db.commit()
    return serialize_task(db, task)


def update_task(db: Session, tenant_id: UUID, task_id: UUID, actor_user_id: UUID | None, payload: dict) -> dict:
    task = get_task(db, tenant_id, task_id)
    if task is None:
        raise ValueError("Task not found")

    previous_status = task.status
    for key, value in payload.items():
        setattr(task, key, value)
    if task.status == "completed" and task.completed_at is None:
        task.completed_at = _utcnow()
    if task.status != "completed":
        task.completed_at = None
    db.flush()

    event_type = "task_updated"
    metadata = {"status": task.status, "priority": task.priority}
    if previous_status != task.status:
        event_type = "task_status_changed"
        metadata["from_status"] = previous_status
        metadata["to_status"] = task.status
    metadata["contact_id"] = str(task.contact_id) if task.contact_id else None

    record_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type="task",
        entity_id=str(task.id),
        event_type=event_type,
        metadata=metadata,
    )
    if task.contact_id:
        if previous_status != task.status and task.status == "completed":
            log_contact_event(
                db,
                tenant_id=tenant_id,
                contact_id=task.contact_id,
                deal_id=task.deal_id,
                event_type="task_complete",
                body=f'Completed task: "{task.title}".',
            )
    db.commit()
    return serialize_task(db, task)


def get_today_workspace(db: Session, tenant_id: UUID) -> dict:
    now = _utcnow()
    end_today = _end_of_today()

    open_tasks = list(
        db.execute(
            select(Task)
            .where(Task.tenant_id == tenant_id, Task.status != "completed")
            .order_by(Task.due_at.asc().nulls_last(), Task.priority.desc(), Task.created_at.asc())
        ).scalars()
    )
    overdue_tasks = [task for task in open_tasks if task.due_at and task.due_at < now]
    due_today_tasks = [task for task in open_tasks if task.due_at and now <= task.due_at <= end_today]

    contacts = list(
        db.execute(
            select(Contact)
            .where(Contact.tenant_id == tenant_id)
            .order_by(Contact.next_step_due_at.asc().nulls_last(), Contact.priority.desc(), Contact.created_at.desc())
        ).scalars()
    )
    follow_ups = []
    stale_cutoff = now - timedelta(days=45)
    latest_contact_events = _latest_contact_event_map(db, tenant_id)
    for contact in contacts:
        if contact.next_step_due_at and contact.next_step_due_at <= end_today:
            follow_ups.append(contact)
            continue
        if contact.last_contact_at and contact.last_contact_at <= stale_cutoff and contact.stage not in {"closed", "archive"}:
            follow_ups.append(contact)

    reengage = []
    coming_up = []
    reengage_cutoff = now - timedelta(days=60)
    reengage_window_end = now + timedelta(days=14)
    for contact in contacts:
        if contact.stage in {"closed", "archive"}:
            continue

        last_event_at = latest_contact_events.get(contact.id) or contact.last_contact_at or contact.created_at
        stale_days = max((now - last_event_at).days, 0)
        birthday_at = _next_annual_occurrence(contact.birthday, now)
        anniversary_at = _next_annual_occurrence(contact.home_anniversary, now)
        if birthday_at and birthday_at <= reengage_window_end:
            coming_up.append(
                {
                    "id": contact.id,
                    "name": contact.name,
                    "stage": contact.stage,
                    "priority": contact.priority,
                    "preferred_channel": contact.preferred_channel,
                    "last_event_at": last_event_at,
                    "occasion": "birthday",
                    "occasion_date": birthday_at,
                    "detail": f"Birthday in {(birthday_at.date() - now.date()).days} days.",
                }
            )
        if anniversary_at and anniversary_at <= reengage_window_end:
            coming_up.append(
                {
                    "id": contact.id,
                    "name": contact.name,
                    "stage": contact.stage,
                    "priority": contact.priority,
                    "preferred_channel": contact.preferred_channel,
                    "last_event_at": last_event_at,
                    "occasion": "home_anniversary",
                    "occasion_date": anniversary_at,
                    "detail": f"Home anniversary in {(anniversary_at.date() - now.date()).days} days.",
                }
            )

        if last_event_at <= reengage_cutoff:
            reengage.append(
                {
                    "id": contact.id,
                    "name": contact.name,
                    "stage": contact.stage,
                    "priority": contact.priority,
                    "preferred_channel": contact.preferred_channel,
                    "last_event_at": last_event_at,
                    "trigger": "inactive",
                    "trigger_date": None,
                    "detail": f"No logged activity in {stale_days} days.",
                    "_sort": last_event_at,
                }
            )

    deals = list(
        db.execute(
            select(Deal).where(Deal.tenant_id == tenant_id).order_by(Deal.updated_at.desc())
        ).scalars()
    )
    active_deals = [deal for deal in deals if deal.status != "closed" and deal.stage in ACTIVE_DEAL_STAGES]
    deals_at_risk_rows = []
    coach_alerts = []
    for deal in active_deals:
        overdue_count = db.execute(
            select(func.count(Task.id)).where(
                Task.deal_id == deal.id,
                Task.status != "completed",
                Task.due_at.is_not(None),
                Task.due_at < now,
            )
        ).scalar_one()
        milestone_risk = bool(deal.next_milestone_at and deal.next_milestone_at <= now + timedelta(days=2))
        if deal.stage in RISK_STAGES and (milestone_risk or overdue_count):
            deals_at_risk_rows.append(deal)
            coach_alerts.append(_deal_risk_alert(deal, overdue_count=int(overdue_count or 0)))
        if deal.stage in {"listing_prep", "active_listing"}:
            stale_days = max((now - deal.updated_at).days, 0)
            if overdue_count > 0 or stale_days >= 14:
                coach_alerts.append(
                    _listing_attention_alert(deal, overdue_count=int(overdue_count or 0), stale_days=stale_days)
                )

    for contact in follow_ups:
        stage = (contact.stage or "").lower()
        if "buyer" in stage and contact.next_step_due_at and contact.next_step_due_at <= now + timedelta(days=2):
            coach_alerts.append(
                {
                    "id": f"buyer-{contact.id}",
                    "title": "Buyer follow-up is getting hot",
                    "detail": (
                        f"{contact.name} is in {contact.stage.replace('_', ' ')} and the next step is due "
                        f"{_format_due_at(contact.next_step_due_at)}."
                    ),
                    "href": f"/contacts/{contact.id}",
                    "cta_label": "Open contact",
                    "tone": "danger" if contact.priority == "high" else "warn",
                    "_sort": (1, contact.next_step_due_at or datetime.max.replace(tzinfo=UTC)),
                }
            )
            break

    if reengage:
        top_reengage = sorted(
            reengage,
            key=lambda item: (
                0 if item["priority"] == "high" else 1,
                item["_sort"] or datetime.max.replace(tzinfo=UTC),
            ),
        )[0]
        coach_alerts.append(
            {
                "id": f"reengage-{top_reengage['id']}",
                "title": "Sphere touchpoint is overdue",
                "detail": f"{top_reengage['name']} has gone quiet. {top_reengage['detail']}",
                "href": f"/contacts/{top_reengage['id']}",
                "cta_label": "Restart conversation",
                "tone": "default",
                "_sort": (2, top_reengage["_sort"] or datetime.max.replace(tzinfo=UTC)),
            }
        )

    pipeline_counts = dict(
        db.execute(
            select(Deal.stage, func.count(Deal.id))
            .where(Deal.tenant_id == tenant_id, Deal.status != "closed")
            .group_by(Deal.stage)
        ).all()
    )

    return {
        "summary": {
            "open_tasks": len(open_tasks),
            "overdue_tasks": len(overdue_tasks),
            "due_today": len(due_today_tasks),
            "active_deals": len(active_deals),
            "deals_at_risk": len(deals_at_risk_rows),
            "follow_ups_due": len(follow_ups),
        },
        "coach_alerts": [
            {key: value for key, value in item.items() if key != "_sort"}
            for item in sorted(coach_alerts, key=lambda item: item["_sort"])[:3]
        ],
        "urgent_tasks": [serialize_task(db, task) for task in overdue_tasks[:8]],
        "due_today_tasks": [serialize_task(db, task) for task in due_today_tasks[:8]],
        "follow_ups": [
            {
                "id": contact.id,
                "name": contact.name,
                "stage": contact.stage,
                "priority": contact.priority,
                "next_step_due_at": contact.next_step_due_at,
                "next_step_note": contact.next_step_note,
                "last_contact_at": contact.last_contact_at,
                "preferred_channel": contact.preferred_channel,
            }
            for contact in follow_ups[:8]
        ],
        "reengage": [
            {key: value for key, value in item.items() if key != "_sort"}
            for item in sorted(
                reengage,
                key=lambda item: (
                    0 if item["trigger"] in {"birthday", "home_anniversary"} else 1,
                    item["_sort"] or datetime.max.replace(tzinfo=UTC),
                ),
            )[:8]
        ],
        "coming_up": sorted(coming_up, key=lambda item: item["occasion_date"])[:8],
        "deals_at_risk": [serialize_deal(db, deal) for deal in deals_at_risk_rows[:8]],
        "pipeline": [
            {"stage": stage, "count": int(count)}
            for stage, count in sorted(pipeline_counts.items(), key=lambda item: (-item[1], item[0]))
        ],
    }


def capture_opportunity(db: Session, tenant_id: UUID, actor_user_id: UUID | None, parcel_id: UUID) -> dict:
    parcel = db.execute(select(Parcel).where(Parcel.tenant_id == tenant_id, Parcel.id == parcel_id)).scalar_one_or_none()
    if parcel is None:
        raise ValueError("Parcel not found")

    title = f"Seller opportunity - {parcel.address}"
    deal = Deal(
        tenant_id=tenant_id,
        title=title,
        deal_type="seller",
        stage="new_lead",
        priority="high",
        status="open",
        parcel_id=parcel.id,
        primary_agent_user_id=actor_user_id,
        next_milestone_at=_utcnow() + timedelta(days=2),
        notes="Captured from public-data opportunity workflow.",
        updated_at=_utcnow(),
    )
    db.add(deal)
    db.flush()

    task = Task(
        tenant_id=tenant_id,
        title=f"Call owner for {parcel.address}",
        description="Research owner, confirm contact path, and make first outreach attempt.",
        status="open",
        priority="high",
        due_at=_utcnow() + timedelta(days=1),
        parcel_id=parcel.id,
        deal_id=deal.id,
        assigned_user_id=actor_user_id,
        created_by_user_id=actor_user_id,
    )
    db.add(task)
    db.flush()

    record_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type="deal",
        entity_id=str(deal.id),
        event_type="captured_from_opportunity",
        metadata={"parcel_id": str(parcel.id), "parcel_address": parcel.address},
    )
    record_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type="task",
        entity_id=str(task.id),
        event_type="task_created",
        metadata={"deal_id": str(deal.id), "parcel_id": str(parcel.id)},
    )
    db.commit()

    return {
        "deal_id": deal.id,
        "task_id": task.id,
        "deal_title": deal.title,
        "task_title": task.title,
    }
