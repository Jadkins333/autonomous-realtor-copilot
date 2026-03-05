from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import ConsentEvent, Contact, Conversation, Message, SuppressionList
from app.models.enums import Channel, ConsentStatus, MessageDirection, MessageStatus
from app.services.compliance import enforce_outbound_policy, stop_enrollments_on_reply
from app.services.providers import get_email_provider, get_sms_provider

settings = get_settings()


def list_drafts(db: Session, tenant_id: UUID) -> list[Message]:
    return list(
        db.execute(
            select(Message)
            .where(
                Message.tenant_id == tenant_id,
                Message.direction == MessageDirection.outbound,
                Message.status == MessageStatus.draft,
            )
            .order_by(Message.created_at.desc())
        ).scalars()
    )


async def approve_and_send(db: Session, tenant_id: UUID, message_id: UUID) -> dict:
    message = db.execute(
        select(Message).where(Message.id == message_id, Message.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if not message:
        raise ValueError("Message not found")
    if message.status != MessageStatus.draft:
        raise ValueError("Message is not draft")

    allowed, reason = enforce_outbound_policy(db, message)
    if not allowed:
        message.status = MessageStatus.blocked
        message.meta_json = {**message.meta_json, "blocked_reason": reason}
        db.commit()
        return {"status": "blocked", "reason": reason}

    contact = db.execute(
        select(Contact).where(Contact.id == message.contact_id, Contact.tenant_id == tenant_id)
    ).scalar_one()

    if settings.sandbox_mode:
        message.status = MessageStatus.queued
        message.meta_json = {**message.meta_json, "sandbox_staged": True}
        db.commit()
        return {"status": "queued", "sandbox": True}

    if message.channel == Channel.email:
        provider = get_email_provider()
        if not contact.email:
            message.status = MessageStatus.failed
            message.meta_json = {**message.meta_json, "error": "Contact has no email"}
            db.commit()
            return {"status": "failed", "reason": "Contact has no email"}
        if not settings.sandbox_mode and getattr(provider, "name", "") == "console_email":
            message.meta_json = {
                **message.meta_json,
                "provider_fallback_reason": "Missing Postmark credentials; using console provider",
            }
        result = await provider.send(contact.email, message.subject or "", message.body)
    elif message.channel == Channel.sms:
        provider = get_sms_provider()
        if not contact.phone:
            message.status = MessageStatus.failed
            message.meta_json = {**message.meta_json, "error": "Contact has no phone"}
            db.commit()
            return {"status": "failed", "reason": "Contact has no phone"}
        if not settings.sandbox_mode and getattr(provider, "name", "") == "console_sms":
            message.meta_json = {
                **message.meta_json,
                "provider_fallback_reason": "Missing Twilio credentials; using console provider",
            }
        result = await provider.send(contact.phone, message.body)
    else:
        message.status = MessageStatus.queued
        message.meta_json = {**message.meta_json, "voice_provider": "not_implemented", "sandbox_staged": True}
        db.commit()
        return {"status": "queued", "sandbox": True}

    if result.ok:
        message.status = MessageStatus.sent
        message.sent_at = datetime.now(tz=UTC)
        message.provider_message_id = result.provider_message_id
    else:
        message.status = MessageStatus.failed
        message.meta_json = {**message.meta_json, "provider_error": result.error}

    convo = db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.contact_id == message.contact_id,
        )
    ).scalar_one_or_none()
    if not convo:
        convo = Conversation(tenant_id=tenant_id, contact_id=message.contact_id)
        db.add(convo)
    convo.last_outbound_at = datetime.now(tz=UTC)

    db.commit()
    return {"status": message.status.value, "provider_message_id": message.provider_message_id}


def handle_inbound_sms(
    db: Session,
    tenant_id: UUID,
    from_phone: str,
    body: str,
    provider_message_id: str | None,
    ip_address: str | None,
    user_agent: str | None,
) -> dict:
    contact = db.execute(
        select(Contact).where(Contact.tenant_id == tenant_id, Contact.phone == from_phone)
    ).scalar_one_or_none()
    if not contact:
        contact = Contact(tenant_id=tenant_id, name=from_phone, phone=from_phone, tags_json=["inbound_unknown"])
        db.add(contact)
        db.flush()

    inbound = Message(
        tenant_id=tenant_id,
        contact_id=contact.id,
        channel=Channel.sms,
        direction=MessageDirection.inbound,
        status=MessageStatus.delivered,
        body=body,
        subject=None,
        provider_message_id=provider_message_id,
        meta_json={},
    )
    db.add(inbound)

    convo = db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.contact_id == contact.id,
        )
    ).scalar_one_or_none()
    if not convo:
        convo = Conversation(tenant_id=tenant_id, contact_id=contact.id)
        db.add(convo)
    convo.last_inbound_at = datetime.now(tz=UTC)

    stop_keyword = body.strip().upper()
    stop_triggered = stop_keyword in {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"}
    if stop_triggered:
        # Compliance policy docs: /docs/compliance/tcpa.md
        # Product default is immediate suppression with auditable timestamps.
        db.add(
            ConsentEvent(
                tenant_id=tenant_id,
                contact_id=contact.id,
                channel=Channel.sms,
                status=ConsentStatus.opt_out,
                consent_text=body,
                source="twilio_inbound",
                ip_address=ip_address,
                user_agent=user_agent,
            )
        )

        existing = db.execute(
            select(SuppressionList).where(
                SuppressionList.tenant_id == tenant_id,
                SuppressionList.contact_id == contact.id,
                SuppressionList.channel == Channel.sms,
            )
        ).scalar_one_or_none()
        if not existing:
            db.add(
                SuppressionList(
                    tenant_id=tenant_id,
                    contact_id=contact.id,
                    channel=Channel.sms,
                    reason="STOP inbound keyword",
                )
            )

        # Optional policy toggle: cross-channel revocation behavior can be enabled per deployment.
        if settings.enforce_global_revocation:
            for channel in (Channel.email, Channel.voice):
                channel_suppression = db.execute(
                    select(SuppressionList).where(
                        SuppressionList.tenant_id == tenant_id,
                        SuppressionList.contact_id == contact.id,
                        SuppressionList.channel == channel,
                    )
                ).scalar_one_or_none()
                if not channel_suppression:
                    db.add(
                        SuppressionList(
                            tenant_id=tenant_id,
                            contact_id=contact.id,
                            channel=channel,
                            reason="Global revocation policy enabled",
                        )
                    )

    stopped = stop_enrollments_on_reply(db, tenant_id, contact.id)
    db.commit()

    return {
        "contact_id": str(contact.id),
        "message_id": str(inbound.id),
        "stop_triggered": stop_triggered,
        "global_revocation_applied": bool(stop_triggered and settings.enforce_global_revocation),
        "enrollments_stopped": stopped,
    }
