from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.schemas.outreach import (
    DraftActionOut,
    DraftMessageOut,
    DraftPackCreateIn,
    DraftPackOut,
    DraftPacksListOut,
    DraftPackSubmitOut,
)
from app.services.outreach import (
    approve_and_send,
    create_draft_pack,
    get_draft_pack,
    list_draft_packs,
    list_drafts,
    reject_draft,
    submit_draft_pack,
)

router = APIRouter(prefix="/outreach", tags=["outreach"])


@router.get("/drafts", response_model=list[DraftMessageOut])
def outreach_drafts(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[DraftMessageOut]:
    return list_drafts(db, auth.tenant_id)


@router.post("/draft-pack", response_model=DraftPackOut)
def outreach_create_draft_pack(
    payload: DraftPackCreateIn,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DraftPackOut:
    try:
        return DraftPackOut.model_validate(
            create_draft_pack(
                db,
                tenant_id=auth.tenant_id,
                user_id=auth.user_id,
                contact_id=payload.contact_id,
                parcel_id=payload.parcel_id,
                objective=payload.objective,
                channels=payload.channels,
                sandbox=payload.sandbox,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/draft-pack/{pack_id}/submit", response_model=DraftPackSubmitOut)
def outreach_submit_draft_pack(
    pack_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DraftPackSubmitOut:
    try:
        return DraftPackSubmitOut.model_validate(submit_draft_pack(db, auth.tenant_id, pack_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/draft-pack/{pack_id}", response_model=DraftPackOut)
def outreach_get_draft_pack(
    pack_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DraftPackOut:
    try:
        return DraftPackOut.model_validate(get_draft_pack(db, auth.tenant_id, pack_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/draft-packs", response_model=DraftPacksListOut)
def outreach_list_draft_packs(
    status: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DraftPacksListOut:
    try:
        return DraftPacksListOut.model_validate(
            list_draft_packs(db, auth.tenant_id, status=status, cursor=cursor, limit=limit)
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/drafts/{message_id}/approve", response_model=DraftActionOut)
async def outreach_approve_draft(
    message_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DraftActionOut:
    try:
        result = await approve_and_send(db, auth.tenant_id, message_id)
        return DraftActionOut(
            id=message_id,
            pack_id=result.get("pack_id"),
            status=str(result.get("status")),
            approval_state="approved",
            pack_status=result.get("pack_status"),
            reason=result.get("reason"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/drafts/{message_id}/reject", response_model=DraftActionOut)
def outreach_reject_draft(
    message_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DraftActionOut:
    try:
        return DraftActionOut.model_validate(reject_draft(db, auth.tenant_id, message_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
