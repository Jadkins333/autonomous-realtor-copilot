from fastapi import APIRouter, Depends, Form, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Tenant
from app.services.outreach import handle_inbound_sms

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
