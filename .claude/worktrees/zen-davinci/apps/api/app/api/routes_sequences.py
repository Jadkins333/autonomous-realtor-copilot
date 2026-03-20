from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.services.sequences import enroll_contact_in_sequence, list_sequences

router = APIRouter(prefix="/sequences", tags=["sequences"])


@router.get("")
def sequences(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[dict]:
    return list_sequences(db, auth.tenant_id)


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
