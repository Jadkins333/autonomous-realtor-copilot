from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.models.entities import Contact, Message, Sequence, SequenceEnrollment
from app.schemas.contacts import ContactCreate, ContactOut, ContactUpdate
from app.schemas.sequences import ContactEnrollmentOut, ContactMessageOut

router = APIRouter(prefix="/contacts", tags=["contacts"])


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
    contact_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ContactOut:
    contact = db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == auth.tenant_id)
    ).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.get("/{contact_id}/messages", response_model=list[ContactMessageOut])
def contact_messages(
    contact_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[ContactMessageOut]:
    # Verify contact belongs to tenant
    contact = db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == auth.tenant_id)
    ).scalar_one_or_none()
    if not contact:
        return []

    messages = list(
        db.execute(
            select(Message)
            .where(Message.contact_id == contact_id, Message.tenant_id == auth.tenant_id)
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
    contact_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[ContactEnrollmentOut]:
    # Verify contact belongs to tenant
    contact = db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == auth.tenant_id)
    ).scalar_one_or_none()
    if not contact:
        return []

    rows = db.execute(
        select(SequenceEnrollment, Sequence)
        .join(Sequence, Sequence.id == SequenceEnrollment.sequence_id)
        .where(
            SequenceEnrollment.contact_id == contact_id,
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


@router.put("/{contact_id}", response_model=ContactOut)
def update_contact(
    contact_id: UUID,
    payload: ContactUpdate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ContactOut:
    contact = db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == auth.tenant_id)
    ).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(contact, key, value)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/{contact_id}")
def delete_contact(
    contact_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    contact = db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == auth.tenant_id)
    ).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
    return {"ok": True}
