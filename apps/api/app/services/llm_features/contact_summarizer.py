"""LLM-backed contact summarizer.

Builds a "pre-call brief" for a real estate agent from deterministic contact data:
  - Contact profile (name, email, phone, tags)
  - Recent message history (last N messages from DB)
  - Active sequence enrollments

The LLM receives only facts from the DB. It must not invent conversations,
preferences, or history that isn't present. Gaps in data are noted explicitly.

Returns None on LLMUnavailable.
"""
from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Contact, Message, Sequence, SequenceEnrollment
from app.services.llm.provider import LLMProvider, LLMUnavailable

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are an AI assistant helping a real estate agent prepare for a conversation with a lead.

Rules:
1. Only reference information explicitly present in the contact context below.
2. Never invent previous conversations, preferences, commitments, or personal details.
3. Explicitly note when data is sparse or missing.
4. Focus on actionable insights: what should the agent know before the call?
5. Use 3-5 concise bullet points. Each bullet should be one sentence.
6. Flag any red flags or opportunities visible in the data.
7. Do not add headers, labels, or explanatory text — just the bullet points.
   Format each bullet starting with "• ".
"""

_MAX_MESSAGES = 10
_MAX_ENROLLMENTS = 5


def _build_context(
    db: Session,
    tenant_id: UUID,
    contact: Contact,
) -> tuple[str, dict]:
    """Fetch recent messages + enrollments and build a context string + coverage dict."""
    messages = list(
        db.execute(
            select(Message)
            .where(Message.contact_id == contact.id, Message.tenant_id == tenant_id)
            .order_by(Message.created_at.desc())
            .limit(_MAX_MESSAGES)
        ).scalars()
    )

    enrollment_rows = db.execute(
        select(SequenceEnrollment, Sequence)
        .join(Sequence, Sequence.id == SequenceEnrollment.sequence_id)
        .where(
            SequenceEnrollment.contact_id == contact.id,
            SequenceEnrollment.tenant_id == tenant_id,
        )
        .order_by(SequenceEnrollment.enrolled_at.desc())
        .limit(_MAX_ENROLLMENTS)
    ).all()

    # Build context string — only real facts, no invented fields
    parts = [
        f"Contact: {contact.name or '(unnamed)'}",
        f"Email: {contact.email or '(none)'}",
        f"Phone: {contact.phone or '(none)'}",
    ]
    if contact.tags_json:
        parts.append(f"Tags: {', '.join(contact.tags_json) if isinstance(contact.tags_json, list) else contact.tags_json}")

    if messages:
        parts.append(f"\nMessage history ({len(messages)} most recent):")
        for msg in messages:
            direction = getattr(msg.direction, "value", str(msg.direction))
            channel = getattr(msg.channel, "value", str(msg.channel))
            status = getattr(msg.status, "value", str(msg.status))
            preview = (msg.body or "")[:120]
            sent_str = msg.sent_at.strftime("%Y-%m-%d") if msg.sent_at else msg.created_at.strftime("%Y-%m-%d")
            parts.append(f"  [{sent_str}] {direction} {channel} ({status}): {preview!r}")
    else:
        parts.append("\nMessage history: no messages on record.")

    if enrollment_rows:
        parts.append(f"\nSequence enrollments ({len(enrollment_rows)}):")
        for enrollment, sequence in enrollment_rows:
            state = getattr(enrollment.state, "value", str(enrollment.state))
            enrolled_str = enrollment.enrolled_at.strftime("%Y-%m-%d")
            parts.append(f"  {sequence.name!r} — state={state}, enrolled {enrolled_str}")
    else:
        parts.append("\nSequence enrollments: none.")

    coverage = {
        "has_email": bool(contact.email),
        "has_phone": bool(contact.phone),
        "message_count": len(messages),
        "enrollment_count": len(enrollment_rows),
    }
    return "\n".join(parts), coverage


def summarise_contact(
    provider: LLMProvider,
    db: Session,
    tenant_id: UUID,
    contact_id: UUID,
) -> dict | None:
    """
    Generate an AI-assisted pre-call brief for a contact.

    Returns:
        {
            "summary_bullets": list[str],     # 3-5 bullet points
            "raw_summary": str,               # full LLM output
            "ai_generated": True,
            "provider_label": str,
            "data_coverage": dict,
        }
    or None if contact not found or LLM unavailable.
    """
    contact = db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if not contact:
        return None

    context_str, coverage = _build_context(db, tenant_id, contact)
    prompt = (
        f"Prepare a pre-call brief for a real estate agent about to contact this lead.\n\n"
        f"{context_str}\n\n"
        "Write 3-5 bullet points (starting with '• '). "
        "Focus on: what's known, recent activity, enrollment status, and suggested approach."
    )

    try:
        raw = provider.complete(prompt, system=_SYSTEM_PROMPT).strip()
    except LLMUnavailable as exc:
        logger.debug("llm_contact_summary_unavailable contact_id=%s reason=%s", contact_id, exc)
        return None
    except Exception as exc:
        logger.warning("llm_contact_summary_unexpected contact_id=%s error=%s", contact_id, exc)
        return None

    bullets = [
        line.strip()
        for line in raw.splitlines()
        if line.strip().startswith("•") or line.strip().startswith("-")
    ]
    if not bullets:
        bullets = [line.strip() for line in raw.splitlines() if line.strip()]

    return {
        "summary_bullets": bullets[:7],
        "raw_summary": raw,
        "ai_generated": True,
        "provider_label": provider.provider_label,
        "data_coverage": coverage,
    }
