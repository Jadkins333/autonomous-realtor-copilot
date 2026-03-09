from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import case, desc, func, select, text
from sqlalchemy.orm import Session

from app.models.entities import (
    FloodZone,
    MetricDefinition,
    MetricValue,
    OpportunityEvent,
    Parcel,
    Permit,
    PoiFeature,
    ProvenanceRecord,
    Source,
    TransitStop,
)
from app.services.coverage import compute_coverage_summary
from app.services.compliance import evaluate_fair_housing_text
from app.services.provenance import freshness
from app.services.seed_loader import load_seed_json

CITY_SUBJECT_ID = "columbus_oh"


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def compute_nowcast_score_components(
    *,
    permits_per_100_parcels_90d: float,
    poi_density_per_km2: float,
    rate_series_delta_bps_90d: float,
) -> dict:
    permits_score = _clamp(permits_per_100_parcels_90d * 10.0, 0.0, 100.0)
    poi_score = _clamp(poi_density_per_km2 * 5.0, 0.0, 100.0)
    rates_score = _clamp(50.0 - (rate_series_delta_bps_90d / 10.0), 0.0, 100.0)
    score = round(_clamp((permits_score * 0.5) + (poi_score * 0.3) + (rates_score * 0.2), 0.0, 100.0), 1)
    return {
        "score": score,
        "components": {
            "permits_score": round(permits_score, 1),
            "poi_score": round(poi_score, 1),
            "rates_score": round(rates_score, 1),
        },
    }


def _definition(db: Session, key: str, version: str) -> MetricDefinition:
    row = db.execute(
        select(MetricDefinition).where(MetricDefinition.key == key, MetricDefinition.version == version)
    ).scalar_one()
    return row


def _latest_source_provenance(db: Session, source_name: str) -> tuple[Source | None, ProvenanceRecord | None]:
    source = db.execute(select(Source).where(Source.name == source_name)).scalar_one_or_none()
    if not source:
        return None, None
    prov = db.execute(
        select(ProvenanceRecord)
        .where(ProvenanceRecord.source_id == source.id)
        .order_by(ProvenanceRecord.fetched_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    return source, prov


def _store_metric_value(
    db: Session,
    tenant_id: UUID,
    definition: MetricDefinition,
    subject_type: str,
    subject_id: str,
    value_json: dict,
    inputs_json: dict,
    provenance_json: dict,
) -> MetricValue:
    row = MetricValue(
        tenant_id=tenant_id,
        metric_definition_id=definition.id,
        subject_type=subject_type,
        subject_id=subject_id,
        value_json=value_json,
        inputs_json=inputs_json,
        provenance_json=provenance_json,
        computed_at=datetime.now(tz=UTC),
    )
    db.add(row)
    db.flush()
    return row


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


def compute_micro_market_nowcast(db: Session, tenant_id: UUID) -> dict:
    definition = _definition(db, "micro_market_nowcast_v1", "v1")
    ninety_days_ago = datetime.now(tz=UTC).date() - timedelta(days=90)

    parcels_count = int(
        db.execute(select(func.count(Parcel.id)).where(Parcel.tenant_id == tenant_id)).scalar() or 0
    )

    permits_count = int(
        db.execute(
            select(func.count(Permit.id)).where(
                Permit.tenant_id == tenant_id,
                case(
                    (Permit.issued_date.is_not(None), Permit.issued_date),
                    else_=Permit.applied_date,
                )
                >= ninety_days_ago,
            )
        ).scalar()
        or 0
    )

    permit_activity_rate = (permits_count / parcels_count * 100.0) if parcels_count else 0.0

    bbox_query = text(
        """
        SELECT count(*)
        FROM poi_features
        WHERE tenant_id = :tenant_id
          AND ST_Within(geom, ST_MakeEnvelope(-83.09,39.88,-82.86,40.07,4326))
        """
    )
    poi_count = int(db.execute(bbox_query, {"tenant_id": str(tenant_id)}).scalar() or 0)
    sample_bbox_sqkm = 25.0
    poi_density_proxy = poi_count / sample_bbox_sqkm

    rate_series = load_seed_json("mortgage_rates.json")
    parsed_rates = [float(item["rate"]) for item in rate_series if isinstance(item, dict) and item.get("rate")]
    rate_series_proxy = None
    rate_delta = None
    if len(parsed_rates) >= 2:
        first_rate = parsed_rates[0]
        last_rate = parsed_rates[-1]
        rate_delta = last_rate - first_rate
        rate_series_proxy = {"start_rate": first_rate, "end_rate": last_rate, "delta": rate_delta}

    rationale = (
        "Nowcast uses deterministic weighted components from permit intensity, amenity density, "
        "and 90-day mortgage rate trend."
    )

    permit_source, permit_prov = _latest_source_provenance(db, "columbus_arcgis_permits")
    poi_source, poi_prov = _latest_source_provenance(db, "osm_overpass")

    rate_series_delta_bps_90d = round((rate_delta or 0.0) * 100.0, 1) if rate_delta is not None else None
    inputs = {
        "permits_per_100_parcels_90d": {
            "value": permit_activity_rate,
            "fields": ["permits.applied_date", "permits.issued_date", "permits.id", "parcels.id"],
            "ids": [str(tenant_id)],
        },
        "poi_density_per_km2": {
            "value": poi_density_proxy,
            "fields": ["poi_features.geom", "poi_features.id"],
            "ids": [str(tenant_id)],
        },
        "rate_series_delta_bps_90d": {
            "value": rate_series_delta_bps_90d,
            "fields": ["seed.mortgage_rates.rate", "seed.mortgage_rates.date"],
            "ids": ["mortgage_rate_seed_series"],
        },
    }
    provenance = {
        "sources": [
            {
                "source_id": str(permit_source.id) if permit_source else None,
                "provenance_record_id": str(permit_prov.id) if permit_prov else None,
                "raw_url": permit_prov.raw_url if permit_prov else "seed://permits",
                "freshness": freshness(permit_prov),
            },
            {
                "source_id": str(poi_source.id) if poi_source else None,
                "provenance_record_id": str(poi_prov.id) if poi_prov else None,
                "raw_url": poi_prov.raw_url if poi_prov else "seed://pois",
                "freshness": freshness(poi_prov),
            },
            {
                "source_id": "internal_seed",
                "provenance_record_id": None,
                "raw_url": "seed://mortgage_rates.json",
                "freshness": {
                    "fetched_at": datetime.now(tz=UTC).isoformat() if rate_series else None,
                    "ttl_seconds": 86400 if rate_series else None,
                    "staleness": "fresh" if rate_series else "unknown",
                    "is_stale": False if rate_series else None,
                },
            },
        ]
    }

    required_inputs = getattr(definition, "required_inputs_json", None) or [
        "permits_per_100_parcels_90d",
        "poi_density_per_km2",
        "rate_series_delta_bps_90d",
    ]
    coverage_summary = compute_coverage_summary(
        required_inputs,
        {
            "permits_per_100_parcels_90d": permit_activity_rate if parcels_count > 0 else None,
            "poi_density_per_km2": poi_density_proxy if poi_count > 0 else None,
            "rate_series_delta_bps_90d": rate_series_delta_bps_90d,
        },
    )
    missing_inputs: list[str] = list(coverage_summary["missing_required"])

    if missing_inputs:
        value = {
            "score_0_100": None,
            "components": {},
            "rationale": rationale,
            "insufficient_data": True,
        }
        metric_value = _store_metric_value(
            db,
            tenant_id,
            definition,
            subject_type="city",
            subject_id=CITY_SUBJECT_ID,
            value_json=value,
            inputs_json=inputs,
            provenance_json=provenance,
        )
        db.commit()
        summary = _freshness_summary(provenance["sources"])
        return {
            "status": "insufficient_data",
            "insufficient_data": True,
            "missing_inputs": missing_inputs,
            "coverage_summary": coverage_summary,
            "metric_key": definition.key,
            "version": definition.version,
            "formula_key": definition.key,
            "formula_version": definition.version,
            "formula_markdown": definition.formula_markdown,
            "computed_at": metric_value.computed_at.isoformat(),
            "ttl_seconds": summary["ttl_seconds"],
            "is_stale": summary["is_stale"],
            "freshness": summary,
            "value": value,
            "inputs": inputs,
            "provenance": provenance,
        }

    score_payload = compute_nowcast_score_components(
        permits_per_100_parcels_90d=permit_activity_rate,
        poi_density_per_km2=poi_density_proxy,
        rate_series_delta_bps_90d=rate_series_delta_bps_90d or 0.0,
    )
    permits_score = score_payload["components"]["permits_score"]
    poi_score = score_payload["components"]["poi_score"]
    rates_score = score_payload["components"]["rates_score"]
    score = score_payload["score"]

    permit_band = "strong" if permits_score >= 70 else ("moderate" if permits_score >= 40 else "soft")
    poi_band = "strong" if poi_score >= 70 else ("moderate" if poi_score >= 40 else "soft")
    rate_band = "favorable" if rates_score >= 60 else ("neutral" if rates_score >= 40 else "adverse")

    value = {
        "score": score,
        "score_0_100": score,
        "components": score_payload["components"],
        "rationale": (
            f"Permit momentum is {permit_band}, amenity density is {poi_band}, and rate trend is {rate_band}; "
            "final score is weighted 50/30/20."
        ),
    }
    metric_value = _store_metric_value(
        db,
        tenant_id,
        definition,
        subject_type="city",
        subject_id=CITY_SUBJECT_ID,
        value_json=value,
        inputs_json=inputs,
        provenance_json=provenance,
    )
    db.commit()
    summary = _freshness_summary(provenance["sources"])

    return {
        "status": "ok",
        "insufficient_data": False,
        "coverage_summary": coverage_summary,
        "metric_key": definition.key,
        "version": definition.version,
        "formula_key": definition.key,
        "formula_version": definition.version,
        "formula_markdown": definition.formula_markdown,
        "computed_at": metric_value.computed_at.isoformat(),
        "ttl_seconds": summary["ttl_seconds"],
        "is_stale": summary["is_stale"],
        "freshness": summary,
        "value": value,
        "inputs": inputs,
        "provenance": provenance,
    }


def score_marketing_package(db: Session, tenant_id: UUID, payload: dict) -> dict:
    definition = _definition(db, "marketing_package_health_v1", "v1")

    photo_count = int(payload.get("photo_count", 0))
    min_resolution_short_side = int(payload.get("min_resolution_short_side", 0))
    rooms_covered = payload.get("rooms_covered", [])
    description_text = str(payload.get("description_text", ""))

    completeness = min(photo_count / 25, 1.0) * 20
    completeness += min(min_resolution_short_side / 1200, 1.0) * 10
    completeness += min(len(rooms_covered) / 6, 1.0) * 10

    words = [w.strip(".,!?;:").lower() for w in description_text.split() if w.strip()]
    unique_ratio = (len(set(words)) / len(words)) if words else 0.0
    copy_richness = min(len(words) / 180, 1.0) * 20 + min(unique_ratio / 0.6, 1.0) * 10

    flagged_terms = evaluate_fair_housing_text(description_text)
    compliance_penalty = min(len(flagged_terms) * 10, 30)

    score = max(0.0, round(completeness + copy_richness - compliance_penalty, 2))
    breakdown = {
        "completeness_points": round(completeness, 2),
        "copy_richness_points": round(copy_richness, 2),
        "compliance_penalty_points": round(compliance_penalty, 2),
    }

    inputs = {
        "photo_count": {"value": photo_count, "fields": ["input.photo_count"], "ids": ["payload"]},
        "min_resolution_short_side": {
            "value": min_resolution_short_side,
            "fields": ["input.min_resolution_short_side"],
            "ids": ["payload"],
        },
        "rooms_covered": {
            "value": rooms_covered,
            "fields": ["input.rooms_covered"],
            "ids": ["payload"],
        },
        "description_text": {
            "value": description_text,
            "fields": ["input.description_text"],
            "ids": ["payload"],
        },
    }

    # Fair housing references live in /docs/compliance/fair_housing_advertising.md.
    provenance = {
        "sources": [
            {
                "source_id": "internal_ruleset",
                "raw_url": "/docs/compliance/fair_housing_advertising.md",
                "freshness": {
                    "fetched_at": datetime.now(tz=UTC).isoformat(),
                    "ttl_seconds": 31536000,
                    "staleness": "fresh",
                    "is_stale": False,
                },
            }
        ]
    }

    metric_value = _store_metric_value(
        db,
        tenant_id,
        definition,
        subject_type="marketing_package",
        subject_id="adhoc",
        value_json={"score_0_100": score, "breakdown": breakdown, "flagged_terms": flagged_terms},
        inputs_json=inputs,
        provenance_json=provenance,
    )
    db.commit()
    summary = _freshness_summary(provenance["sources"])

    return {
        "status": "ok",
        "metric_key": definition.key,
        "version": definition.version,
        "score_0_100": score,
        "breakdown": breakdown,
        "flagged_terms": flagged_terms,
        "formula_markdown": definition.formula_markdown,
        "computed_at": metric_value.computed_at.isoformat(),
        "ttl_seconds": summary["ttl_seconds"],
        "is_stale": summary["is_stale"],
        "inputs": inputs,
        "provenance": provenance,
    }


def _permit_mix_for_zip(db: Session, tenant_id: UUID, zip_code: str) -> dict:
    stmt = (
        select(Permit.permit_type, func.count(Permit.id).label("n"))
        .join(Parcel, Parcel.id == Permit.parcel_id, isouter=True)
        .where(
            Permit.tenant_id == tenant_id,
            (Parcel.zip == zip_code) | (Permit.address.ilike(f"%{zip_code}%")),
            Permit.applied_date >= (datetime.now(tz=UTC).date() - timedelta(days=365)),
        )
        .group_by(Permit.permit_type)
        .order_by(desc("n"))
        .limit(5)
    )
    return {row[0]: int(row[1]) for row in db.execute(stmt)}


def compute_parcel_insights(db: Session, tenant_id: UUID, parcel_id: UUID) -> dict:
    parcel = db.execute(
        select(Parcel).where(Parcel.id == parcel_id, Parcel.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if not parcel:
        raise ValueError("Parcel not found")

    renovation_def = _definition(db, "renovation_roi_v1", "v1")
    insurance_def = _definition(db, "insurance_pressure_v1", "v1")

    property_type = str(parcel.attributes_json.get("property_type", "unknown")).lower()
    permit_mix = _permit_mix_for_zip(db, tenant_id, parcel.zip)
    remodel_share = sum(v for k, v in permit_mix.items() if "remodel" in k.lower() or "interior" in k.lower())

    if property_type in {"single_family", "condo"} and remodel_share >= 6:
        roi_band = "high"
    elif remodel_share >= 3:
        roi_band = "medium"
    else:
        roi_band = "low"

    renovation_value = {
        "roi_band": roi_band,
        "guidance": (
            "Target kitchen/bath updates and curb appeal before major layout changes"
            if roi_band != "low"
            else "Prioritize maintenance fixes and energy efficiency before cosmetic upgrades"
        ),
        "ranges": {
            "low": "0-5% listing-premium potential",
            "medium": "5-12% listing-premium potential",
            "high": "12-20% listing-premium potential",
        },
    }
    renovation_inputs = {
        "property_type": {"value": property_type, "fields": ["parcels.attributes_json.property_type"], "ids": [str(parcel.id)]},
        "last_sale_date": {
            "value": parcel.attributes_json.get("last_sale_date"),
            "fields": ["parcels.attributes_json.last_sale_date"],
            "ids": [str(parcel.id)],
        },
        "neighborhood_permit_mix": {"value": permit_mix, "fields": ["permits.permit_type"], "ids": [parcel.zip]},
    }

    flood_intersects_stmt = text(
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
    )
    zone_row = db.execute(
        flood_intersects_stmt,
        {"tenant_id": str(tenant_id), "parcel_id": str(parcel.id)},
    ).first()

    distance_stmt = text(
        """
        SELECT COALESCE(MIN(ST_DistanceSphere(
            (SELECT centroid FROM parcels WHERE id = :parcel_id),
            ST_Centroid(geom)
        )), 99999)
        FROM flood_zones
        WHERE tenant_id = :tenant_id
        """
    )
    min_distance = float(
        db.execute(distance_stmt, {"tenant_id": str(tenant_id), "parcel_id": str(parcel.id)}).scalar() or 99999
    )

    if zone_row:
        pressure = "elevated"
        uncertainty = "medium"
    elif min_distance < 500:
        pressure = "moderate"
        uncertainty = "medium"
    else:
        pressure = "low"
        uncertainty = "high"

    insurance_value = {
        "pressure_level": pressure,
        "flood_zone_intersection": bool(zone_row),
        "zone_code": zone_row[0] if zone_row else None,
        "distance_to_flood_zone_meters": round(min_distance, 2),
        "uncertainty": uncertainty,
        "note": "Verify final premium and coverage constraints with licensed insurer.",
    }
    flood_polygon_count = int(db.execute(select(func.count(FloodZone.id)).where(FloodZone.tenant_id == tenant_id)).scalar() or 0)
    insurance_inputs = {
        "parcel_geom": {
            "value": str(parcel.id) if (parcel.geom is not None or parcel.centroid is not None) else None,
            "fields": ["parcels.geom", "parcels.centroid"],
            "ids": [str(parcel.id)],
        },
        "flood_polygons": {
            "value": flood_polygon_count if flood_polygon_count > 0 else None,
            "fields": ["flood_zones.geom", "flood_zones.zone_code"],
            "ids": [str(tenant_id)],
        },
    }

    renovation_prov = {
        "sources": [
            {
                "source_id": "internal_rule",
                "provenance_record_id": None,
                "raw_url": "seed://renovation_roi_rules",
                "freshness": {
                    "fetched_at": datetime.now(tz=UTC).isoformat(),
                    "ttl_seconds": 2592000,
                    "staleness": "fresh",
                    "is_stale": False,
                },
            },
            {
                "source_id": "columbus_arcgis_permits",
                "provenance_record_id": None,
                "raw_url": "source://columbus_arcgis_permits",
                "freshness": {
                    "fetched_at": datetime.now(tz=UTC).isoformat(),
                    "ttl_seconds": 43200,
                    "staleness": "unknown",
                    "is_stale": None,
                },
            },
        ]
    }
    insurance_prov = {
        "sources": [
            {
                "source_id": "fema_nfhl",
                "provenance_record_id": None,
                "raw_url": "source://fema_nfhl",
                "freshness": {
                    "fetched_at": datetime.now(tz=UTC).isoformat(),
                    "ttl_seconds": 86400,
                    "staleness": "unknown",
                    "is_stale": None,
                },
            }
        ]
    }

    renovation_mv = _store_metric_value(
        db,
        tenant_id,
        renovation_def,
        "parcel",
        str(parcel.id),
        renovation_value,
        renovation_inputs,
        renovation_prov,
    )
    insurance_mv = _store_metric_value(
        db,
        tenant_id,
        insurance_def,
        "parcel",
        str(parcel.id),
        insurance_value,
        insurance_inputs,
        insurance_prov,
    )
    db.commit()
    renovation_summary = _freshness_summary(renovation_prov["sources"])
    insurance_summary = _freshness_summary(insurance_prov["sources"])
    renovation_required = getattr(renovation_def, "required_inputs_json", None) or [
        "property_type",
        "last_sale_date",
        "neighborhood_permit_mix",
    ]
    insurance_required = getattr(insurance_def, "required_inputs_json", None) or ["parcel_geom", "flood_polygons"]
    renovation_coverage = compute_coverage_summary(
        renovation_required,
        {name: renovation_inputs.get(name, {}).get("value") for name in renovation_required},
    )
    insurance_coverage = compute_coverage_summary(
        insurance_required,
        {name: insurance_inputs.get(name, {}).get("value") for name in insurance_required},
    )
    combined_required = [f"renovation.{name}" for name in renovation_required] + [
        f"insurance.{name}" for name in insurance_required
    ]
    combined_values = {
        f"renovation.{name}": renovation_inputs.get(name, {}).get("value") for name in renovation_required
    }
    for name in insurance_required:
        combined_values[f"insurance.{name}"] = insurance_inputs.get(name, {}).get("value")
    coverage_summary = compute_coverage_summary(combined_required, combined_values)
    missing_inputs = coverage_summary["missing_required"]

    return {
        "status": "insufficient_data" if missing_inputs else "ok",
        "insufficient_data": bool(missing_inputs),
        "missing_inputs": missing_inputs,
        "coverage_summary": coverage_summary,
        "parcel_id": str(parcel.id),
        "renovation_roi": {
            "metric_key": renovation_def.key,
            "version": renovation_def.version,
            "formula_key": renovation_def.key,
            "formula_version": renovation_def.version,
            "formula_markdown": renovation_def.formula_markdown,
            "computed_at": renovation_mv.computed_at.isoformat(),
            "ttl_seconds": renovation_summary["ttl_seconds"],
            "is_stale": renovation_summary["is_stale"],
            "freshness": renovation_summary,
            "value": renovation_value,
            "inputs": renovation_inputs,
            "provenance": renovation_prov,
            "coverage_summary": renovation_coverage,
        },
        "insurance_pressure": {
            "metric_key": insurance_def.key,
            "version": insurance_def.version,
            "formula_key": insurance_def.key,
            "formula_version": insurance_def.version,
            "formula_markdown": insurance_def.formula_markdown,
            "computed_at": insurance_mv.computed_at.isoformat(),
            "ttl_seconds": insurance_summary["ttl_seconds"],
            "is_stale": insurance_summary["is_stale"],
            "freshness": insurance_summary,
            "value": insurance_value,
            "inputs": insurance_inputs,
            "provenance": insurance_prov,
            "coverage_summary": insurance_coverage,
        },
    }


def parcel_detail_metrics(db: Session, tenant_id: UUID, parcel_id: UUID) -> dict:
    parcel = db.execute(
        select(Parcel).where(Parcel.id == parcel_id, Parcel.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if not parcel:
        raise ValueError("Parcel not found")

    now = datetime.now(tz=UTC).date()
    year_ago = now - timedelta(days=365)

    permits = list(
        db.execute(
            select(Permit).where(
                Permit.tenant_id == tenant_id,
                Permit.address.ilike(f"%{parcel.address.split(' ')[0]}%"),
                case((Permit.issued_date.is_not(None), Permit.issued_date), else_=Permit.applied_date)
                >= year_ago,
            )
        ).scalars()
    )

    parcel_metric_history = list(
        db.execute(
            select(MetricValue, MetricDefinition)
            .join(MetricDefinition, MetricDefinition.id == MetricValue.metric_definition_id)
            .where(
                MetricValue.tenant_id == tenant_id,
                MetricValue.subject_type == "parcel",
                MetricValue.subject_id == str(parcel.id),
            )
            .order_by(MetricValue.computed_at.desc())
            .limit(12)
        ).all()
    )
    parcel_opportunity_events = list(
        db.execute(
            select(OpportunityEvent)
            .where(
                OpportunityEvent.tenant_id == tenant_id,
                OpportunityEvent.parcel_id == parcel.id,
            )
            .order_by(OpportunityEvent.created_at.desc())
            .limit(12)
        ).scalars()
    )

    top_types: dict[str, int] = {}
    for permit in permits:
        top_types[permit.permit_type] = top_types.get(permit.permit_type, 0) + 1

    nearest_stop_query = text(
        """
        SELECT name, COALESCE(MIN(ST_DistanceSphere((SELECT centroid FROM parcels WHERE id = :parcel_id), geom)), 99999)
        FROM transit_stops
        WHERE tenant_id = :tenant_id
        GROUP BY name
        ORDER BY 2 ASC
        LIMIT 1
        """
    )
    nearest_stop = db.execute(
        nearest_stop_query,
        {"tenant_id": str(tenant_id), "parcel_id": str(parcel.id)},
    ).first()

    poi_query = text(
        """
        SELECT category, name, ST_DistanceSphere((SELECT centroid FROM parcels WHERE id = :parcel_id), geom) AS distance_m
        FROM poi_features
        WHERE tenant_id = :tenant_id
          AND ST_DWithin((SELECT centroid FROM parcels WHERE id = :parcel_id)::geography, geom::geography, :radius)
        ORDER BY distance_m ASC
        LIMIT 20
        """
    )
    poi_rows = db.execute(
        poi_query,
        {"tenant_id": str(tenant_id), "parcel_id": str(parcel.id), "radius": 2000},
    ).fetchall()

    flood_zone_stmt = text(
        """
        SELECT zone_code
        FROM flood_zones
        WHERE tenant_id = :tenant_id
          AND ST_Intersects(geom, COALESCE((SELECT geom FROM parcels WHERE id = :parcel_id), ST_Buffer((SELECT centroid FROM parcels WHERE id = :parcel_id)::geography, 5)::geometry))
        LIMIT 1
        """
    )
    flood_zone = db.execute(flood_zone_stmt, {"tenant_id": str(tenant_id), "parcel_id": str(parcel.id)}).scalar()

    timeline_rows: list[tuple[datetime, dict]] = []
    for permit in permits:
        event_date = permit.issued_date or permit.applied_date or permit.final_date
        if not event_date:
            continue
        occurred = datetime.combine(event_date, datetime.min.time(), tzinfo=UTC)
        timeline_rows.append(
            (
                occurred,
                {
                    "event_type": "permit",
                    "occurred_at": occurred.isoformat(),
                    "title": f"{permit.permit_type} permit",
                    "details": {
                        "status": permit.status,
                        "permit_subtype": permit.permit_subtype,
                        "external_id": permit.external_id,
                    },
                },
            )
        )

    for metric_value, definition in parcel_metric_history:
        timeline_rows.append(
            (
                metric_value.computed_at,
                {
                    "event_type": "insight",
                    "occurred_at": metric_value.computed_at.isoformat(),
                    "title": definition.name,
                    "details": {
                        "metric_key": definition.key,
                        "version": definition.version,
                        "value": metric_value.value_json,
                    },
                },
            )
        )

    for event in parcel_opportunity_events:
        timeline_rows.append(
            (
                event.created_at,
                {
                    "event_type": "opportunity_event",
                    "occurred_at": event.created_at.isoformat(),
                    "title": event.event_type.replace("_", " "),
                    "details": {
                        "severity": event.severity,
                        "payload": event.details_json,
                    },
                },
            )
        )

    timeline_rows.sort(key=lambda item: item[0], reverse=True)
    timeline = [item[1] for item in timeline_rows[:20]]

    return {
        "permits_summary": {
            "last_12_months_count": len(permits),
            "top_types": top_types,
        },
        "flood_zone": {
            "intersects": bool(flood_zone),
            "zone_code": flood_zone,
        },
        "nearby_pois": [
            {"category": row[0], "name": row[1], "distance_meters": round(float(row[2]), 2)} for row in poi_rows
        ],
        "transit_proximity": {
            "nearest_stop": nearest_stop[0] if nearest_stop else None,
            "distance_meters": round(float(nearest_stop[1]), 2) if nearest_stop else None,
            "score_0_100": max(0, round(100 - ((float(nearest_stop[1]) if nearest_stop else 99999) / 40), 2)),
        },
        "timeline": timeline,
    }
