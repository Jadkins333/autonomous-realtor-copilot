from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Contact, Conversation, Sequence, SequenceEnrollment
from app.models.enums import EnrollmentState
from app.services.insights import compute_micro_market_nowcast
from app.services.metrics import get_metrics_payload
from app.services.opportunities import list_opportunities
from app.services.source_ops import list_source_status


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _staleness_badge(value: dict | None) -> str:
    freshness = value or {}
    return str(freshness.get("staleness") or "unknown")


def _market_drivers(nowcast: dict) -> list[dict[str, str]]:
    if nowcast.get("status") != "ok":
        missing = ", ".join(nowcast.get("missing_inputs", [])[:3]) or "required signals"
        return [{"label": "Coverage", "value": f"Partial data: missing {missing}"}]

    components = nowcast.get("value", {}).get("components", {})
    permits_score = float(components.get("permits_score") or 0.0)
    poi_score = float(components.get("poi_score") or 0.0)
    rates_score = float(components.get("rates_score") or 0.0)

    def band(score: float, *, high: str, mid: str, low: str) -> str:
        if score >= 70:
            return high
        if score >= 40:
            return mid
        return low

    return [
        {"label": "Permit momentum", "value": band(permits_score, high="strong", mid="moderate", low="soft")},
        {"label": "Amenity density", "value": band(poi_score, high="strong", mid="balanced", low="thin")},
        {"label": "Rate pressure", "value": band(rates_score, high="favorable", mid="neutral", low="headwind")},
    ]


def _top_follow_up_opportunities(opportunities: dict) -> list[dict[str, Any]]:
    items = opportunities.get("items", [])
    shortlisted = [
        item
        for item in items
        if float(item.get("neighborhood_heat", {}).get("value", {}).get("score_0_100") or 0) >= 65
        or float(item.get("distress_likelihood", {}).get("value", {}).get("score_0_1") or 0) >= 0.55
    ]

    if not shortlisted:
        shortlisted = items[:3]

    result = []
    for item in shortlisted[:4]:
        result.append(
            {
                "parcel_id": item["parcel_id"],
                "address": item["address"],
                "heat_score": round(float(item.get("neighborhood_heat", {}).get("value", {}).get("score_0_100") or 0), 1),
                "distress_score": round(float(item.get("distress_likelihood", {}).get("value", {}).get("score_0_1") or 0), 2),
                "flags": item.get("opportunity_flags", []),
                "event_count_30d": int(item.get("event_signal", {}).get("count_30d") or 0),
                "href": f"/properties/{item['parcel_id']}",
                "freshness": item.get("neighborhood_heat", {}).get("freshness"),
            }
        )
    return result


def _client_milestones(db: Session, tenant_id: UUID, now: datetime) -> list[dict[str, str]]:
    rows = db.execute(
        select(Conversation, Contact)
        .join(Contact, Contact.id == Conversation.contact_id)
        .where(Contact.tenant_id == tenant_id, Conversation.tenant_id == tenant_id)
        .order_by(
            Conversation.last_inbound_at.desc().nullslast(),
            Conversation.last_outbound_at.desc().nullslast(),
        )
        .limit(12)
    ).all()

    milestones: list[dict[str, str]] = []
    for conversation, contact in rows:
        if conversation.last_inbound_at and (
            conversation.last_outbound_at is None or conversation.last_inbound_at > conversation.last_outbound_at
        ):
            milestones.append(
                {
                    "contact_id": str(contact.id),
                    "contact_name": contact.name,
                    "detail": f"Reply waiting since {conversation.last_inbound_at.strftime('%b %d, %I:%M %p')}.",
                    "href": f"/contacts/{contact.id}",
                    "kind": "reply_needed",
                }
            )
        elif conversation.last_outbound_at and conversation.last_outbound_at <= now - timedelta(days=7):
            milestones.append(
                {
                    "contact_id": str(contact.id),
                    "contact_name": contact.name,
                    "detail": f"No logged outbound follow-up since {conversation.last_outbound_at.strftime('%b %d')}.",
                    "href": f"/contacts/{contact.id}",
                    "kind": "follow_up_due",
                }
            )

    return milestones[:4]


def _urgent_tasks(db: Session, tenant_id: UUID, now: datetime) -> list[dict[str, str]]:
    tasks: list[dict[str, str]] = []

    for source in list_source_status(db):
        if source.state.value != "ok" or source.drift_detected or source.dlq_count > 0 or source.last_error:
            detail_bits = [f"state={source.state.value}"]
            if source.drift_detected and source.drift_reason:
                detail_bits.append(source.drift_reason)
            if source.last_error:
                detail_bits.append(source.last_error)
            if source.dlq_count > 0:
                detail_bits.append(f"DLQ {source.dlq_count}")
            tasks.append(
                {
                    "title": f"{source.source_name} requires review",
                    "detail": " · ".join(detail_bits),
                    "href": "/sources",
                    "severity": "warning",
                }
            )

    stalled_rows = db.execute(
        select(SequenceEnrollment, Sequence, Contact)
        .join(Sequence, Sequence.id == SequenceEnrollment.sequence_id)
        .join(Contact, Contact.id == SequenceEnrollment.contact_id)
        .where(
            SequenceEnrollment.tenant_id == tenant_id,
            SequenceEnrollment.state == EnrollmentState.active,
            SequenceEnrollment.next_step_at.is_not(None),
            SequenceEnrollment.next_step_at <= now,
        )
        .order_by(SequenceEnrollment.next_step_at.asc())
        .limit(4)
    ).all()

    for enrollment, sequence, contact in stalled_rows:
        tasks.append(
            {
                "title": f"{contact.name} is waiting on {sequence.name}",
                "detail": f"Next step was due {_iso(enrollment.next_step_at)} and still needs operator review.",
                "href": "/sequences",
                "severity": "warning",
            }
        )

    return tasks[:6]


def _conversation_starters(
    *,
    nowcast: dict,
    opportunities: list[dict[str, Any]],
    urgent_tasks: list[dict[str, str]],
) -> dict[str, Any]:
    facts: list[str] = []
    score = nowcast.get("value", {}).get("score_0_100")
    if score is not None:
        facts.append(f"Columbus micro-market nowcast is {score}/100 from deterministic public-data inputs.")

    for driver in _market_drivers(nowcast)[:2]:
        facts.append(f"{driver['label']} is currently {driver['value']}.")

    if opportunities:
        top = opportunities[0]
        facts.append(
            f"{len(opportunities)} follow-up opportunity row{'s' if len(opportunities) != 1 else ''} clear the current queue; top heat is {top['heat_score']} at {top['address']}."
        )

    if urgent_tasks:
        facts.append(f"{len(urgent_tasks)} operator task{'s' if len(urgent_tasks) != 1 else ''} need review before end of day.")

    if not facts:
        facts.append("The current snapshot is calm, so outreach should stay focused on existing verified records.")

    first_fact = facts[0]
    second_fact = facts[1] if len(facts) > 1 else facts[0]
    third_fact = facts[2] if len(facts) > 2 else facts[-1]

    variants = [
        {
            "tone": "email",
            "text": (
                f"Quick verified market update: {first_fact} {second_fact} "
                "If you want, I can pull the specific parcel records behind the strongest signal."
            ),
        },
        {
            "tone": "text",
            "text": (
                f"Verified local update: {first_fact} {third_fact} "
                "Reply if you want the exact addresses behind today’s strongest opportunities."
            ),
        },
        {
            "tone": "social",
            "text": (
                f"Today’s verified Columbus signal: {first_fact} {second_fact} "
                "We are tracking deterministic parcel and permit movement, not guessing from trend chatter."
            ),
        },
    ]

    return {
        "label": "Verified talking points",
        "verified_facts": facts[:4],
        "variants": variants,
        "ai_generated": False,
        "provider_label": None,
    }


def build_dashboard_digest(db: Session, tenant_id: UUID) -> dict[str, Any]:
    now = datetime.now(tz=UTC)
    metrics = get_metrics_payload(db)
    nowcast = compute_micro_market_nowcast(db, tenant_id)
    opportunities = list_opportunities(db, tenant_id, limit=12)
    follow_up_opportunities = _top_follow_up_opportunities(opportunities)
    urgent_tasks = _urgent_tasks(db, tenant_id, now)
    client_milestones = _client_milestones(db, tenant_id, now)

    return {
        "generated_at": now.isoformat(),
        "verified_at": now.isoformat(),
        "overview": {
            "verified_label": "Deterministic digest",
            "parcels": metrics.get("parcels", 0),
            "messages": metrics.get("messages", 0),
            "drafts": metrics.get("drafts", 0),
            "permits": metrics.get("permits", 0),
            "dlq_size": metrics.get("dlq_size", 0),
            "last_source_run_status": metrics.get("last_source_run_status"),
            "last_source_run_started_at": metrics.get("last_source_run_started_at"),
        },
        "urgent_tasks": urgent_tasks,
        "market_shift": {
            "status": nowcast.get("status"),
            "score_0_100": nowcast.get("value", {}).get("score_0_100"),
            "rationale": nowcast.get("value", {}).get("rationale"),
            "freshness": nowcast.get("freshness"),
            "computed_at": nowcast.get("computed_at"),
            "drivers": _market_drivers(nowcast),
            "coverage_summary": nowcast.get("coverage_summary"),
            "missing_inputs": nowcast.get("missing_inputs", []),
        },
        "client_milestones": client_milestones,
        "follow_up_opportunities": follow_up_opportunities,
        "conversation_starters": _conversation_starters(
            nowcast=nowcast,
            opportunities=follow_up_opportunities,
            urgent_tasks=urgent_tasks,
        ),
    }
