from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.compliance.rules import FAIR_HOUSING_FLAGGED_TERMS, FAIR_HOUSING_RULES
from app.core.config import get_settings
from app.models.entities import (
    ComplianceEvent,
    ConsentEvent,
    Contact,
    Conversation,
    Message,
    SequenceEnrollment,
    SequenceStep,
    SuppressionList,
)
from app.models.enums import (
    Channel,
    ConsentStatus,
    EnrollmentState,
    MessageDirection,
    MessageStatus,
)

settings = get_settings()


@dataclass
class FairHousingScanResult:
    flagged_terms: list[str] = field(default_factory=list)
    reason_codes: list[str] = field(default_factory=list)
    explanations: list[str] = field(default_factory=list)

    @property
    def blocked(self) -> bool:
        return bool(self.reason_codes)

    def to_dict(self) -> dict[str, Any]:
        return {
            "blocked": self.blocked,
            "flagged_terms": self.flagged_terms,
            "reason_codes": self.reason_codes,
            "explanations": self.explanations,
        }


@dataclass
class PolicyDecision:
    allowed: bool
    reason_codes: list[str]
    human_readable_explanations: list[str]
    evaluated_at: datetime
    recipient_timezone_used: str | None
    consent_evidence_refs: list[str]
    delivery_mode: str
    fair_housing_scan: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["evaluated_at"] = self.evaluated_at.isoformat()
        return payload


def evaluate_fair_housing_scan(text: str) -> FairHousingScanResult:
    lowered = text.lower()
    flagged_terms: list[str] = []
    reason_codes: list[str] = []
    explanations: list[str] = []

    for term in FAIR_HOUSING_FLAGGED_TERMS:
        if term not in lowered:
            continue
        flagged_terms.append(term)
        rule = FAIR_HOUSING_RULES.get(term, {})
        reason_code = str(rule.get("reason_code") or "fair_housing_flagged")
        explanation = str(rule.get("explanation") or f"Flagged fair-housing phrase: {term}")
        if reason_code not in reason_codes:
            reason_codes.append(reason_code)
        if explanation not in explanations:
            explanations.append(explanation)

    return FairHousingScanResult(
        flagged_terms=flagged_terms,
        reason_codes=reason_codes,
        explanations=explanations,
    )


def evaluate_fair_housing_text(text: str) -> list[str]:
    return evaluate_fair_housing_scan(text).flagged_terms


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


def latest_consent_event(db: Session, tenant_id, contact_id, channel: Channel) -> ConsentEvent | None:
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
    return db.execute(stmt).scalar_one_or_none()


def has_explicit_channel_consent(db: Session, tenant_id, contact_id, channel: Channel) -> bool:
    latest = latest_consent_event(db, tenant_id, contact_id, channel)
    return bool(latest and latest.status == ConsentStatus.opt_in and latest.revoked_at is None)


def is_suppressed(db: Session, tenant_id, contact_id, channel: Channel) -> bool:
    stmt = select(SuppressionList.id).where(
        SuppressionList.tenant_id == tenant_id,
        SuppressionList.contact_id == contact_id,
        SuppressionList.channel == channel,
    )
    return db.execute(stmt).first() is not None


def resolve_contact_timezone(contact: Contact | None) -> str | None:
    if contact is None or not contact.timezone:
        return None
    try:
        ZoneInfo(contact.timezone)
    except ZoneInfoNotFoundError:
        return None
    return contact.timezone


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def is_within_quiet_hours(recipient_timezone: str, now: datetime | None = None) -> bool:
    current = (now or datetime.now(tz=UTC)).astimezone(ZoneInfo(recipient_timezone))
    return settings.quiet_hours_start <= current.hour < settings.quiet_hours_end


def outbound_count_today(
    db: Session,
    tenant_id,
    contact_id,
    channel: Channel,
    recipient_timezone: str,
    now: datetime | None = None,
) -> int:
    zone = ZoneInfo(recipient_timezone)
    local_now = (now or datetime.now(tz=UTC)).astimezone(zone)
    window_start = datetime.combine(local_now.date(), datetime.min.time(), tzinfo=zone).astimezone(UTC)
    stmt = select(func.count(Message.id)).where(
        Message.tenant_id == tenant_id,
        Message.contact_id == contact_id,
        Message.channel == channel,
        Message.direction == MessageDirection.outbound,
        Message.created_at >= window_start,
        Message.status.in_([MessageStatus.queued, MessageStatus.sent, MessageStatus.delivered]),
    )
    return int(db.execute(stmt).scalar() or 0)


def has_pending_stop_on_reply(db: Session, tenant_id, contact_id) -> bool:
    convo = db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.contact_id == contact_id,
        )
    ).scalar_one_or_none()
    if convo is None or convo.last_inbound_at is None:
        return False
    if convo.last_outbound_at is None:
        return True
    return convo.last_inbound_at >= convo.last_outbound_at


def evaluate_outbound_policy(
    db: Session,
    message: Message,
    *,
    contact: Contact | None = None,
    sandbox_mode: bool,
    now: datetime | None = None,
) -> PolicyDecision:
    evaluated_at = now or datetime.now(tz=UTC)
    reasons: list[str] = []
    explanations: list[str] = []
    consent_refs: list[str] = []
    contact_row = contact or db.execute(
        select(Contact).where(Contact.id == message.contact_id, Contact.tenant_id == message.tenant_id)
    ).scalar_one_or_none()

    consent = latest_consent_event(db, message.tenant_id, message.contact_id, message.channel)
    if consent is not None:
        consent_refs.append(str(consent.id))
        if consent.status == ConsentStatus.opt_out:
            reasons.append("stop_opt_out")
            explanations.append("The most recent consent record is an opt-out for this channel.")
        if consent.revoked_at is not None:
            reasons.append("consent_revoked")
            explanations.append("Consent was revoked after capture and cannot support a send.")
        if consent.status == ConsentStatus.opt_in:
            if not consent.proof_artifact_ref or not consent.policy_text_version:
                reasons.append("consent_proof_missing")
                explanations.append("Consent proof is incomplete because the artifact reference or disclosure version is missing.")
            occurred_at = _ensure_utc(consent.occurred_at)
            if occurred_at < evaluated_at - timedelta(days=settings.consent_max_age_days):
                reasons.append("consent_stale")
                explanations.append("Consent proof is older than the configured freshness window.")
    else:
        reasons.append("consent_required")
        explanations.append("No consent evidence exists for this contact and channel.")

    if is_suppressed(db, message.tenant_id, message.contact_id, message.channel):
        reasons.append("suppressed_contact")
        explanations.append("The contact is on the suppression list for this channel.")

    recipient_timezone = resolve_contact_timezone(contact_row)
    if recipient_timezone is None:
        reasons.append("recipient_timezone_missing")
        explanations.append("Recipient local time could not be determined, so quiet-hours evaluation cannot be proven.")
    elif not is_within_quiet_hours(recipient_timezone, evaluated_at):
        reasons.append("quiet_hours")
        explanations.append("The recipient is currently outside the allowed local quiet-hours window.")

    if recipient_timezone is not None and outbound_count_today(
        db, message.tenant_id, message.contact_id, message.channel, recipient_timezone, evaluated_at
    ) >= settings.frequency_cap_per_day:
        reasons.append("frequency_cap")
        explanations.append("The configured daily frequency cap has already been reached for this channel.")

    if has_pending_stop_on_reply(db, message.tenant_id, message.contact_id):
        reasons.append("stop_on_reply")
        explanations.append("A newer inbound reply exists, so outbound automation must stop until reviewed.")

    fair_housing_scan = evaluate_fair_housing_scan("\n".join(part for part in [message.subject or "", message.body] if part))
    if fair_housing_scan.blocked:
        reasons.append("fair_housing_flagged")
        explanations.extend(fair_housing_scan.explanations)

    unique_reasons = list(dict.fromkeys(reasons))
    unique_explanations = list(dict.fromkeys(explanations))
    return PolicyDecision(
        allowed=not unique_reasons,
        reason_codes=unique_reasons,
        human_readable_explanations=unique_explanations,
        evaluated_at=evaluated_at,
        recipient_timezone_used=recipient_timezone,
        consent_evidence_refs=consent_refs,
        delivery_mode="sandbox" if sandbox_mode else "live",
        fair_housing_scan=fair_housing_scan.to_dict(),
    )


def persist_policy_decision(db: Session, message: Message, decision: PolicyDecision) -> None:
    event_type = "policy_passed" if decision.allowed else "policy_blocked"
    payload = decision.to_dict()
    for reason_code in decision.reason_codes or ["policy_passed"]:
        _write_compliance_event(
            db,
            message.tenant_id,
            event_type,
            "message",
            str(message.id),
            reason_code,
            payload,
        )


def enforce_outbound_policy(
    db: Session,
    message: Message,
    *,
    contact: Contact | None = None,
    sandbox_mode: bool,
    now: datetime | None = None,
) -> tuple[bool, str | None]:
    decision = evaluate_outbound_policy(db, message, contact=contact, sandbox_mode=sandbox_mode, now=now)
    persist_policy_decision(db, message, decision)
    primary_reason = decision.human_readable_explanations[0] if decision.human_readable_explanations else None
    return decision.allowed, primary_reason


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
