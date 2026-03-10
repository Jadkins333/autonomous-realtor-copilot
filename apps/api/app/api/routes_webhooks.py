from fastapi import APIRouter, Depends, Form, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Tenant
from app.services.outreach import (
    handle_inbound_sms,
    handle_postmark_bounce_callback,
    handle_postmark_delivery_callback,
    handle_twilio_status_callback,
)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/twilio/inbound")
def twilio_inbound(
    request: Request,
    From: str = Form(default=""),
    Body: str = Form(default=""),
    MessageSid: str = Form(default=""),
    db: Session = Depends(get_db),
) -> dict:
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
def twilio_status(
    MessageSid: str = Form(default=""),
    MessageStatus: str = Form(default=""),
    ErrorCode: str = Form(default=""),
    ErrorMessage: str = Form(default=""),
    db: Session = Depends(get_db),
) -> dict:
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


@router.post("/postmark/delivery")
def postmark_delivery(payload: dict, db: Session = Depends(get_db)) -> dict:
    return {"ok": True, **handle_postmark_delivery_callback(db, payload)}


@router.post("/postmark/bounce")
def postmark_bounce(payload: dict, db: Session = Depends(get_db)) -> dict:
    return {"ok": True, **handle_postmark_bounce_callback(db, payload)}
