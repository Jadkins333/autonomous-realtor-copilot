from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.schemas.outreach import DraftMessageOut
from app.services.outreach import approve_and_send, list_drafts

router = APIRouter(prefix="/outreach", tags=["outreach"])


@router.get("/drafts", response_model=list[DraftMessageOut])
def outreach_drafts(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[DraftMessageOut]:
    return list_drafts(db, auth.tenant_id)


@router.post("/{message_id}/approve_and_send")
async def outreach_approve(
    message_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return await approve_and_send(db, auth.tenant_id, message_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
