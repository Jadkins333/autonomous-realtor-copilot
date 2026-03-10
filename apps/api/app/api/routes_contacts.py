from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.models.entities import Contact, Message, Sequence, SequenceEnrollment
from app.schemas.contacts import ContactCreate, ContactOut, ContactUpdate
from app.schemas.copilot import ContactSummaryResponse
from app.schemas.sequences import ContactEnrollmentOut, ContactMessageOut
from app.services.llm.provider import get_llm_provider
from app.services.llm_features.contact_summarizer import summarise_contact

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


@router.get(
    "/{contact_id}/summary",
    response_model=ContactSummaryResponse,
    summary="AI-assisted pre-call contact brief",
    description=(
        "Generate an AI-assisted summary of a contact's profile, message history, "
        "and sequence enrollments. Use before calling or messaging a lead. "
        "Returns unavailable=True (not an error) when LLM is offline — "
        "all other contact data continues to work normally."
    ),
)
def contact_summary(
    contact_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ContactSummaryResponse:
    provider = get_llm_provider()
    if provider is None:
        return ContactSummaryResponse(
            summary_bullets=["AI assistant is currently unavailable. Enable LLM_ENABLED=true to use this feature."],
            raw_summary="",
            ai_generated=False,
            provider_label=None,
            unavailable=True,
        )

    result = summarise_contact(provider, db, auth.tenant_id, contact_id)
    if result is None:
        # Could be contact not found or LLM error
        contact = db.execute(
            select(Contact).where(Contact.id == contact_id, Contact.tenant_id == auth.tenant_id)
        ).scalar_one_or_none()
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        return ContactSummaryResponse(
            summary_bullets=["AI summary is temporarily unavailable."],
            raw_summary="",
            ai_generated=False,
            provider_label=None,
            unavailable=True,
        )

    return ContactSummaryResponse(
        summary_bullets=result["summary_bullets"],
        raw_summary=result["raw_summary"],
        ai_generated=result["ai_generated"],
        provider_label=result.get("provider_label"),
        data_coverage=result.get("data_coverage", {}),
        unavailable=False,
    )
