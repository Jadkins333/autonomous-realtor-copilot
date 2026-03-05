from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import (
    ComplianceEvent,
    ConsentEvent,
    Contact,
    Conversation,
    Message,
    OutreachDraftPack,
    Parcel,
    SuppressionList,
)
from app.models.enums import Channel, ConsentStatus, MessageDirection, MessageStatus
from app.services.compliance import enforce_outbound_policy, stop_enrollments_on_reply
from app.services.providers import get_email_provider, get_sms_provider

settings = get_settings()
logger = logging.getLogger(__name__)

def _message_meta(message: Message, **updates):
    return {**(message.meta_json or {}), **updates}


def _safe_pack_status(db: Session, pack_id):
    if pack_id is None:
        return None
    try:
        return _refresh_pack_rollup_status(db, pack_id)
    except Exception as exc: # noqa: BLE001
        logger.warning(
            "outreach_pack_status_refresh_failed",
            extra={
             "pack_id": str(pack_id),
             "error": str(exc),
            },
        )
        return None


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


def _normalize_channel(value: str) -> Channel:
    cleaned = value.strip().lower()
    if cleaned == "sms":
        return Channel.sms
    if cleaned == "email":
        return Channel.email
    if cleaned == "voice":
        return Channel.voice
    raise ValueError(f"Unsupported channel '{value}'")


def _draft_templates(contact_name: str, objective: str, channel: Channel) -> tuple[str | None, str]:
    if channel == Channel.email:
        return (
            f"Columbus opportunity update for {contact_name}",
            (
                f"Hi {contact_name},\n\n"
                f"{objective}\n\n"
                "I can share the supporting public-data signals and provenance for your review."
            ),
        )
    if channel == Channel.sms:
        return (
            None,
            (
                f"Hi {contact_name}, {objective} "
                "Reply if you'd like the detailed Columbus data snapshot. Reply STOP to opt out."
            ),
        )
    return (
        None,
        (
            f"Voicemail outline for {contact_name}: "
            f"{objective}. Close with opt-out reminder and invite follow-up."
        ),
    )


def _draft_approval_state(message: Message) -> str:
    return str((message.meta_json or {}).get("approval_state") or "draft")


def _pack_status_from_drafts(pack: OutreachDraftPack, drafts: list[Message]) -> str:
    if not drafts:
        return "draft"

    approval_states = [_draft_approval_state(row) for row in drafts]
    if any(state == "rejected" for state in approval_states):
        return "rejected"

    if pack.status == "submitted":
        if all(state == "approved" for state in approval_states):
            return "approved"
        return "submitted"
    return pack.status


def _refresh_pack_rollup_status(db: Session, pack_id: UUID) -> str:
    pack = db.execute(select(OutreachDraftPack).where(OutreachDraftPack.id == pack_id)).scalar_one_or_none()
    if pack is None:
        return "draft"
    drafts = list(
        db.execute(select(Message).where(Message.pack_id == pack.id).order_by(Message.created_at.asc())).scalars()
    )
    pack.status = _pack_status_from_drafts(pack, drafts)
    return pack.status


def _pack_to_payload(db: Session, pack: OutreachDraftPack) -> dict:
    drafts = list(
        db.execute(
            select(Message)
            .where(
                Message.pack_id == pack.id,
                Message.direction == MessageDirection.outbound,
            )
            .order_by(Message.created_at.asc())
        ).scalars()
    )
    return {
        "id": pack.id,
        "created_at": pack.created_at,
        "created_by_user_id": pack.created_by_user_id,
        "parcel_id": pack.parcel_id,
        "contact_id": pack.contact_id,
        "status": pack.status,
        "sandbox": pack.sandbox,
        "objective": pack.objective,
        "drafts": drafts,
    }


def create_draft_pack(
    db: Session,
    *,
    tenant_id: UUID,
    user_id: UUID,
    contact_id: UUID,
    parcel_id: UUID | None,
    objective: str,
    channels: list[str],
    sandbox: bool = True,
) -> dict:
    contact = db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if contact is None:
        raise ValueError("Contact not found")

    if parcel_id is not None:
        parcel = db.execute(
            select(Parcel).where(Parcel.id == parcel_id, Parcel.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if parcel is None:
            raise ValueError("Parcel not found")

    normalized_channels: list[Channel] = []
    seen: set[str] = set()
    for raw in channels:
        channel = _normalize_channel(raw)
        if channel.value in seen:
            continue
        normalized_channels.append(channel)
        seen.add(channel.value)
    if not normalized_channels:
        raise ValueError("At least one valid channel is required")

    pack = OutreachDraftPack(
        tenant_id=tenant_id,
        created_by_user_id=user_id,
        parcel_id=parcel_id,
        contact_id=contact_id,
        status="draft",
        sandbox=sandbox,
        objective=objective,
    )
    db.add(pack)
    db.flush()

    for channel in normalized_channels:
        subject, body = _draft_templates(contact.name, objective, channel)
        db.add(
            Message(
                tenant_id=tenant_id,
                pack_id=pack.id,
                contact_id=contact_id,
                channel=channel,
                direction=MessageDirection.outbound,
                status=MessageStatus.draft,
                subject=subject,
                body=body,
                meta_json={
                    "approval_state": "draft",
                    "created_by": "draft_pack",
                    "sandbox_default": bool(sandbox),
                },
            )
        )

    db.flush()
    payload = _pack_to_payload(db, pack)
    db.commit()
    return payload


def submit_draft_pack(db: Session, tenant_id: UUID, pack_id: UUID) -> dict:
    pack = db.execute(
        select(OutreachDraftPack).where(
            OutreachDraftPack.id == pack_id,
            OutreachDraftPack.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if pack is None:
        raise ValueError("Draft pack not found")
    if pack.status == "rejected":
        raise ValueError("Rejected pack cannot be submitted")

    pack.status = "submitted"
    submitted_at = datetime.now(tz=UTC)
    db.commit()
    return {"id": pack.id, "status": pack.status, "submitted_at": submitted_at}


def get_draft_pack(db: Session, tenant_id: UUID, pack_id: UUID) -> dict:
    pack = db.execute(
        select(OutreachDraftPack).where(
            OutreachDraftPack.id == pack_id,
            OutreachDraftPack.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if pack is None:
        raise ValueError("Draft pack not found")
    return _pack_to_payload(db, pack)


def list_draft_packs(
    db: Session,
    tenant_id: UUID,
    *,
    status: str | None = None,
    cursor: str | None = None,
    limit: int = 20,
) -> dict:
    stmt = (
        select(OutreachDraftPack)
        .where(OutreachDraftPack.tenant_id == tenant_id)
        .order_by(OutreachDraftPack.created_at.desc())
        .limit(limit + 1)
    )
    if status:
        stmt = stmt.where(OutreachDraftPack.status == status)
    if cursor:
        try:
            cursor_id = UUID(cursor)
        except ValueError as exc:
            raise ValueError("Invalid cursor") from exc
        cursor_pack = db.execute(
            select(OutreachDraftPack).where(
                OutreachDraftPack.id == cursor_id,
                OutreachDraftPack.tenant_id == tenant_id,
            )
        ).scalar_one_or_none()
        if cursor_pack:
            stmt = stmt.where(
                and_(
                    OutreachDraftPack.created_at <= cursor_pack.created_at,
                    OutreachDraftPack.id != cursor_pack.id,
                )
            )

    rows = list(db.execute(stmt).scalars())
    has_next = len(rows) > limit
    items = rows[:limit]
    next_cursor = str(items[-1].id) if has_next and items else None

    return {
        "items": [_pack_to_payload(db, row) for row in items],
        "next_cursor": next_cursor,
    }


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
        message.meta_json = _message_meta(message, blocked_reason=reason, approval_state="approved")
        pack_status = _safe_pack_status(db, message.pack_id)
        db.commit()
        return {
            "status": "blocked",
            "reason": reason,
            "pack_id": message.pack_id,
            "pack_status": pack_status,
        }

    contact = db.execute(
        select(Contact).where(Contact.id == message.contact_id, Contact.tenant_id == tenant_id)
    ).scalar_one()

    if settings.sandbox_mode:
        message.status = MessageStatus.blocked
        message.meta_json = _message_meta(
            message,
            sandbox_staged=True,
            approval_state="approved",
            blocked_reason="Sandbox mode blocks real sends",
        )
        db.add(
            ComplianceEvent(
                tenant_id=tenant_id,
                event_type="blocked",
                subject_type="message",
                subject_id=str(message.id),
                rule_key="sandbox_default",
                details_json={"sandbox_mode": True, "channel": message.channel.value},
            )
        )
        pack_status = _safe_pack_status(db, message.pack_id)
        db.commit()
        return {
            "status": "blocked_sandbox",
            "sandbox": True,
            "pack_id": message.pack_id,
            "pack_status": pack_status,
            "reason": "Sandbox mode blocks real sends",
        }

    if message.channel == Channel.email:
        provider = get_email_provider()
        if not contact.email:
            message.status = MessageStatus.failed
            message.meta_json = _message_meta(message, error="Contact has no email")
            pack_status = _safe_pack_status(db, message.pack_id)
            db.commit()
            return {
                "status": "failed",
                "reason": "Contact has no email",
                "pack_id": message.pack_id,
                "pack_status": pack_status,
            }
        if not settings.sandbox_mode and getattr(provider, "name", "") == "console_email":
            message.meta_json = _message_meta(
                message,
                provider_fallback_reason="Missing Postmark credentials; using console provider",
            )
        result = await provider.send(contact.email, message.subject or "", message.body)
    elif message.channel == Channel.sms:
        provider = get_sms_provider()
        if not contact.phone:
            message.status = MessageStatus.failed
            message.meta_json = _message_meta(message, error="Contact has no phone")
            pack_status = _safe_pack_status(db, message.pack_id)
            db.commit()
            return {
                "status": "failed",
                "reason": "Contact has no phone",
                "pack_id": message.pack_id,
                "pack_status": pack_status,
            }
        if not settings.sandbox_mode and getattr(provider, "name", "") == "console_sms":
            message.meta_json = _message_meta(
                message,
                provider_fallback_reason="Missing Twilio credentials; using console provider",
            )
        result = await provider.send(contact.phone, message.body)
    else:
        message.status = MessageStatus.queued
        message.meta_json = _message_meta(message, voice_provider="not_implemented", sandbox_staged=True)
        pack_status = _safe_pack_status(db, message.pack_id)
        db.commit()
        return {
            "status": "queued",
            "sandbox": True,
            "pack_id": message.pack_id,
            "pack_status": pack_status,
        }

    if result.ok:
        message.status = MessageStatus.sent
        message.sent_at = datetime.now(tz=UTC)
        message.provider_message_id = result.provider_message_id
        message.meta_json = _message_meta(message, approval_state="approved")
    else:
        message.status = MessageStatus.failed
        message.meta_json = _message_meta(message, provider_error=result.error)

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

    pack_status = _safe_pack_status(db, message.pack_id)
    db.commit()
    return {
        "status": message.status.value,
        "provider_message_id": message.provider_message_id,
        "pack_id": message.pack_id,
        "pack_status": pack_status,
    }

def reject_draft(db: Session, tenant_id: UUID, message_id: UUID, reason: str | None = None) -> dict:
    message = db.execute(
        select(Message).where(
            Message.id == message_id,
            Message.tenant_id == tenant_id,
            Message.direction == MessageDirection.outbound,
        )
    ).scalar_one_or_none()
    if message is None:
        raise ValueError("Message not found")
    if message.status != MessageStatus.draft:
        raise ValueError("Only draft messages can be rejected")

    message.status = MessageStatus.blocked
    message.meta_json = _message_meta(
        message,
        approval_state="rejected",
        rejected_reason=reason or "manual_reject",
    )
    pack_status = _safe_pack_status(db, message.pack_id)
    db.commit()
    return {
        "id": message.id,
        "pack_id": message.pack_id,
        "status": message.status.value,
        "approval_state": "rejected",
        "pack_status": pack_status,
    }


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
        db.add(
            ComplianceEvent(
                tenant_id=tenant_id,
                event_type="opt_out",
                subject_type="contact",
                subject_id=str(contact.id),
                rule_key="stop_opt_out",
                details_json={"channel": "sms", "body": body},
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
    if stopped:
        db.add(
            ComplianceEvent(
                tenant_id=tenant_id,
                event_type="sequence_stopped",
                subject_type="contact",
                subject_id=str(contact.id),
                rule_key="stop_on_reply",
                details_json={"stopped_count": stopped},
            )
        )
    db.commit()

    return {
        "contact_id": str(contact.id),
        "message_id": str(inbound.id),
        "stop_triggered": stop_triggered,
        "global_revocation_applied": bool(stop_triggered and settings.enforce_global_revocation),
        "enrollments_stopped": stopped,
    }


