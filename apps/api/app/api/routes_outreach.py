from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.schemas.outreach import (
    DraftActionOut,
    DraftMessageOut,
    DraftMessageUpdateIn,
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
    update_draft,
)

router = APIRouter(prefix="/outreach", tags=["outreach"])


@router.get("/drafts", response_model=list[DraftMessageOut])
def outreach_drafts(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[DraftMessageOut]:
    return list_drafts(db, auth.tenant_id, user_id=auth.user_id)


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
            ),
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
        return DraftPackSubmitOut.model_validate(
            submit_draft_pack(db, auth.tenant_id, pack_id, actor_user_id=auth.user_id)
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/draft-pack/{pack_id}", response_model=DraftPackOut)
def outreach_get_draft_pack(
    pack_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DraftPackOut:
    try:
        return DraftPackOut.model_validate(get_draft_pack(db, auth.tenant_id, pack_id, user_id=auth.user_id))
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
            list_draft_packs(db, auth.tenant_id, user_id=auth.user_id, status=status, cursor=cursor, limit=limit)
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
        result = await approve_and_send(db, auth.tenant_id, message_id, actor_user_id=auth.user_id)
        return DraftActionOut(
            id=message_id,
            pack_id=result.get("pack_id"),
            status=str(result.get("status")),
            approval_state="approved",
            pack_status=result.get("pack_status"),
            reason=result.get("reason"),
            reason_codes=result.get("reason_codes") or [],
            explanations=result.get("explanations") or [],
            policy_snapshot=result.get("policy_snapshot"),
            disclosure_status=result.get("disclosure_status"),
            send_attempt_id=result.get("send_attempt_id"),
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
        return DraftActionOut.model_validate(reject_draft(db, auth.tenant_id, message_id, actor_user_id=auth.user_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{message_id}/approve_and_send")
async def outreach_approve(
    message_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return await approve_and_send(db, auth.tenant_id, message_id, actor_user_id=auth.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/drafts/{message_id}", response_model=DraftMessageOut)
def outreach_update_draft(
    message_id: UUID,
    payload: DraftMessageUpdateIn,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DraftMessageOut:
    try:
        return DraftMessageOut.model_validate(update_draft(db, auth.tenant_id, message_id, payload, user_id=auth.user_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/draft-pack/{pack_id}/approve-bulk-async")
def outreach_approve_pack_async(
    pack_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    from app.models.entities import Message
    from app.workers.tasks import async_approve_and_send_task
    
    # Send all drafts inside this pack to the queue asynchronously
    drafts = db.query(Message).filter(Message.pack_id == pack_id, Message.status == "pending_approval").all()
    count = 0
    for draft in drafts:
        async_approve_and_send_task.delay(
            str(auth.tenant_id),
            str(draft.id),
            str(auth.user_id) if auth.user_id else None
        )
        count += 1
        
    return {"status": "enqueued", "drafts_submitted_to_celery": count}
