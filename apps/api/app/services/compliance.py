from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.compliance.rules import FAIR_HOUSING_FLAGGED_TERMS
from app.core.config import get_settings
from app.models.entities import ComplianceEvent, ConsentEvent, Message, SequenceEnrollment, SequenceStep, SuppressionList
from app.models.enums import Channel, ConsentStatus, EnrollmentState, MessageDirection, MessageStatus

settings = get_settings()
EASTERN = ZoneInfo("America/New_York")

def evaluate_fair_housing_text(text: str) -> list[str]:
    lowered = text.lower()
    return [term for term in FAIR_HOUSING_FLAGGED_TERMS if term in lowered]


def _write_compliance_event(
    db: Session,
    tenant_id,
    event_type: str,
    subject_type: str,
    subject_id: str,
    rule_key: str,
    details: dict,
) -> None:
    db.add(
        ComplianceEvent(
            tenant_id=tenant_id,
            event_type=event_type,
            subject_type=subject_type,
            subject_id=subject_id,
            rule_key=rule_key,
            details_json=details,
        )
    )


def has_explicit_channel_consent(db: Session, tenant_id, contact_id, channel: Channel) -> bool:
    stmt = (
        select(ConsentEvent)
        .where(
            ConsentEvent.tenant_id == tenant_id,
            ConsentEvent.contact_id == contact_id,
            ConsentEvent.channel == channel,
        )
        .order_by(ConsentEvent.occurred_at.desc())
        .limit(1)
    )
    latest = db.execute(stmt).scalar_one_or_none()
    return bool(latest and latest.status == ConsentStatus.opt_in)


def is_suppressed(db: Session, tenant_id, contact_id, channel: Channel) -> bool:
    stmt = select(SuppressionList.id).where(
        SuppressionList.tenant_id == tenant_id,
        SuppressionList.contact_id == contact_id,
        SuppressionList.channel == channel,
    )
    return db.execute(stmt).first() is not None


def is_within_quiet_hours(now: datetime | None = None) -> bool:
    current = (now or datetime.now(tz=UTC)).astimezone(EASTERN)
    return settings.quiet_hours_start <= current.hour < settings.quiet_hours_end


def is_within_allowed_hours(now: datetime | None = None) -> bool:
    return is_within_quiet_hours(now)

def fair_housing_risk_score(text: str) -> float:
    words = text.split()
    if not words:
        return 0.0
    return float(len(evaluate_fair_housing_text(text)) / len(words))

def outbound_count_today(db: Session, tenant_id, contact_id, channel: Channel) -> int:
    current = datetime.now(tz=UTC).astimezone(EASTERN).date()
    stmt = select(func.count(Message.id)).where(
        Message.tenant_id == tenant_id,
        Message.contact_id == contact_id,
        Message.channel == channel,
        Message.direction == MessageDirection.outbound,
        Message.created_at >= datetime.combine(current, datetime.min.time(), tzinfo=EASTERN).astimezone(UTC),
        Message.status.in_([MessageStatus.queued, MessageStatus.sent, MessageStatus.delivered]),
    )
    return int(db.execute(stmt).scalar() or 0)


def enforce_outbound_policy(db: Session, message: Message) -> tuple[bool, str | None]:
    # Policy docs: /docs/compliance/tcpa.md and /docs/compliance/can_spam.md
    # These are configurable compliance defaults, not hardcoded legal conclusions.
    if message.channel in {Channel.sms, Channel.voice} and not has_explicit_channel_consent(
        db, message.tenant_id, message.contact_id, message.channel
    ):
        _write_compliance_event(
            db,
            message.tenant_id,
            "blocked",
            "message",
            str(message.id),
            "consent_required",
            {"channel": message.channel.value},
        )
        return False, "Consent required for sms/voice"

    if is_suppressed(db, message.tenant_id, message.contact_id, message.channel):
        _write_compliance_event(
            db,
            message.tenant_id,
            "blocked",
            "message",
            str(message.id),
            "suppressed_contact",
            {"channel": message.channel.value},
        )
        return False, "Contact is suppressed"

    if not is_within_allowed_hours():
        _write_compliance_event(
            db,
            message.tenant_id,
            "blocked",
            "message",
            str(message.id),
            "quiet_hours",
            {"tz": "America/New_York"},
        )
        return False, "Outside quiet hours"

    if outbound_count_today(db, message.tenant_id, message.contact_id, message.channel) >= settings.frequency_cap_per_day:
        _write_compliance_event(
            db,
            message.tenant_id,
            "blocked",
            "message",
            str(message.id),
            "frequency_cap",
            {"cap": settings.frequency_cap_per_day},
        )
        return False, "Daily frequency cap reached"

    return True, None


def stop_enrollments_on_reply(db: Session, tenant_id, contact_id) -> int:
    stmt = (
        select(SequenceEnrollment)
        .where(
            SequenceEnrollment.tenant_id == tenant_id,
            SequenceEnrollment.contact_id == contact_id,
            SequenceEnrollment.state == EnrollmentState.active,
        )
        .order_by(SequenceEnrollment.enrolled_at.desc())
    )
    enrollments = list(db.execute(stmt).scalars())
    count = 0
    for enrollment in enrollments:
        steps_stmt = select(SequenceStep).where(
            and_(
                SequenceStep.sequence_id == enrollment.sequence_id,
                SequenceStep.stop_on_reply.is_(True),
            )
        )
        has_stop_on_reply = db.execute(steps_stmt).first() is not None
        if has_stop_on_reply:
            enrollment.state = EnrollmentState.stopped
            count += 1
    return count
