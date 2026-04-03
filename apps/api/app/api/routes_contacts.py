from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.models.entities import (
    Contact,
    ContactEvent,
    Deal,
    Message,
    Sequence,
    SequenceEnrollment,
    Task,
)
from app.schemas.contacts import (
    ContactCreate,
    ContactDealOut,
    ContactEventCreate,
    ContactEventOut,
    ContactOut,
    ContactTaskOut,
    ContactUpdate,
)
from app.schemas.sequences import ContactEnrollmentOut, ContactMessageOut
from app.services.contact_events import log_contact_event, serialize_contact_event
from app.services.workspace import serialize_deal, serialize_task

router = APIRouter(prefix="/contacts", tags=["contacts"])
ALLOWED_CONTACT_EVENT_TYPES = {"call", "note", "outreach", "task_complete", "deal_milestone"}

CONTACT_FIELD_LABELS = {
    "name": "name",
    "email": "email",
    "phone": "phone",
    "timezone": "timezone",
    "tags_json": "tags",
    "notes": "notes",
    "stage": "stage",
    "lead_source": "lead source",
    "household_name": "household",
    "birthday": "birthday",
    "home_anniversary": "home anniversary",
    "referral_source": "referral source",
    "preferred_channel": "preferred channel",
    "client_summary": "relationship summary",
    "assigned_user_id": "assigned user",
    "last_contact_at": "last contact",
    "next_step_due_at": "next step due date",
    "next_step_note": "next step",
    "priority": "priority",
}


def _get_contact(db: Session, tenant_id: UUID, contact_id: UUID) -> Contact | None:
    return db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant_id)
    ).scalar_one_or_none()


def _resolve_contact(db: Session, tenant_id: UUID, contact_identifier: str) -> Contact | None:
    try:
        return _get_contact(db, tenant_id, UUID(contact_identifier))
    except ValueError:
        pass

    if contact_identifier.isdigit():
        index = int(contact_identifier)
        if index < 1:
            return None
        return db.execute(
            select(Contact)
            .where(Contact.tenant_id == tenant_id)
            .order_by(Contact.created_at.asc())
            .offset(index - 1)
            .limit(1)
        ).scalar_one_or_none()

    return None


def _list_contact_events(db: Session, tenant_id: UUID, contact_id: UUID) -> list[ContactEventOut]:
    rows = list(
        db.execute(
            select(ContactEvent)
            .where(ContactEvent.tenant_id == tenant_id, ContactEvent.contact_id == contact_id)
            .order_by(ContactEvent.created_at.asc())
        ).scalars()
    )
    return [ContactEventOut.model_validate(serialize_contact_event(db, row)) for row in rows]


def _contact_update_summary(contact: Contact, changes: dict) -> str | None:
    details: list[str] = []
    for key, after in changes.items():
        before = getattr(contact, key)
        if before == after:
            continue

        label = CONTACT_FIELD_LABELS.get(key, key.replace("_", " "))
        if key == "stage":
            details.append(f"stage {before or 'unset'} -> {after or 'unset'}")
        elif key == "priority":
            details.append(f"priority {before or 'unset'} -> {after or 'unset'}")
        elif key == "next_step_note":
            details.append(f"next step set to {after or 'cleared'}")
        elif key == "next_step_due_at":
            details.append("next step due date updated")
        elif key == "preferred_channel":
            details.append(f"preferred channel {before or 'unset'} -> {after or 'unset'}")
        else:
            details.append(label)

    if not details:
        return None
    return "Contact profile updated: " + "; ".join(details[:6]) + "."


@router.get("", response_model=list[ContactOut])
def list_contacts(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[ContactOut]:
    return list(
        db.execute(select(Contact).where(Contact.tenant_id == auth.tenant_id).order_by(Contact.created_at.desc())).scalars()
    )


@router.post("", response_model=ContactOut)
def create_contact(
    payload: ContactCreate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ContactOut:
    contact = Contact(tenant_id=auth.tenant_id, **payload.model_dump())
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.get("/{contact_id}", response_model=ContactOut)
def get_contact(
    contact_id: str,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ContactOut:
    contact = _resolve_contact(db, auth.tenant_id, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.get("/{contact_id}/messages", response_model=list[ContactMessageOut])
def contact_messages(
    contact_id: str,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[ContactMessageOut]:
    # Verify contact belongs to tenant
    contact = _resolve_contact(db, auth.tenant_id, contact_id)
    if not contact:
        return []

    messages = list(
        db.execute(
            select(Message)
            .where(Message.contact_id == contact.id, Message.tenant_id == auth.tenant_id)
            .order_by(Message.created_at.desc())
            .limit(50)
        ).scalars()
    )

    return [
        ContactMessageOut(
            id=msg.id,
            channel=msg.channel.value,
            direction=msg.direction.value,
            status=msg.status.value,
            subject=msg.subject,
            body_preview=msg.body[:120],
            created_at=msg.created_at,
            sent_at=msg.sent_at,
        )
        for msg in messages
    ]


@router.get("/{contact_id}/enrollments", response_model=list[ContactEnrollmentOut])
def contact_enrollments(
    contact_id: str,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[ContactEnrollmentOut]:
    # Verify contact belongs to tenant
    contact = _resolve_contact(db, auth.tenant_id, contact_id)
    if not contact:
        return []

    rows = db.execute(
        select(SequenceEnrollment, Sequence)
        .join(Sequence, Sequence.id == SequenceEnrollment.sequence_id)
        .where(
            SequenceEnrollment.contact_id == contact.id,
            SequenceEnrollment.tenant_id == auth.tenant_id,
        )
        .order_by(SequenceEnrollment.enrolled_at.desc())
    ).all()

    return [
        ContactEnrollmentOut(
            id=enrollment.id,
            sequence_id=enrollment.sequence_id,
            sequence_name=sequence.name,
            state=enrollment.state.value,
            enrolled_at=enrollment.enrolled_at,
            next_step_at=enrollment.next_step_at,
        )
        for enrollment, sequence in rows
    ]


@router.get("/{contact_id}/deals", response_model=list[ContactDealOut])
def contact_deals(
    contact_id: str,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[ContactDealOut]:
    contact = _resolve_contact(db, auth.tenant_id, contact_id)
    if not contact:
        return []

    deals = list(
        db.execute(
            select(Deal)
            .where(Deal.contact_id == contact.id, Deal.tenant_id == auth.tenant_id)
            .order_by(Deal.updated_at.desc())
        ).scalars()
    )
    return [ContactDealOut.model_validate(serialize_deal(db, deal)) for deal in deals]


@router.get("/{contact_id}/tasks", response_model=list[ContactTaskOut])
def contact_tasks(
    contact_id: str,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[ContactTaskOut]:
    contact = _resolve_contact(db, auth.tenant_id, contact_id)
    if not contact:
        return []

    tasks = list(
        db.execute(
            select(Task)
            .where(Task.contact_id == contact.id, Task.tenant_id == auth.tenant_id)
            .order_by(Task.due_at.asc().nulls_last(), Task.created_at.desc())
        ).scalars()
    )
    return [ContactTaskOut.model_validate(serialize_task(db, task)) for task in tasks]


@router.get("/{contact_id}/events", response_model=list[ContactEventOut])
def contact_events(
    contact_id: str,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[ContactEventOut]:
    contact = _resolve_contact(db, auth.tenant_id, contact_id)
    if not contact:
        return []
    return _list_contact_events(db, auth.tenant_id, contact.id)


@router.get("/{contact_id}/activity", response_model=list[ContactEventOut])
def contact_activity(
    contact_id: str,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[ContactEventOut]:
    contact = _resolve_contact(db, auth.tenant_id, contact_id)
    if not contact:
        return []
    return _list_contact_events(db, auth.tenant_id, contact.id)


@router.post("/{contact_id}/events", response_model=ContactEventOut, status_code=status.HTTP_201_CREATED)
def create_contact_event(
    contact_id: str,
    payload: ContactEventCreate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ContactEventOut:
    contact = _resolve_contact(db, auth.tenant_id, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Event body is required")
    if payload.event_type not in ALLOWED_CONTACT_EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported event type")

    if payload.deal_id is not None:
        deal = db.execute(
            select(Deal).where(
                Deal.id == payload.deal_id,
                Deal.tenant_id == auth.tenant_id,
            )
        ).scalar_one_or_none()
        if deal is None:
            raise HTTPException(status_code=404, detail="Deal not found")
    event = log_contact_event(
        db,
        tenant_id=auth.tenant_id,
        contact_id=contact.id,
        deal_id=payload.deal_id,
        event_type=payload.event_type,
        body=payload.body.strip(),
        touch_last_contact=payload.event_type in {"call", "note", "outreach"},
    )
    db.commit()
    db.refresh(event)
    return ContactEventOut.model_validate(serialize_contact_event(db, event))


@router.put("/{contact_id}", response_model=ContactOut)
def update_contact(
    contact_id: str,
    payload: ContactUpdate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ContactOut:
    contact = _resolve_contact(db, auth.tenant_id, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    changes = payload.model_dump(exclude_unset=True)
    summary = _contact_update_summary(contact, changes)
    for key, value in changes.items():
        setattr(contact, key, value)
    if summary:
        log_contact_event(
            db,
            tenant_id=auth.tenant_id,
            contact_id=contact.id,
            event_type="note",
            body=summary,
            touch_last_contact=False,
        )
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/{contact_id}")
def delete_contact(
    contact_id: str,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    contact = _resolve_contact(db, auth.tenant_id, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
    return {"ok": True}
