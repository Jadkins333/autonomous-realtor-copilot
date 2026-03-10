from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Tenant
from app.services.outreach import (
    handle_inbound_sms,
    handle_postmark_bounce_callback,
    handle_postmark_delivery_callback,
    handle_twilio_status_callback,
    handle_twilio_voice_status_callback,
    render_twilio_voice_twiml,
)
from app.services.webhook_auth import require_postmark_basic_auth, require_twilio_signature

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/twilio/inbound")
async def twilio_inbound(
    request: Request,
    From: str = Form(default=""),
    Body: str = Form(default=""),
    MessageSid: str = Form(default=""),
    db: Session = Depends(get_db),
) -> dict:
    form = await request.form()
    require_twilio_signature(
        request,
        {key: str(value) for key, value in form.items()},
    )
    tenant = db.execute(select(Tenant).order_by(Tenant.created_at.asc()).limit(1)).scalar_one()
    result = handle_inbound_sms(
        db,
        tenant.id,
        from_phone=From,
        body=Body,
        provider_message_id=MessageSid,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return {"ok": True, **result}


@router.post("/twilio/status")
async def twilio_status(
    request: Request,
    MessageSid: str = Form(default=""),
    MessageStatus: str = Form(default=""),
    ErrorCode: str = Form(default=""),
    ErrorMessage: str = Form(default=""),
    db: Session = Depends(get_db),
) -> dict:
    form = await request.form()
    require_twilio_signature(
        request,
        {key: str(value) for key, value in form.items()},
    )
    result = handle_twilio_status_callback(
        db,
        provider_message_id=MessageSid,
        provider_status=MessageStatus,
        error_code=ErrorCode or None,
        error_message=ErrorMessage or None,
        raw_payload={
            "MessageSid": MessageSid,
            "MessageStatus": MessageStatus,
            "ErrorCode": ErrorCode,
            "ErrorMessage": ErrorMessage,
        },
    )
    return {"ok": True, **result}


@router.post("/twilio/voice/status")
async def twilio_voice_status(
    request: Request,
    CallSid: str = Form(default=""),
    CallStatus: str = Form(default=""),
    ErrorCode: str = Form(default=""),
    ErrorMessage: str = Form(default=""),
    CallDuration: str = Form(default=""),
    AnsweredBy: str = Form(default=""),
    To: str = Form(default=""),
    From: str = Form(default=""),
    Direction: str = Form(default=""),
    db: Session = Depends(get_db),
) -> dict:
    form = await request.form()
    payload = {key: str(value) for key, value in form.items()}
    require_twilio_signature(request, payload)
    result = handle_twilio_voice_status_callback(
        db,
        provider_message_id=CallSid,
        provider_status=CallStatus,
        error_code=ErrorCode or None,
        error_message=ErrorMessage or None,
        raw_payload={
            "CallSid": CallSid,
            "CallStatus": CallStatus,
            "ErrorCode": ErrorCode,
            "ErrorMessage": ErrorMessage,
            "CallDuration": CallDuration,
            "AnsweredBy": AnsweredBy,
            "To": To,
            "From": From,
            "Direction": Direction,
        },
    )
    return {"ok": True, **result}


@router.post("/twilio/voice/twiml/{message_id}")
async def twilio_voice_twiml(
    message_id: UUID,
    request: Request,
    CallSid: str = Form(default=""),
    To: str = Form(default=""),
    From: str = Form(default=""),
    Direction: str = Form(default=""),
    db: Session = Depends(get_db),
) -> Response:
    form = await request.form()
    payload = {key: str(value) for key, value in form.items()}
    require_twilio_signature(request, payload)
    try:
        xml = render_twilio_voice_twiml(
            db,
            message_id=message_id,
            call_sid=CallSid or None,
            raw_payload={
                "CallSid": CallSid,
                "To": To,
                "From": From,
                "Direction": Direction,
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(content=xml, media_type="application/xml")


@router.post("/postmark/delivery")
def postmark_delivery(request: Request, payload: dict, db: Session = Depends(get_db)) -> dict:
    require_postmark_basic_auth(request)
    return {"ok": True, **handle_postmark_delivery_callback(db, payload)}


@router.post("/postmark/bounce")
def postmark_bounce(request: Request, payload: dict, db: Session = Depends(get_db)) -> dict:
    require_postmark_basic_auth(request)
    return {"ok": True, **handle_postmark_bounce_callback(db, payload)}
