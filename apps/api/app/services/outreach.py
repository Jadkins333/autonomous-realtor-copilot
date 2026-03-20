from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID

import httpx
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
    OutreachSendAttempt,
    Parcel,
    SuppressionList,
)
from app.models.enums import Channel, ConsentStatus, MessageDirection, MessageStatus
from app.services.audit import record_activity_event
from app.services.compliance import (
    evaluate_fair_housing_scan,
    evaluate_outbound_policy,
    persist_policy_decision,
    stop_enrollments_on_reply,
)
from app.services.disclosures import evaluate_disclosure_gate, record_blocked_disclosure_workflow
from app.services.providers import ProviderResult, get_email_provider, get_sms_provider

settings = get_settings()


def _disclosure_default() -> dict:
    return {
        "allowed": True,
        "blocking_disclosures": [],
        "reason_codes": [],
        "human_readable_messages": [],
        "jurisdiction": "unknown",
    }


def _message_disclosure_status(
    db: Session,
    message: Message,
    *,
    pack: OutreachDraftPack | None,
    user_id: UUID | None,
) -> dict:
    if pack is None or pack.parcel_id is None:
        return _disclosure_default()
    parcel = db.execute(
        select(Parcel).where(Parcel.id == pack.parcel_id, Parcel.tenant_id == message.tenant_id)
    ).scalar_one_or_none()
    if parcel is None:
        return _disclosure_default()
    return evaluate_disclosure_gate(
        db,
        tenant_id=message.tenant_id,
        user_id=user_id,
        action="outreach_approve",
        contact_id=message.contact_id,
        property_id=parcel.id,
        jurisdiction=parcel.state,
        log_presentation=False,
    )


def list_drafts(db: Session, tenant_id: UUID, *, user_id: UUID | None = None) -> list[dict]:
    rows = list(
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
    return [_message_to_payload(db, row, user_id=user_id) for row in rows]


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

    if any(row.status == MessageStatus.sent for row in drafts):
        return "completed"

    if any(row.status == MessageStatus.blocked for row in drafts):
        return "attention_required"

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


def _get_last_send_attempt(db: Session, message_id: UUID) -> OutreachSendAttempt | None:
    return db.execute(
        select(OutreachSendAttempt)
        .where(OutreachSendAttempt.message_id == message_id)
        .order_by(OutreachSendAttempt.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def _message_to_payload(db: Session, message: Message, *, user_id: UUID | None = None) -> dict:
    meta = message.meta_json or {}
    attempt = _get_last_send_attempt(db, message.id)
    pack = (
        db.execute(select(OutreachDraftPack).where(OutreachDraftPack.id == message.pack_id)).scalar_one_or_none()
        if message.pack_id is not None
        else None
    )
    disclosure_status = _message_disclosure_status(db, message, pack=pack, user_id=user_id)
    return {
        "id": message.id,
        "pack_id": message.pack_id,
        "property_id": pack.parcel_id if pack else None,
        "contact_id": message.contact_id,
        "channel": message.channel.value,
        "subject": message.subject,
        "body": message.body,
        "status": message.status.value,
        "created_at": message.created_at,
        "approval_state": _draft_approval_state(message),
        "compliance_snapshot": meta.get("policy_snapshot"),
        "disclosure_status": meta.get("disclosure_status") or disclosure_status,
        "fair_housing_scan": meta.get("fair_housing_scan"),
        "sandbox_indicator": meta.get("delivery_mode") or ("sandbox" if meta.get("sandbox_default") else "live"),
        "last_send_attempt": {
            "id": attempt.id,
            "final_status": attempt.final_status,
            "provider_selected": attempt.provider_selected,
            "provider_message_id": attempt.provider_message_id,
            "completed_at": attempt.completed_at,
            "policy_snapshot": attempt.policy_snapshot_json,
        }
        if attempt
        else None,
    }


def _pack_to_payload(db: Session, pack: OutreachDraftPack, *, user_id: UUID | None = None) -> dict:
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
        "drafts": [_message_to_payload(db, draft, user_id=user_id) for draft in drafts],
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
        fair_housing_scan = evaluate_fair_housing_scan("\n".join(part for part in [subject or "", body] if part))
        message = Message(
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
                "delivery_mode": "sandbox" if sandbox else "live",
                "fair_housing_scan": fair_housing_scan.to_dict(),
            },
        )
        db.add(message)
        db.flush()
        record_activity_event(
            db,
            tenant_id=tenant_id,
            actor_user_id=user_id,
            entity_type="message",
            entity_id=str(message.id),
            event_type="draft_generated",
            metadata={
                "pack_id": str(pack.id),
                "channel": channel.value,
                "sandbox": sandbox,
                "fair_housing_scan": fair_housing_scan.to_dict(),
            },
        )

    db.flush()
    payload = _pack_to_payload(db, pack, user_id=user_id)
    record_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        entity_type="outreach_draft_pack",
        entity_id=str(pack.id),
        event_type="draft_pack_created",
        metadata={"channels": [channel.value for channel in normalized_channels], "sandbox": sandbox},
    )
    db.commit()
    return payload


def submit_draft_pack(db: Session, tenant_id: UUID, pack_id: UUID, *, actor_user_id: UUID | None = None) -> dict:
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
    record_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type="outreach_draft_pack",
        entity_id=str(pack.id),
        event_type="approval_requested",
        metadata={"submitted_at": submitted_at.isoformat()},
    )
    db.commit()
    return {"id": pack.id, "status": pack.status, "submitted_at": submitted_at}


def get_draft_pack(db: Session, tenant_id: UUID, pack_id: UUID, *, user_id: UUID | None = None) -> dict:
    pack = db.execute(
        select(OutreachDraftPack).where(
            OutreachDraftPack.id == pack_id,
            OutreachDraftPack.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if pack is None:
        raise ValueError("Draft pack not found")
    return _pack_to_payload(db, pack, user_id=user_id)


def list_draft_packs(
    db: Session,
    tenant_id: UUID,
    *,
    user_id: UUID | None = None,
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
        "items": [_pack_to_payload(db, row, user_id=user_id) for row in items],
        "next_cursor": next_cursor,
    }


def _effective_sandbox_mode(message: Message, pack: OutreachDraftPack | None) -> bool:
    if pack is not None:
        return bool(pack.sandbox)
    return bool((message.meta_json or {}).get("sandbox_default", settings.sandbox_mode))


def _provider_payload_hash(result: ProviderResult | None, fallback_payload: dict) -> str:
    payload = result.request_payload if result and result.request_payload is not None else fallback_payload
    encoded = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _send_idempotency_key(message: Message) -> str:
    return f"message:{message.id}:send:v1"


def _finalize_attempt(
    attempt: OutreachSendAttempt,
    *,
    final_status: str,
    provider_result: ProviderResult | None = None,
    provider_selected: str | None = None,
    error_text: str | None = None,
) -> None:
    attempt.final_status = final_status
    attempt.provider_selected = provider_selected or attempt.provider_selected
    attempt.provider_message_id = provider_result.provider_message_id if provider_result else attempt.provider_message_id
    attempt.provider_response_json = provider_result.response_payload or {} if provider_result else {}
    attempt.normalized_result_json = (
        {
            "ok": provider_result.ok,
            "provider_message_id": provider_result.provider_message_id,
            "error": provider_result.error,
        }
        if provider_result
        else {}
    )
    attempt.error_text = error_text or (provider_result.error if provider_result else None)
    attempt.completed_at = datetime.now(tz=UTC)


def update_draft(
    db: Session,
    tenant_id: UUID,
    message_id: UUID,
    payload,
    *,
    user_id: UUID | None = None,
) -> dict:
    message = db.execute(
        select(Message).where(Message.id == message_id, Message.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if not message:
        raise ValueError("Draft not found")
    if message.status != MessageStatus.draft and message.status != MessageStatus.pending_approval:
        raise ValueError("Cannot edit a draft that has already been acted upon.")

    if payload.subject is not None:
        message.subject = payload.subject
    if payload.body is not None:
        message.body = payload.body
        
    db.commit()
    return _message_to_payload(db, message, user_id=user_id)


async def approve_and_send(
    db: Session,
    tenant_id: UUID,
    message_id: UUID,
    *,
    actor_user_id: UUID | None = None,
) -> dict:
    message = db.execute(
        select(Message).where(Message.id == message_id, Message.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if not message:
        raise ValueError("Message not found")

    idempotency_key = _send_idempotency_key(message)
    existing_attempt = db.execute(
        select(OutreachSendAttempt).where(OutreachSendAttempt.idempotency_key == idempotency_key)
    ).scalar_one_or_none()
    if existing_attempt is not None:
        pack_status = _refresh_pack_rollup_status(db, message.pack_id) if message.pack_id else None
        return {
            "status": existing_attempt.final_status,
            "deduped": True,
            "provider_message_id": existing_attempt.provider_message_id,
            "pack_id": message.pack_id,
            "pack_status": pack_status,
            "policy_snapshot": existing_attempt.policy_snapshot_json,
            "disclosure_status": (message.meta_json or {}).get("disclosure_status"),
            "send_attempt_id": existing_attempt.id,
        }

    if message.status != MessageStatus.draft:
        raise ValueError("Message is not draft")

    pack = None
    if message.pack_id is not None:
        pack = db.execute(select(OutreachDraftPack).where(OutreachDraftPack.id == message.pack_id)).scalar_one_or_none()
    sandbox_mode = _effective_sandbox_mode(message, pack)

    contact = db.execute(
        select(Contact).where(Contact.id == message.contact_id, Contact.tenant_id == tenant_id)
    ).scalar_one()
    disclosure_status = _message_disclosure_status(db, message, pack=pack, user_id=actor_user_id)
    if not disclosure_status["allowed"]:
        message.status = MessageStatus.blocked
        message.meta_json = {
            **(message.meta_json or {}),
            "approval_state": "approved",
            "disclosure_status": disclosure_status,
            "blocked_reason_codes": disclosure_status["reason_codes"],
            "blocked_explanations": disclosure_status["human_readable_messages"],
        }
        record_activity_event(
            db,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            entity_type="message",
            entity_id=str(message.id),
            event_type="approval_action",
            metadata={"approved": True, "disclosure_status": disclosure_status},
        )
        record_blocked_disclosure_workflow(
            db,
            tenant_id=tenant_id,
            user_id=actor_user_id,
            action="outreach_approve",
            subject_type="message",
            subject_id=str(message.id),
            decision=disclosure_status,
        )
        pack_status = _refresh_pack_rollup_status(db, message.pack_id) if message.pack_id else None
        db.commit()
        return {
            "status": "blocked",
            "reason_codes": disclosure_status["reason_codes"],
            "explanations": disclosure_status["human_readable_messages"],
            "pack_id": message.pack_id,
            "pack_status": pack_status,
            "disclosure_status": disclosure_status,
        }

    decision = evaluate_outbound_policy(db, message, contact=contact, sandbox_mode=sandbox_mode)
    persist_policy_decision(db, message, decision)

    message.meta_json = {
        **(message.meta_json or {}),
        "approval_state": "approved",
        "policy_snapshot": decision.to_dict(),
        "disclosure_status": disclosure_status,
        "delivery_mode": decision.delivery_mode,
        "fair_housing_scan": decision.fair_housing_scan,
    }
    record_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type="message",
        entity_id=str(message.id),
        event_type="approval_action",
        metadata={"approved": True, "policy_snapshot": decision.to_dict()},
    )

    if not decision.allowed:
        message.status = MessageStatus.blocked
        message.meta_json = {
            **message.meta_json,
            "blocked_reason_codes": decision.reason_codes,
            "blocked_explanations": decision.human_readable_explanations,
        }
        record_activity_event(
            db,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            entity_type="message",
            entity_id=str(message.id),
            event_type="compliance_scan_result",
            metadata={"allowed": False, "policy_snapshot": decision.to_dict()},
        )
        pack_status = _refresh_pack_rollup_status(db, message.pack_id) if message.pack_id else None
        db.commit()
        return {
            "status": "blocked",
            "reason_codes": decision.reason_codes,
            "explanations": decision.human_readable_explanations,
            "pack_id": message.pack_id,
            "pack_status": pack_status,
            "policy_snapshot": decision.to_dict(),
            "disclosure_status": disclosure_status,
        }

    fallback_payload = {
        "channel": message.channel.value,
        "to": contact.email if message.channel == Channel.email else contact.phone,
        "subject": message.subject,
        "body": message.body,
        "idempotency_key": idempotency_key,
    }
    attempt = OutreachSendAttempt(
        tenant_id=tenant_id,
        message_id=message.id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        sandbox=sandbox_mode,
        policy_snapshot_json=decision.to_dict(),
        provider_selected="sandbox:none" if sandbox_mode else None,
        provider_request_payload_hash=_provider_payload_hash(None, fallback_payload),
        final_status="pending",
    )
    db.add(attempt)
    db.flush()
    record_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type="message",
        entity_id=str(message.id),
        event_type="send_attempt_created",
        metadata={"send_attempt_id": str(attempt.id), "sandbox": sandbox_mode, "idempotency_key": idempotency_key},
    )

    if sandbox_mode:
        message.status = MessageStatus.blocked
        message.meta_json = {
            **message.meta_json,
            "sandbox_staged": True,
            "blocked_reason": "Sandbox mode stages the message and prevents provider delivery.",
        }
        db.add(
            ComplianceEvent(
                tenant_id=tenant_id,
                event_type="blocked",
                subject_type="message",
                subject_id=str(message.id),
                rule_key="sandbox_default",
                details_json={"send_attempt_id": str(attempt.id), "delivery_mode": "sandbox"},
            )
        )
        _finalize_attempt(attempt, final_status="sandbox_staged", provider_selected="sandbox:none")
        record_activity_event(
            db,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            entity_type="message",
            entity_id=str(message.id),
            event_type="send_attempt_completed",
            metadata={"send_attempt_id": str(attempt.id), "final_status": "sandbox_staged"},
        )
        pack_status = _refresh_pack_rollup_status(db, message.pack_id) if message.pack_id else None
        db.commit()
        return {
            "status": "sandbox_staged",
            "sandbox": True,
            "pack_id": message.pack_id,
            "pack_status": pack_status,
            "policy_snapshot": decision.to_dict(),
            "disclosure_status": disclosure_status,
            "send_attempt_id": attempt.id,
        }

    provider_result: ProviderResult | None = None
    provider_selected = ""
    try:
        if message.channel == Channel.email:
            if not contact.email:
                message.status = MessageStatus.failed
                _finalize_attempt(
                    attempt,
                    final_status="failed",
                    provider_selected="email:none",
                    error_text="Contact has no email",
                )
                db.commit()
                return {"status": "failed", "reason": "Contact has no email", "send_attempt_id": attempt.id}
            provider = get_email_provider(sandbox_mode=False)
            provider_selected = getattr(provider, "name", "email_provider")
            provider_result = await provider.send(
                contact.email,
                message.subject or "",
                message.body,
                idempotency_key=idempotency_key,
            )
        elif message.channel == Channel.sms:
            if not contact.phone:
                message.status = MessageStatus.failed
                _finalize_attempt(
                    attempt,
                    final_status="failed",
                    provider_selected="sms:none",
                    error_text="Contact has no phone",
                )
                db.commit()
                return {"status": "failed", "reason": "Contact has no phone", "send_attempt_id": attempt.id}
            provider = get_sms_provider(sandbox_mode=False)
            provider_selected = getattr(provider, "name", "sms_provider")
            provider_result = await provider.send(contact.phone, message.body, idempotency_key=idempotency_key)
        else:
            message.status = MessageStatus.blocked
            _finalize_attempt(
                attempt,
                final_status="voice_not_enabled",
                provider_selected="voice:not_implemented",
                error_text="Voice sending is not enabled",
            )
            db.commit()
            return {"status": "voice_not_enabled", "send_attempt_id": attempt.id}
    except httpx.TimeoutException as exc:
        message.status = MessageStatus.failed
        _finalize_attempt(
            attempt,
            final_status="provider_timeout",
            provider_selected=provider_selected,
            error_text=str(exc),
        )
        db.commit()
        return {"status": "provider_timeout", "send_attempt_id": attempt.id, "reason": str(exc)}
    except RuntimeError as exc:
        final_status = "provider_unconfigured" if "not configured" in str(exc).lower() else "provider_error"
        message.status = MessageStatus.failed
        _finalize_attempt(
            attempt,
            final_status=final_status,
            provider_selected=provider_selected,
            error_text=str(exc),
        )
        db.commit()
        return {"status": final_status, "send_attempt_id": attempt.id, "reason": str(exc)}
    except Exception as exc:  # noqa: BLE001
        message.status = MessageStatus.failed
        _finalize_attempt(
            attempt,
            final_status="provider_error",
            provider_selected=provider_selected,
            error_text=str(exc),
        )
        db.commit()
        return {"status": "provider_error", "send_attempt_id": attempt.id, "reason": str(exc)}

    attempt.provider_selected = provider_selected
    attempt.provider_request_payload_hash = _provider_payload_hash(provider_result, fallback_payload)

    if provider_result.ok:
        message.status = MessageStatus.sent
        message.sent_at = datetime.now(tz=UTC)
        message.provider_message_id = provider_result.provider_message_id
        _finalize_attempt(attempt, final_status="sent", provider_result=provider_result, provider_selected=provider_selected)
    else:
        message.status = MessageStatus.failed
        _finalize_attempt(
            attempt,
            final_status="provider_error",
            provider_result=provider_result,
            provider_selected=provider_selected,
        )

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

    record_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type="message",
        entity_id=str(message.id),
        event_type="send_attempt_completed",
        metadata={
            "send_attempt_id": str(attempt.id),
            "final_status": attempt.final_status,
            "provider_selected": provider_selected,
            "provider_message_id": attempt.provider_message_id,
        },
    )

    pack_status = _refresh_pack_rollup_status(db, message.pack_id) if message.pack_id else None
    db.commit()
    return {
        "status": message.status.value,
        "provider_message_id": message.provider_message_id,
        "pack_id": message.pack_id,
        "pack_status": pack_status,
        "policy_snapshot": decision.to_dict(),
        "disclosure_status": disclosure_status,
        "send_attempt_id": attempt.id,
    }


def reject_draft(
    db: Session,
    tenant_id: UUID,
    message_id: UUID,
    *,
    actor_user_id: UUID | None = None,
    reason: str | None = None,
) -> dict:
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
    message.meta_json = {
        **(message.meta_json or {}),
        "approval_state": "rejected",
        "rejected_reason": reason or "manual_reject",
    }
    record_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type="message",
        entity_id=str(message.id),
        event_type="approval_action",
        metadata={"approved": False, "reason": reason or "manual_reject"},
    )
    pack_status = _refresh_pack_rollup_status(db, message.pack_id) if message.pack_id else None
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
        contact = Contact(
            tenant_id=tenant_id,
            name=from_phone,
            phone=from_phone,
            timezone="America/New_York",
            tags_json=["inbound_unknown"],
        )
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
    db.flush()
    record_activity_event(
        db,
        tenant_id=tenant_id,
        entity_type="message",
        entity_id=str(inbound.id),
        event_type="reply_received",
        metadata={"channel": "sms", "provider_message_id": provider_message_id},
    )

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
        db.add(
            ConsentEvent(
                tenant_id=tenant_id,
                contact_id=contact.id,
                channel=Channel.sms,
                status=ConsentStatus.opt_out,
                consent_text=body,
                source="twilio_inbound",
                capture_method="inbound_keyword",
                policy_text_version="sms-stop-v1",
                proof_artifact_ref=f"twilio://message/{provider_message_id or inbound.id}",
                jurisdiction_assumptions_json={"country": "US"},
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
            record_activity_event(
                db,
                tenant_id=tenant_id,
                entity_type="contact",
                entity_id=str(contact.id),
                event_type="suppression_applied",
                metadata={"channel": "sms", "reason": "STOP inbound keyword"},
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
