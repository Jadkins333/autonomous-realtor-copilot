from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.models.entities import Contact, Message, OutreachDraftPack, Parcel
from app.schemas.copilot import OutreachRewriteRequest, OutreachRewriteResponse
from app.schemas.outreach import (
    DraftActionOut,
    DraftMessageOut,
    DraftPackCreateIn,
    DraftPackOut,
    DraftPacksListOut,
    DraftPackSubmitOut,
)
from app.services.llm.provider import get_llm_provider
from app.services.llm_features.outreach_drafter import generate_outreach_draft
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
            approval_state=str(result.get("approval_state") or "approved"),
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


@router.post(
    "/drafts/{message_id}/rewrite",
    response_model=OutreachRewriteResponse,
    summary="AI-assisted outreach rewrite",
    description=(
        "Use the LLM to propose a rewritten version of an existing draft. "
        "The result is NOT saved automatically — the agent must review and apply it manually. "
        "Compliance is always checked after generation. "
        "Returns 503 if no LLM provider is available."
    ),
)
def outreach_rewrite_draft(
    message_id: UUID,
    payload: OutreachRewriteRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> OutreachRewriteResponse:
    # Load the message and its associated context
    message = db.execute(
        select(Message).where(Message.id == message_id, Message.tenant_id == auth.tenant_id)
    ).scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Load contact for context
    contact = db.execute(
        select(Contact).where(Contact.id == message.contact_id, Contact.tenant_id == auth.tenant_id)
    ).scalar_one_or_none()

    # Load parcel if linked via pack
    parcel_address: str | None = None
    if message.pack_id:
        pack = db.execute(
            select(OutreachDraftPack).where(OutreachDraftPack.id == message.pack_id)
        ).scalar_one_or_none()
        if pack and pack.parcel_id:
            parcel = db.execute(
                select(Parcel).where(Parcel.id == pack.parcel_id, Parcel.tenant_id == auth.tenant_id)
            ).scalar_one_or_none()
            if parcel:
                parcel_address = parcel.address

    channel = getattr(message.channel, "value", str(message.channel))
    if channel == "voice":
        raise HTTPException(status_code=400, detail="Voice outreach is not supported in this build.")

    provider = get_llm_provider()
    if provider is None:
        raise HTTPException(
            status_code=503,
            detail="LLM provider not available. Set LLM_ENABLED=true and configure a local provider.",
        )

    try:
        result = generate_outreach_draft(
            provider,
            contact_name=contact.name if contact else "the recipient",
            contact_email=contact.email if contact else None,
            contact_phone=contact.phone if contact else None,
            channel=channel,
            objective=message.subject or message.body[:100],
            tone=payload.tone,
            parcel_address=parcel_address,
            existing_body=message.body,
            rewrite_notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result is None:
        raise HTTPException(
            status_code=503,
            detail="LLM provider became unavailable during rewrite.",
        )

    return OutreachRewriteResponse(
        proposed_subject=result.get("subject"),
        proposed_body=result["body"],
        compliance_flags=result.get("compliance_flags", []),
        ai_generated=True,
        provider_label=result.get("provider_label"),
    )
