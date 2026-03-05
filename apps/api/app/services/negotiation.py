from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.entities import MetricDefinition, MetricValue, Parcel, Permit, ProvenanceRecord
from app.services.coverage import compute_coverage_summary
from app.services.provenance import freshness

NEGOTIATION_METRIC_KEY = "negotiation_motivation_v1"
NEGOTIATION_VERSION = "v1"
NEGOTIATION_REQUIRED_INPUTS = [
    "days_since_last_sale",
    "open_violations_count",
    "permit_activity_last_90d_count",
]
NEGOTIATION_FORMULA = (
    "`score = 0`\n"
    "`+25 if open_violations_count >= 3`\n"
    "`+15 if open_violations_count in [1,2]`\n"
    "`+20 if permit_activity_last_90d_count >= 2`\n"
    "`+10 if permit_activity_last_90d_count == 1`\n"
    "`+25 if days_since_last_sale >= 3650`\n"
    "`+15 if days_since_last_sale in [1825..3649]`\n"
    "then clamp score to 0..100."
)


def _ensure_negotiation_definition(db: Session) -> MetricDefinition:
    row = db.execute(
        select(MetricDefinition).where(
            MetricDefinition.key == NEGOTIATION_METRIC_KEY,
            MetricDefinition.version == NEGOTIATION_VERSION,
        )
    ).scalar_one_or_none()
    if row is not None:
        row.name = "Negotiation Motivation"
        row.formula_markdown = NEGOTIATION_FORMULA
        row.required_inputs_json = NEGOTIATION_REQUIRED_INPUTS
        return row

    row = MetricDefinition(
        key=NEGOTIATION_METRIC_KEY,
        name="Negotiation Motivation",
        version=NEGOTIATION_VERSION,
        formula_markdown=NEGOTIATION_FORMULA,
        required_inputs_json=NEGOTIATION_REQUIRED_INPUTS,
    )
    db.add(row)
    db.flush()
    return row


def _parse_days_since_last_sale(attributes_json: dict) -> int | None:
    raw = attributes_json.get("last_sale_date")
    if not raw:
        return None
    try:
        sale_date = date.fromisoformat(str(raw))
    except ValueError:
        return None
    return max(0, (datetime.now(tz=UTC).date() - sale_date).days)


def _to_int(value) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _freshness_summary(sources: list[dict]) -> dict:
    entries = [src.get("freshness", {}) for src in sources if isinstance(src, dict)]
    stale_count = sum(1 for item in entries if item.get("staleness") == "stale")
    ttl_candidates = [int(item.get("ttl_seconds")) for item in entries if item.get("ttl_seconds")]
    fetched_candidates = [item.get("fetched_at") for item in entries if item.get("fetched_at")]
    return {
        "fetched_at": max(fetched_candidates) if fetched_candidates else None,
        "ttl_seconds": min(ttl_candidates) if ttl_candidates else None,
        "is_stale": stale_count > 0,
        "staleness": "stale" if stale_count > 0 else ("fresh" if entries else "unknown"),
    }


def _store_metric_value(
    db: Session,
    *,
    tenant_id: UUID,
    definition: MetricDefinition,
    parcel_id: UUID,
    value_json: dict,
    inputs_json: dict,
    provenance_json: dict,
) -> MetricValue:
    row = MetricValue(
        tenant_id=tenant_id,
        metric_definition_id=definition.id,
        subject_type="parcel",
        subject_id=str(parcel_id),
        value_json=value_json,
        inputs_json=inputs_json,
        provenance_json=provenance_json,
        computed_at=datetime.now(tz=UTC),
    )
    db.add(row)
    db.flush()
    return row


def _rule_hits(days_since_last_sale: int, open_violations_count: int, permit_activity_last_90d_count: int) -> tuple[int, list[str]]:
    score = 0
    hits: list[str] = []

    if open_violations_count >= 3:
        score += 25
        hits.append("+25 open_violations_count >= 3")
    elif 1 <= open_violations_count <= 2:
        score += 15
        hits.append("+15 open_violations_count in [1,2]")

    if permit_activity_last_90d_count >= 2:
        score += 20
        hits.append("+20 permit_activity_last_90d_count >= 2")
    elif permit_activity_last_90d_count == 1:
        score += 10
        hits.append("+10 permit_activity_last_90d_count == 1")

    if days_since_last_sale >= 3650:
        score += 25
        hits.append("+25 days_since_last_sale >= 3650")
    elif 1825 <= days_since_last_sale <= 3649:
        score += 15
        hits.append("+15 days_since_last_sale in [1825..3649]")

    return max(0, min(100, score)), hits


def compute_negotiation_insight(db: Session, tenant_id: UUID, parcel_id: UUID) -> dict:
    parcel = db.execute(
        select(Parcel).where(Parcel.tenant_id == tenant_id, Parcel.id == parcel_id)
    ).scalar_one_or_none()
    if parcel is None:
        raise ValueError("Parcel not found")

    definition = _ensure_negotiation_definition(db)

    days_since_last_sale = _parse_days_since_last_sale(parcel.attributes_json or {})
    open_violations_count = _to_int((parcel.attributes_json or {}).get("open_violations_count"))

    ninety_days_ago = datetime.now(tz=UTC).date() - timedelta(days=90)
    permit_activity_last_90d_count = int(
        db.execute(
            select(func.count(Permit.id)).where(
                Permit.tenant_id == tenant_id,
                Permit.parcel_id == parcel.id,
                case((Permit.issued_date.is_not(None), Permit.issued_date), else_=Permit.applied_date) >= ninety_days_ago,
            )
        ).scalar()
        or 0
    )

    input_values = {
        "days_since_last_sale": days_since_last_sale,
        "open_violations_count": open_violations_count,
        "permit_activity_last_90d_count": permit_activity_last_90d_count,
    }
    required_inputs = definition.required_inputs_json or NEGOTIATION_REQUIRED_INPUTS
    coverage_summary = compute_coverage_summary(required_inputs, input_values)

    parcel_prov = None
    if parcel.provenance_id:
        parcel_prov = db.execute(
            select(ProvenanceRecord).where(ProvenanceRecord.id == parcel.provenance_id)
        ).scalar_one_or_none()

    permit_prov = db.execute(
        select(ProvenanceRecord)
        .join(Permit, Permit.provenance_id == ProvenanceRecord.id)
        .where(Permit.tenant_id == tenant_id, Permit.parcel_id == parcel.id)
        .order_by(ProvenanceRecord.fetched_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    provenance = {
        "sources": [
            {
                "source_id": str(parcel_prov.source_id) if parcel_prov else None,
                "provenance_record_id": str(parcel_prov.id) if parcel_prov else None,
                "raw_url": parcel_prov.raw_url if parcel_prov else "seed://parcels",
                "freshness": freshness(parcel_prov),
            },
            {
                "source_id": str(permit_prov.source_id) if permit_prov else None,
                "provenance_record_id": str(permit_prov.id) if permit_prov else None,
                "raw_url": permit_prov.raw_url if permit_prov else "seed://permits",
                "freshness": freshness(permit_prov),
            },
        ]
    }

    inputs = {
        "days_since_last_sale": {
            "value": days_since_last_sale,
            "fields": ["parcels.attributes_json.last_sale_date"],
            "ids": [str(parcel.id)],
        },
        "open_violations_count": {
            "value": open_violations_count,
            "fields": ["parcels.attributes_json.open_violations_count"],
            "ids": [str(parcel.id)],
        },
        "permit_activity_last_90d_count": {
            "value": permit_activity_last_90d_count,
            "fields": ["permits.applied_date", "permits.issued_date", "permits.parcel_id"],
            "ids": [str(parcel.id)],
        },
    }

    if coverage_summary["missing_required"]:
        value = {
            "motivation_score": None,
            "signals_used": [
                {
                    "signal": name,
                    "raw_value": input_values.get(name),
                    "rule_hits": [],
                }
                for name in required_inputs
            ],
            "insufficient_data": True,
        }
        metric_row = _store_metric_value(
            db,
            tenant_id=tenant_id,
            definition=definition,
            parcel_id=parcel.id,
            value_json=value,
            inputs_json=inputs,
            provenance_json=provenance,
        )
        db.commit()
        freshness_summary = _freshness_summary(provenance["sources"])
        return {
            "status": "insufficient_data",
            "insufficient_data": True,
            "missing_inputs": coverage_summary["missing_required"],
            "coverage_summary": coverage_summary,
            "metric_key": definition.key,
            "version": definition.version,
            "formula_key": definition.key,
            "formula_version": definition.version,
            "formula_markdown": definition.formula_markdown,
            "computed_at": metric_row.computed_at.isoformat(),
            "ttl_seconds": freshness_summary["ttl_seconds"],
            "is_stale": freshness_summary["is_stale"],
            "freshness": freshness_summary,
            "motivation_score": None,
            "signals_used": value["signals_used"],
            "inputs": inputs,
            "provenance": provenance,
        }

    score, hits = _rule_hits(
        days_since_last_sale=days_since_last_sale or 0,
        open_violations_count=open_violations_count or 0,
        permit_activity_last_90d_count=permit_activity_last_90d_count,
    )
    signals_used = [
        {
            "signal": "open_violations_count",
            "raw_value": open_violations_count,
            "rule_hits": [hit for hit in hits if "open_violations_count" in hit],
        },
        {
            "signal": "permit_activity_last_90d_count",
            "raw_value": permit_activity_last_90d_count,
            "rule_hits": [hit for hit in hits if "permit_activity_last_90d_count" in hit],
        },
        {
            "signal": "days_since_last_sale",
            "raw_value": days_since_last_sale,
            "rule_hits": [hit for hit in hits if "days_since_last_sale" in hit],
        },
    ]

    value = {
        "motivation_score": score,
        "signals_used": signals_used,
        "insufficient_data": False,
    }
    metric_row = _store_metric_value(
        db,
        tenant_id=tenant_id,
        definition=definition,
        parcel_id=parcel.id,
        value_json=value,
        inputs_json=inputs,
        provenance_json=provenance,
    )
    db.commit()

    freshness_summary = _freshness_summary(provenance["sources"])
    return {
        "status": "ok",
        "insufficient_data": False,
        "coverage_summary": coverage_summary,
        "metric_key": definition.key,
        "version": definition.version,
        "formula_key": definition.key,
        "formula_version": definition.version,
        "formula_markdown": definition.formula_markdown,
        "computed_at": metric_row.computed_at.isoformat(),
        "ttl_seconds": freshness_summary["ttl_seconds"],
        "is_stale": freshness_summary["is_stale"],
        "freshness": freshness_summary,
        "motivation_score": score,
        "signals_used": signals_used,
        "inputs": inputs,
        "provenance": provenance,
    }
