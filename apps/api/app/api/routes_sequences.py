from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.models.entities import Contact, Sequence, SequenceEnrollment
from app.schemas.sequences import EnrollmentOut
from app.services.sequences import enroll_contact_in_sequence, list_sequences

router = APIRouter(prefix="/sequences", tags=["sequences"])


@router.get("")
def sequences(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[dict]:
    return list_sequences(db, auth.tenant_id)


@router.get("/{sequence_id}/enrollments", response_model=list[EnrollmentOut])
def sequence_enrollments(
    sequence_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[EnrollmentOut]:
    # Verify sequence belongs to tenant (return empty rather than 404 to avoid leaking existence)
    seq = db.execute(
        select(Sequence).where(Sequence.id == sequence_id, Sequence.tenant_id == auth.tenant_id)
    ).scalar_one_or_none()
    if not seq:
        return []

    rows = db.execute(
        select(SequenceEnrollment, Contact)
        .join(Contact, Contact.id == SequenceEnrollment.contact_id)
        .where(
            SequenceEnrollment.sequence_id == sequence_id,
            SequenceEnrollment.tenant_id == auth.tenant_id,
        )
        .order_by(SequenceEnrollment.enrolled_at.desc())
    ).all()

    return [
        EnrollmentOut(
            id=enrollment.id,
            contact_id=enrollment.contact_id,
            contact_name=contact.name,
            contact_email=contact.email,
            state=enrollment.state.value,
            enrolled_at=enrollment.enrolled_at,
            next_step_at=enrollment.next_step_at,
        )
        for enrollment, contact in rows
    ]


@router.post("/{sequence_id}/enroll/{contact_id}")
def enroll(
    sequence_id: UUID,
    contact_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return enroll_contact_in_sequence(db, auth.tenant_id, sequence_id, contact_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
