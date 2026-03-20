from __future__ import annotations

from hashlib import sha256
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import case, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.entities import (
    MetricDefinition,
    MetricValue,
    OpportunityEvent,
    OpportunityState,
    Parcel,
    Permit,
    ProvenanceRecord,
)
from app.services.provenance import freshness


def _ensure_metric_definition(
    db: Session, key: str, name: str, formula_markdown: str, required_inputs_json: list[str]
) -> MetricDefinition:
    # Use PostgreSQL upsert so concurrent requests (e.g. React StrictMode double-invoke)
    # never race on the unique constraint uq_metric_key_version.
    stmt = (
        pg_insert(MetricDefinition)
        .values(
            id=uuid4(),
            key=key,
            name=name,
            version="v1",
            formula_markdown=formula_markdown,
            required_inputs_json=required_inputs_json,
            created_at=datetime.now(tz=UTC),
        )
        .on_conflict_do_update(
            constraint="uq_metric_key_version",
            set_={
                "name": name,
                "formula_markdown": formula_markdown,
                "required_inputs_json": required_inputs_json,
            },
        )
    )
    db.execute(stmt)
    return db.execute(
        select(MetricDefinition).where(MetricDefinition.key == key, MetricDefinition.version == "v1")
    ).scalar_one()


def _store_metric_value(
    db: Session,
    tenant_id: UUID,
    definition: MetricDefinition,
    subject_id: str,
    value_json: dict,
    inputs_json: dict,
    provenance_json: dict,
) -> MetricValue:
    metric_value = MetricValue(
        tenant_id=tenant_id,
        metric_definition_id=definition.id,
        subject_type="parcel",
        subject_id=subject_id,
        value_json=value_json,
        inputs_json=inputs_json,
        provenance_json=provenance_json,
        computed_at=datetime.now(tz=UTC),
    )
    db.add(metric_value)
    db.flush()
    return metric_value


def _event_dedupe_key(*, tenant_id: UUID, parcel_id: UUID, event_type: str, day: str) -> str:
    packed = f"{tenant_id}|{parcel_id}|{event_type}|{day}".encode("utf-8")
    return sha256(packed).hexdigest()


def _record_opportunity_event(
    db: Session,
    *,
    tenant_id: UUID,
    parcel_id: UUID,
    event_type: str,
    severity: str,
    details_json: dict,
    occurred_at: datetime,
) -> None:
    day = occurred_at.date().isoformat()
    dedupe_key = _event_dedupe_key(
        tenant_id=tenant_id,
        parcel_id=parcel_id,
        event_type=event_type,
        day=day,
    )
    existing = db.execute(select(OpportunityEvent).where(OpportunityEvent.dedupe_key == dedupe_key)).scalar_one_or_none()
    if existing:
        return

    db.add(
        OpportunityEvent(
            tenant_id=tenant_id,
            parcel_id=parcel_id,
            event_type=event_type,
            severity=severity,
            details_json=details_json,
            dedupe_key=dedupe_key,
            created_at=occurred_at,
        )
    )


def _record_status_change_event(
    db: Session,
    *,
    tenant_id: UUID,
    parcel_id: UUID,
    from_status: str,
    to_status: str,
    actor_user_id: UUID,
    reason: str | None,
    occurred_at: datetime,
) -> None:
    dedupe_key = sha256(
        f"{tenant_id}|{parcel_id}|status_change|{from_status}|{to_status}|{occurred_at.isoformat()}".encode("utf-8")
    ).hexdigest()
    db.add(
        OpportunityEvent(
            tenant_id=tenant_id,
            parcel_id=parcel_id,
            event_type="status_change",
            severity="info",
            details_json={
                "from_status": from_status,
                "to_status": to_status,
                "actor_user_id": str(actor_user_id),
                "reason": reason,
                "changed_at": occurred_at.isoformat(),
            },
            dedupe_key=dedupe_key,
            created_at=occurred_at,
        )
    )


def list_opportunities(db: Session, tenant_id: UUID, limit: int = 50) -> dict:
    parcels = list(
        db.execute(
            select(Parcel)
            .where(Parcel.tenant_id == tenant_id)
            .order_by(Parcel.updated_at.desc())
            .limit(limit)
        ).scalars()
    )

    if not parcels:
        return {
            "status": "insufficient_data",
            "missing_inputs": ["parcels"],
            "items": [],
        }

    heat_def = _ensure_metric_definition(
        db,
        "neighborhood_heat_v1",
        "Neighborhood Heat",
        "`heat = max(0, ((min(1, permits_90d/4)*0.60) + (transit_score_0_100/100*0.40) - flood_penalty) * 100)`",
        ["permits_90d", "transit_score_0_100", "flood_intersection"],
    )
    distress_def = _ensure_metric_definition(
        db,
        "distress_likelihood_v1",
        "Distress Likelihood",
        "`distress = clamp(0,1, 0.15 + permit_signal + flood_signal + transit_signal)`",
        ["permits_365d", "flood_intersection", "transit_score_0_100"],
    )

    parcel_ids = [parcel.id for parcel in parcels]
    ninety_days_ago = datetime.now(tz=UTC).date() - timedelta(days=90)
    year_ago = datetime.now(tz=UTC).date() - timedelta(days=365)

    permits_90_map: dict[UUID, int] = {
        row[0]: int(row[1])
        for row in db.execute(
            select(Permit.parcel_id, func.count(Permit.id))
            .where(
                Permit.tenant_id == tenant_id,
                Permit.parcel_id.is_not(None),
                Permit.parcel_id.in_(parcel_ids),
                case((Permit.issued_date.is_not(None), Permit.issued_date), else_=Permit.applied_date)
                >= ninety_days_ago,
            )
            .group_by(Permit.parcel_id)
        )
    }

    permits_365_map: dict[UUID, int] = {
        row[0]: int(row[1])
        for row in db.execute(
            select(Permit.parcel_id, func.count(Permit.id))
            .where(
                Permit.tenant_id == tenant_id,
                Permit.parcel_id.is_not(None),
                Permit.parcel_id.in_(parcel_ids),
                case((Permit.issued_date.is_not(None), Permit.issued_date), else_=Permit.applied_date)
                >= year_ago,
            )
            .group_by(Permit.parcel_id)
        )
    }

    thirty_days_ago = datetime.now(tz=UTC) - timedelta(days=30)
    event_count_30d_map: dict[UUID, int] = {
        row[0]: int(row[1])
        for row in db.execute(
            select(OpportunityEvent.parcel_id, func.count(OpportunityEvent.id))
            .where(
                OpportunityEvent.tenant_id == tenant_id,
                OpportunityEvent.parcel_id.in_(parcel_ids),
                OpportunityEvent.created_at >= thirty_days_ago,
            )
            .group_by(OpportunityEvent.parcel_id)
        )
    }
    latest_event_map: dict[UUID, OpportunityEvent] = {}
    for event in db.execute(
        select(OpportunityEvent)
        .where(
            OpportunityEvent.tenant_id == tenant_id,
            OpportunityEvent.parcel_id.in_(parcel_ids),
        )
        .order_by(OpportunityEvent.created_at.desc())
    ).scalars():
        if event.parcel_id not in latest_event_map:
            latest_event_map[event.parcel_id] = event

    provenance_map: dict[UUID, ProvenanceRecord] = {}
    state_map: dict[UUID, str] = {
        row.parcel_id: row.status
        for row in db.execute(select(OpportunityState).where(OpportunityState.tenant_id == tenant_id)).scalars()
    }
    provenance_ids = [parcel.provenance_id for parcel in parcels if parcel.provenance_id]
    if provenance_ids:
        for record in db.execute(select(ProvenanceRecord).where(ProvenanceRecord.id.in_(provenance_ids))).scalars():
            provenance_map[record.id] = record

    items: list[dict] = []
    for parcel in parcels:
        recent_permits = permits_90_map.get(parcel.id, 0)
        annual_permits = permits_365_map.get(parcel.id, 0)

        flood_zone = db.execute(
            text(
                """
                SELECT zone_code
                FROM flood_zones
                WHERE tenant_id = :tenant_id
                  AND ST_Intersects(
                        geom,
                        COALESCE((SELECT geom FROM parcels WHERE id = :parcel_id),
                                 ST_Buffer((SELECT centroid FROM parcels WHERE id = :parcel_id)::geography, 5)::geometry)
                      )
                LIMIT 1
                """
            ),
            {"tenant_id": str(tenant_id), "parcel_id": str(parcel.id)},
        ).scalar()

        nearest_distance = db.execute(
            text(
                """
                SELECT MIN(ST_DistanceSphere((SELECT centroid FROM parcels WHERE id = :parcel_id), geom))
                FROM transit_stops
                WHERE tenant_id = :tenant_id
                """
            ),
            {"tenant_id": str(tenant_id), "parcel_id": str(parcel.id)},
        ).scalar()

        transit_score = None
        missing_inputs: list[str] = []
        if nearest_distance is None:
            missing_inputs.append("transit_stops")
        else:
            transit_score = max(0.0, min(100.0, 100.0 - (float(nearest_distance) / 40.0)))

        permit_norm = min(1.0, recent_permits / 4.0)
        transit_norm = (transit_score / 100.0) if transit_score is not None else 0.0
        flood_penalty = 0.20 if flood_zone else 0.0
        neighborhood_heat_score = round(max(0.0, (permit_norm * 0.60) + (transit_norm * 0.40) - flood_penalty) * 100, 2)

        distress_permit_signal = 0.35 if annual_permits == 0 else (0.15 if annual_permits < 2 else 0.0)
        distress_flood_signal = 0.25 if flood_zone else 0.0
        distress_transit_signal = 0.25 if transit_score is not None and transit_score < 45 else 0.0
        distress_score = round(
            max(0.0, min(1.0, 0.15 + distress_permit_signal + distress_flood_signal + distress_transit_signal)),
            2,
        )

        parcel_prov = provenance_map.get(parcel.provenance_id) if parcel.provenance_id else None
        parcel_freshness = freshness(parcel_prov)
        provenance = {
            "sources": [
                {
                    "source_id": str(parcel_prov.source_id) if parcel_prov else None,
                    "provenance_record_id": str(parcel_prov.id) if parcel_prov else None,
                    "raw_url": parcel_prov.raw_url if parcel_prov else "seed://parcels",
                    "freshness": parcel_freshness,
                }
            ]
        }

        heat_inputs = {
            "permits_90d": {"value": recent_permits, "fields": ["permits.applied_date", "permits.issued_date"]},
            "transit_score_0_100": {"value": transit_score, "fields": ["transit_stops.geom"]},
            "flood_intersection": {"value": bool(flood_zone), "fields": ["flood_zones.geom", "flood_zones.zone_code"]},
        }
        distress_inputs = {
            "permits_365d": {"value": annual_permits, "fields": ["permits.applied_date", "permits.issued_date"]},
            "flood_intersection": {"value": bool(flood_zone), "fields": ["flood_zones.geom", "flood_zones.zone_code"]},
            "transit_score_0_100": {"value": transit_score, "fields": ["transit_stops.geom"]},
        }

        heat_metric = _store_metric_value(
            db,
            tenant_id,
            heat_def,
            str(parcel.id),
            {"score_0_100": neighborhood_heat_score},
            heat_inputs,
            provenance,
        )
        distress_metric = _store_metric_value(
            db,
            tenant_id,
            distress_def,
            str(parcel.id),
            {"score_0_1": distress_score},
            distress_inputs,
            provenance,
        )

        flags: list[str] = []
        if neighborhood_heat_score >= 65:
            flags.append("permit_momentum")
            _record_opportunity_event(
                db,
                tenant_id=tenant_id,
                parcel_id=parcel.id,
                event_type="neighborhood_heat_crossed",
                severity="high" if neighborhood_heat_score >= 80 else "medium",
                details_json={
                    "threshold": 65,
                    "score_0_100": neighborhood_heat_score,
                    "distress_score_0_1": distress_score,
                },
                occurred_at=datetime.now(tz=UTC),
            )
        if distress_score >= 0.55:
            flags.append("distress_signal")
            _record_opportunity_event(
                db,
                tenant_id=tenant_id,
                parcel_id=parcel.id,
                event_type="distress_signal_crossed",
                severity="high" if distress_score >= 0.7 else "medium",
                details_json={
                    "threshold": 0.55,
                    "score_0_1": distress_score,
                    "annual_permits": annual_permits,
                },
                occurred_at=datetime.now(tz=UTC),
            )
        if flood_zone:
            flags.append("flood_exposure")
            _record_opportunity_event(
                db,
                tenant_id=tenant_id,
                parcel_id=parcel.id,
                event_type="flood_exposure_detected",
                severity="medium",
                details_json={"zone_code": flood_zone},
                occurred_at=datetime.now(tz=UTC),
            )

        items.append(
            {
                "parcel_id": str(parcel.id),
                "address": parcel.address,
                "parcel_number": parcel.parcel_number,
                "city": parcel.city,
                "state": parcel.state,
                "zip": parcel.zip,
                "opportunity_flags": flags,
                "status": "insufficient_data" if missing_inputs else "ok",
                "workflow_status": state_map.get(parcel.id, "new"),
                "missing_inputs": missing_inputs,
                "event_signal": {
                    "count_30d": event_count_30d_map.get(parcel.id, 0),
                    "latest": (
                        {
                            "event_type": latest_event_map[parcel.id].event_type,
                            "severity": latest_event_map[parcel.id].severity,
                            "created_at": latest_event_map[parcel.id].created_at.isoformat(),
                        }
                        if parcel.id in latest_event_map
                        else None
                    ),
                },
                "neighborhood_heat": {
                    "metric_key": heat_def.key,
                    "version": heat_def.version,
                    "formula_markdown": heat_def.formula_markdown,
                    "computed_at": heat_metric.computed_at.isoformat(),
                    "ttl_seconds": parcel_freshness.get("ttl_seconds"),
                    "is_stale": parcel_freshness.get("is_stale"),
                    "value": {"score_0_100": neighborhood_heat_score},
                    "inputs": heat_inputs,
                    "provenance": provenance,
                },
                "distress_likelihood": {
                    "metric_key": distress_def.key,
                    "version": distress_def.version,
                    "formula_markdown": distress_def.formula_markdown,
                    "computed_at": distress_metric.computed_at.isoformat(),
                    "ttl_seconds": parcel_freshness.get("ttl_seconds"),
                    "is_stale": parcel_freshness.get("is_stale"),
                    "value": {"score_0_1": distress_score},
                    "inputs": distress_inputs,
                    "provenance": provenance,
                },
            }
        )

    db.commit()

    items.sort(
        key=lambda row: (
            float(row["neighborhood_heat"]["value"].get("score_0_100") or 0),
            float(row["distress_likelihood"]["value"].get("score_0_1") or 0) * 100,
        ),
        reverse=True,
    )

    return {
        "status": "ok",
        "model_version": "v1",
        "items": items,
    }


def set_opportunity_status(
    db: Session,
    tenant_id: UUID,
    parcel_id: UUID,
    *,
    status: str,
    actor_user_id: UUID,
    reason: str | None = None,
) -> dict:
    parcel = db.execute(select(Parcel).where(Parcel.id == parcel_id, Parcel.tenant_id == tenant_id)).scalar_one_or_none()
    if parcel is None:
        raise ValueError("Parcel not found")

    existing = db.execute(
        select(OpportunityState).where(
            OpportunityState.tenant_id == tenant_id,
            OpportunityState.parcel_id == parcel_id,
        )
    ).scalar_one_or_none()
    now = datetime.now(tz=UTC)
    if existing is None:
        existing = OpportunityState(
            tenant_id=tenant_id,
            parcel_id=parcel_id,
            status="new",
            updated_by_user_id=actor_user_id,
            updated_at=now,
        )
        db.add(existing)
        db.flush()

    prior_status = existing.status
    changed = prior_status != status
    if changed:
        existing.status = status
        existing.updated_by_user_id = actor_user_id
        existing.updated_at = now
        _record_status_change_event(
            db,
            tenant_id=tenant_id,
            parcel_id=parcel_id,
            from_status=prior_status,
            to_status=status,
            actor_user_id=actor_user_id,
            reason=reason,
            occurred_at=now,
        )
    db.commit()

    return {
        "parcel_id": str(parcel_id),
        "status": existing.status,
        "previous_status": prior_status,
        "changed": changed,
        "updated_at": existing.updated_at.isoformat(),
    }


def list_opportunity_events(
    db: Session,
    tenant_id: UUID,
    *,
    parcel_id: UUID | None = None,
    severity: str | None = None,
    days: int = 30,
    limit: int = 100,
) -> dict:
    cutoff = datetime.now(tz=UTC) - timedelta(days=days)
    stmt = (
        select(OpportunityEvent, Parcel)
        .join(Parcel, Parcel.id == OpportunityEvent.parcel_id)
        .where(
            OpportunityEvent.tenant_id == tenant_id,
            OpportunityEvent.created_at >= cutoff,
        )
        .order_by(OpportunityEvent.created_at.desc())
        .limit(limit)
    )
    if parcel_id:
        stmt = stmt.where(OpportunityEvent.parcel_id == parcel_id)
    if severity:
        stmt = stmt.where(OpportunityEvent.severity == severity)

    rows = db.execute(stmt).all()
    return {
        "status": "ok",
        "filters": {
            "parcel_id": str(parcel_id) if parcel_id else None,
            "severity": severity,
            "days": days,
            "limit": limit,
        },
        "items": [
            {
                "id": str(event.id),
                "parcel_id": str(event.parcel_id),
                "address": parcel.address,
                "event_type": event.event_type,
                "severity": event.severity,
                "details": event.details_json,
                "created_at": event.created_at.isoformat(),
            }
            for event, parcel in rows
        ],
    }
