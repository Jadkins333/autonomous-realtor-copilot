from __future__ import annotations

import asyncio
import logging
import random
from hashlib import sha256
from datetime import UTC, date, datetime, timedelta
from typing import Any, Awaitable, Callable

from geoalchemy2.shape import from_shape
from pydantic import BaseModel, ValidationError
from shapely.geometry import MultiPolygon, Point, Polygon
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.integrations.arcgis.client import ArcGISFeatureServiceClient
from app.integrations.auditor.client import JsonRestConnector
from app.integrations.gtfs.client import GTFSClient
from app.integrations.overpass.client import OverpassClient
from app.models.entities import (
    FloodZone,
    Parcel,
    Permit,
    PoiFeature,
    ProvenanceRecord,
    SchemaDriftDLQ,
    Source,
    SourceRun,
    TransitStop,
)
from app.models.enums import SourceMode, SourceRunStatus, SourceState
from app.services.seed_loader import load_seed_json
from app.services.source_ops import (
    ensure_source_status_defaults,
    get_or_create_source_status,
    list_source_status,
    pause_source,
    recompute_source_dlq_count,
    recompute_source_dlq_count_by_source_id,
    resume_source,
    touch_source_status_finish,
    touch_source_status_start,
)
from app.utils.circuit_breaker import CircuitBreaker
from app.utils.hash import stable_hash

logger = logging.getLogger(__name__)
settings = get_settings()

BREAKERS = {
    "franklin_auditor": CircuitBreaker(),
    "columbus_permits": CircuitBreaker(),
    "fema_nfhl": CircuitBreaker(),
    "osm_overpass": CircuitBreaker(),
    "cota_gtfs": CircuitBreaker(),
}

CONNECTOR_SOURCE_NAMES = (
    "franklin_auditor",
    "columbus_arcgis_permits",
    "fema_nfhl",
    "osm_overpass",
    "cota_gtfs",
)
PAYLOAD_VERSION = "v1"
RETRY_MAX_ATTEMPTS = 3
RETRY_BASE_DELAY_SECONDS = 0.2
RETRY_JITTER_SECONDS = 0.25


class ParcelPayload(BaseModel):
    external_id: str
    parcel_number: str
    address: str
    city: str
    state: str
    zip: str
    attributes_json: dict
    lon: float | None = None
    lat: float | None = None


class PermitPayload(BaseModel):
    external_id: str
    address: str
    permit_type: str
    permit_subtype: str | None = None
    status: str
    applied_date: date | None = None
    issued_date: date | None = None
    final_date: date | None = None
    lon: float | None = None
    lat: float | None = None


class FloodZonePayload(BaseModel):
    external_id: str
    zone_code: str
    coordinates: list


class PoiPayload(BaseModel):
    external_id: str
    category: str
    name: str
    lon: float
    lat: float


class TransitPayload(BaseModel):
    external_id: str
    name: str
    lon: float
    lat: float


def _get_or_create_source(db: Session, name: str, base_url: str, ttl_seconds: int = 86400) -> Source:
    source = db.execute(select(Source).where(Source.name == name)).scalar_one_or_none()
    if source:
        return source
    source = Source(name=name, base_url=base_url, default_ttl_seconds=ttl_seconds, license_notes="public")
    db.add(source)
    db.flush()
    return source


def _start_source_run(db: Session, source_id) -> SourceRun:
    run = SourceRun(source_id=source_id, status=SourceRunStatus.success, started_at=datetime.now(tz=UTC))
    db.add(run)
    db.flush()
    return run


def _finish_source_run(db: Session, run: SourceRun, status: SourceRunStatus, error_text: str | None) -> None:
    run.status = status
    run.error_text = error_text
    run.finished_at = datetime.now(tz=UTC)


def _dlq_dedupe_key(source_name: str, external_id: str, event_type: str, payload_version: str) -> str:
    # Dedupe policy during drift: source + external id + event type + normalized payload version.
    packed = f"{source_name}|{external_id}|{event_type}|{payload_version}".encode("utf-8")
    return sha256(packed).hexdigest()


def _record_schema_drift(
    db: Session,
    *,
    source: Source,
    raw_url: str,
    raw_json: dict,
    error_text: str,
    external_id: str,
    event_type: str = "schema_validation_error",
    payload_version: str = PAYLOAD_VERSION,
) -> bool:
    dedupe_key = _dlq_dedupe_key(source.name, external_id, event_type, payload_version)
    exists = db.execute(select(SchemaDriftDLQ).where(SchemaDriftDLQ.dedupe_key == dedupe_key)).scalar_one_or_none()
    if exists:
        return False
    db.add(
        SchemaDriftDLQ(
            source_id=source.id,
            raw_url=raw_url,
            external_id=external_id,
            event_type=event_type,
            payload_version=payload_version,
            dedupe_key=dedupe_key,
            raw_json=raw_json,
            error_text=error_text,
        )
    )
    return True


def _upsert_provenance(
    db: Session,
    source: Source,
    external_id: str,
    raw_url: str,
    raw_json: dict,
) -> tuple[ProvenanceRecord, bool]:
    hashed = stable_hash(raw_json)
    latest_stmt = (
        select(ProvenanceRecord)
        .where(
            ProvenanceRecord.source_id == source.id,
            ProvenanceRecord.external_id == external_id,
        )
        .order_by(ProvenanceRecord.fetched_at.desc())
        .limit(1)
    )
    latest = db.execute(latest_stmt).scalar_one_or_none()

    if latest and latest.raw_hash == hashed:
        if datetime.now(tz=UTC) - latest.fetched_at < timedelta(seconds=latest.ttl_seconds):
            return latest, True

    provenance = ProvenanceRecord(
        source_id=source.id,
        external_id=external_id,
        fetched_at=datetime.now(tz=UTC),
        raw_url=raw_url,
        raw_hash=hashed,
        ttl_seconds=source.default_ttl_seconds,
        raw_json=raw_json,
    )
    db.add(provenance)
    db.flush()
    return provenance, False


def _upsert_parcel(db: Session, tenant_id, item: ParcelPayload, provenance_id) -> None:
    row = db.execute(
        select(Parcel).where(Parcel.tenant_id == tenant_id, Parcel.parcel_number == item.parcel_number)
    ).scalar_one_or_none()
    geom_point = None
    if item.lon is not None and item.lat is not None:
        geom_point = from_shape(Point(item.lon, item.lat), srid=4326)

    if not row:
        row = Parcel(
            tenant_id=tenant_id,
            parcel_number=item.parcel_number,
            address=item.address,
            city=item.city,
            state=item.state,
            zip=item.zip,
            centroid=geom_point,
            attributes_json=item.attributes_json,
            provenance_id=provenance_id,
            updated_at=datetime.now(tz=UTC),
        )
        db.add(row)
        return

    row.address = item.address
    row.city = item.city
    row.state = item.state
    row.zip = item.zip
    row.centroid = geom_point
    row.attributes_json = item.attributes_json
    row.provenance_id = provenance_id
    row.updated_at = datetime.now(tz=UTC)


def _upsert_permit(db: Session, tenant_id, item: PermitPayload, provenance_id) -> None:
    row = db.execute(
        select(Permit).where(Permit.tenant_id == tenant_id, Permit.external_id == item.external_id)
    ).scalar_one_or_none()
    point = None
    if item.lon is not None and item.lat is not None:
        point = from_shape(Point(item.lon, item.lat), srid=4326)

    linked_parcel = db.execute(
        select(Parcel).where(
            Parcel.tenant_id == tenant_id,
            Parcel.address.ilike(f"%{item.address[:24]}%"),
        )
    ).scalar_one_or_none()

    if not row:
        row = Permit(
            tenant_id=tenant_id,
            external_id=item.external_id,
            parcel_id=linked_parcel.id if linked_parcel else None,
            address=item.address,
            permit_type=item.permit_type,
            permit_subtype=item.permit_subtype,
            status=item.status,
            applied_date=item.applied_date,
            issued_date=item.issued_date,
            final_date=item.final_date,
            geom=point,
            raw_json=item.model_dump(mode="json"),
            provenance_id=provenance_id,
        )
        db.add(row)
        return

    row.parcel_id = linked_parcel.id if linked_parcel else row.parcel_id
    row.address = item.address
    row.permit_type = item.permit_type
    row.permit_subtype = item.permit_subtype
    row.status = item.status
    row.applied_date = item.applied_date
    row.issued_date = item.issued_date
    row.final_date = item.final_date
    row.geom = point
    row.raw_json = item.model_dump(mode="json")
    row.provenance_id = provenance_id


def _upsert_flood_zone(db: Session, tenant_id, item: FloodZonePayload, provenance_id) -> None:
    polygons = []
    for ring_group in item.coordinates:
        if not ring_group:
            continue
        outer = ring_group[0]
        if len(outer) < 4:
            continue
        polygons.append(Polygon(outer))
    if not polygons:
        raise ValueError("No polygon coordinates")

    multi = from_shape(MultiPolygon(polygons), srid=4326)

    row = db.execute(
        select(FloodZone).where(FloodZone.tenant_id == tenant_id, FloodZone.external_id == item.external_id)
    ).scalar_one_or_none()
    if not row:
        db.add(
            FloodZone(
                tenant_id=tenant_id,
                external_id=item.external_id,
                zone_code=item.zone_code,
                geom=multi,
                raw_json=item.model_dump(mode="json"),
                provenance_id=provenance_id,
            )
        )
        return

    row.zone_code = item.zone_code
    row.geom = multi
    row.raw_json = item.model_dump(mode="json")
    row.provenance_id = provenance_id


def _upsert_poi(db: Session, tenant_id, item: PoiPayload, provenance_id) -> None:
    row = db.execute(
        select(PoiFeature).where(PoiFeature.tenant_id == tenant_id, PoiFeature.name == item.name)
    ).scalar_one_or_none()
    point = from_shape(Point(item.lon, item.lat), srid=4326)

    if not row:
        db.add(
            PoiFeature(
                tenant_id=tenant_id,
                category=item.category,
                name=item.name,
                geom=point,
                raw_json=item.model_dump(mode="json"),
                provenance_id=provenance_id,
            )
        )
        return

    row.category = item.category
    row.geom = point
    row.raw_json = item.model_dump(mode="json")
    row.provenance_id = provenance_id


def _upsert_transit_stop(db: Session, tenant_id, item: TransitPayload, provenance_id) -> None:
    row = db.execute(
        select(TransitStop).where(
            TransitStop.tenant_id == tenant_id,
            TransitStop.external_id == item.external_id,
        )
    ).scalar_one_or_none()
    point = from_shape(Point(item.lon, item.lat), srid=4326)

    if not row:
        db.add(
            TransitStop(
                tenant_id=tenant_id,
                external_id=item.external_id,
                name=item.name,
                geom=point,
                raw_json=item.model_dump(mode="json"),
                provenance_id=provenance_id,
            )
        )
        return

    row.name = item.name
    row.geom = point
    row.raw_json = item.model_dump(mode="json")
    row.provenance_id = provenance_id


async def _process_rows(
    db: Session,
    tenant_id,
    source: Source,
    raw_url_base: str,
    rows: list[dict[str, Any]],
    validator: Callable[[dict[str, Any]], BaseModel],
    upserter: Callable[[Session, Any, BaseModel, Any], None],
) -> tuple[int, int, int]:
    ingested = 0
    skipped = 0
    drift_count = 0
    for raw in rows:
        external_id = str(raw.get("external_id") or raw.get("id") or raw.get("parcel_number") or "unknown")
        raw_url = f"{raw_url_base}#{external_id}"
        try:
            item = validator(raw)
        except ValidationError as exc:
            if _record_schema_drift(
                db,
                source=source,
                raw_url=raw_url,
                raw_json=raw,
                error_text=str(exc),
                external_id=external_id,
                event_type="schema_validation_error",
            ):
                drift_count += 1
            continue

        provenance, was_skipped = _upsert_provenance(db, source, external_id, raw_url, raw)
        if was_skipped:
            skipped += 1
            continue

        try:
            upserter(db, tenant_id, item, provenance.id)
            ingested += 1
        except Exception as exc:  # noqa: BLE001
            if _record_schema_drift(
                db,
                source=source,
                raw_url=raw_url,
                raw_json=raw,
                error_text=str(exc),
                external_id=external_id,
                event_type="upsert_error",
            ):
                drift_count += 1
    return ingested, skipped, drift_count


def _validate(model_cls):
    def _inner(payload: dict[str, Any]):
        return model_cls.model_validate(payload)

    return _inner


async def _retry_with_jitter(
    fetch_live: Callable[[], Awaitable[list[dict[str, Any]]]],
    *,
    source_label: str,
    max_attempts: int = RETRY_MAX_ATTEMPTS,
    base_delay_seconds: float = RETRY_BASE_DELAY_SECONDS,
    jitter_seconds: float = RETRY_JITTER_SECONDS,
) -> list[dict[str, Any]]:
    attempt = 1
    while True:
        try:
            return await fetch_live()
        except Exception: # noqa: BLE001
            if attempt >= max_attempts:
                raise
            backoff = base_delay_seconds * (2 ** (attempt - 1))
            jitter = random.uniform(0, jitter_seconds)
            delay = backoff + jitter
            logger.warning(
                "ingest_live_fetch_retry",
                extra={
                 "source": source_label,
                 "attempt": attempt,
                 "max_attempts": max_attempts,
                 "delay_seconds": round(delay, 3),
                },
            )
            await asyncio.sleep(delay)
            attempt += 1

async def run_ingestion(db: Session, tenant_id) -> dict:
    summary: dict[str, Any] = {"sources": {}}

    auditor_source = _get_or_create_source(
        db,
        "franklin_auditor",
        settings.franklin_auditor_base_url,
        ttl_seconds=86400,
    )
    permits_source = _get_or_create_source(
        db,
        "columbus_arcgis_permits",
        settings.columbus_arcgis_base_url,
        ttl_seconds=43200,
    )
    flood_source = _get_or_create_source(
        db,
        "fema_nfhl",
        settings.fema_nfhl_arcgis_url or "seed://fema_nfhl",
        ttl_seconds=86400,
    )
    overpass_source = _get_or_create_source(db, "osm_overpass", settings.overpass_url, ttl_seconds=21600)
    gtfs_source = _get_or_create_source(db, "cota_gtfs", settings.gtfs_url or "seed://cota_gtfs", ttl_seconds=86400)

    ensure_source_status_defaults(db, CONNECTOR_SOURCE_NAMES)
    db.flush()

    async def run_connector(
        label: str,
        source: Source,
        fetch_live,
        seed_filename: str,
        validator,
        upserter,
        fallback_status: SourceRunStatus = SourceRunStatus.partial,
    ):
        run = _start_source_run(db, source.id)
        status_row = touch_source_status_start(db, source.name)
        breaker = BREAKERS[label]
        rows: list[dict[str, Any]] = []
        status = SourceRunStatus.success
        error_text = None
        used_seed = False
        drift_detected = False
        drift_reason = None

        if status_row.state == SourceState.paused:
            reason = status_row.paused_reason or "source paused"
            _record_schema_drift(
                db,
                source=source,
                raw_url=f"{source.base_url}#paused",
                raw_json={"source": source.name, "reason": reason},
                error_text=f"Source paused: {reason}",
                external_id="source_paused",
                event_type="paused_drift_skip" if status_row.drift_detected else "paused_manual_skip",
            )
            recompute_source_dlq_count_by_source_id(db, source.name, source.id)
            status = SourceRunStatus.partial
            error_text = f"Source paused: {reason}"
            _finish_source_run(db, run, status, error_text)
            touch_source_status_finish(
                db,
                source.name,
                mode=SourceMode.fixture,
                run_status=status,
                error_text=error_text,
                drift_detected=status_row.drift_detected,
                drift_reason=status_row.drift_reason,
                source_id=source.id,
            )
            summary["sources"][label] = {
                "status": status.value,
                "ingested": 0,
                "skipped": 0,
                "used_seed": True,
                "seed_missing": False,
                "error": error_text,
                "mode": SourceMode.fixture.value,
                "drift_detected": status_row.drift_detected,
                "paused_reason": reason,
            }
            return

        if not breaker.allow():
            rows = load_seed_json(seed_filename)
            status = fallback_status
            error_text = "Circuit breaker open; using seed data"
            used_seed = True
            logger.warning(
                "ingest_circuit_breaker_open_using_seed",
                extra={"source": label, "seed_file": seed_filename},
            )
        else:
            try:
                rows = await _retry_with_jitter(fetch_live, source_label=label)
                breaker.success()
                logger.info(
                    "ingest_live_fetch_success",
                    extra={"source": label, "row_count": len(rows), "base_url": source.base_url},
                )
            except Exception as exc:  # noqa: BLE001
                breaker.failure()
                rows = load_seed_json(seed_filename)
                status = fallback_status if rows else SourceRunStatus.failure
                error_text = f"Live source unavailable: {exc}"
                used_seed = True
                logger.warning(
                    "ingest_live_fetch_failed_using_seed",
                    extra={
                        "source": label,
                        "error": str(exc),
                        "seed_file": seed_filename,
                        "seed_rows": len(rows),
                    },
                )

        if used_seed and not rows:
            logger.error(
                "ingest_seed_missing_insufficient_data",
                extra={"source": label, "seed_file": seed_filename},
            )
            error_text = (error_text + " | seed missing") if error_text else "Seed missing"
            status = SourceRunStatus.failure

        ingested, skipped, drift_count = await _process_rows(
            db,
            tenant_id,
            source,
            source.base_url,
            rows,
            validator,
            upserter,
        )
        if drift_count > 0:
            drift_detected = True
            drift_reason = f"schema drift detected ({drift_count} new DLQ item(s))"
            status = SourceRunStatus.failure
            error_text = drift_reason

        if status == SourceRunStatus.success and ingested == 0 and skipped > 0:
            status = SourceRunStatus.partial
        _finish_source_run(db, run, status, error_text)
        mode = SourceMode.fixture if used_seed else SourceMode.live
        touch_source_status_finish(
            db,
            source.name,
            mode=mode,
            run_status=status,
            error_text=error_text,
            drift_detected=drift_detected,
            drift_reason=drift_reason,
            source_id=source.id,
        )
        summary["sources"][label] = {
            "status": status.value,
            "ingested": ingested,
            "skipped": skipped,
            "used_seed": used_seed,
            "seed_missing": bool(used_seed and not rows),
            "error": error_text,
            "mode": mode.value,
            "drift_detected": drift_detected,
        }

    auditor_client = JsonRestConnector(
        settings.franklin_auditor_base_url,
        settings.franklin_auditor_path_by_address,
    )

    async def fetch_auditor() -> list[dict[str, Any]]:
        records = await auditor_client.fetch("Columbus")
        normalized = []
        for row in records:
            normalized.append(
                {
                    "external_id": str(row.get("id") or row.get("parcelId") or row.get("parcel_number")),
                    "parcel_number": str(row.get("parcel_number") or row.get("parcelNumber") or ""),
                    "address": row.get("address") or row.get("siteAddress") or "",
                    "city": row.get("city") or "Columbus",
                    "state": row.get("state") or "OH",
                    "zip": row.get("zip") or row.get("zipCode") or "43215",
                    "lon": row.get("lon") or row.get("longitude"),
                    "lat": row.get("lat") or row.get("latitude"),
                    "attributes_json": row,
                }
            )
        return normalized

    await run_connector(
        "franklin_auditor",
        auditor_source,
        fetch_auditor,
        "parcels.json",
        _validate(ParcelPayload),
        _upsert_parcel,
    )

    async def fetch_permits() -> list[dict[str, Any]]:
        if not settings.columbus_permits_layer_path:
            raise RuntimeError("No permits layer path configured")
        client = ArcGISFeatureServiceClient(
            f"{settings.columbus_arcgis_base_url.rstrip('/')}/{settings.columbus_permits_layer_path.strip('/')}"
        )
        features = await client.query(where="1=1", result_record_count=250)
        normalized = []
        for f in features:
            attrs = f.get("attributes", {})
            geom = f.get("geometry", {})
            normalized.append(
                {
                    "external_id": str(attrs.get("OBJECTID") or attrs.get("id")),
                    "address": attrs.get("ADDRESS") or attrs.get("address") or "",
                    "permit_type": attrs.get("PERMITTYPE") or attrs.get("permit_type") or "Unknown",
                    "permit_subtype": attrs.get("PERMITSUBTYPE") or attrs.get("permit_subtype"),
                    "status": attrs.get("STATUS") or attrs.get("status") or "unknown",
                    "applied_date": attrs.get("APPLIED_DATE") or attrs.get("applied_date"),
                    "issued_date": attrs.get("ISSUED_DATE") or attrs.get("issued_date"),
                    "final_date": attrs.get("FINAL_DATE") or attrs.get("final_date"),
                    "lon": geom.get("x"),
                    "lat": geom.get("y"),
                }
            )
        return normalized

    await run_connector(
        "columbus_permits",
        permits_source,
        fetch_permits,
        "permits.json",
        _validate(PermitPayload),
        _upsert_permit,
    )

    async def fetch_flood() -> list[dict[str, Any]]:
        if not settings.fema_nfhl_arcgis_url:
            raise RuntimeError("FEMA_NFHL_ARCGIS_URL not configured")
        client = ArcGISFeatureServiceClient(settings.fema_nfhl_arcgis_url)
        features = await client.query(where="1=1", result_record_count=150)
        normalized = []
        for f in features:
            attrs = f.get("attributes", {})
            geom = f.get("geometry", {})
            rings = geom.get("rings", [])
            normalized.append(
                {
                    "external_id": str(attrs.get("OBJECTID") or attrs.get("id")),
                    "zone_code": attrs.get("FLD_ZONE") or attrs.get("zone_code") or "UNKNOWN",
                    "coordinates": [rings] if rings else [],
                }
            )
        return normalized

    await run_connector(
        "fema_nfhl",
        flood_source,
        fetch_flood,
        "flood_zones.json",
        _validate(FloodZonePayload),
        _upsert_flood_zone,
    )

    overpass_client = OverpassClient(settings.overpass_url)

    async def fetch_pois() -> list[dict[str, Any]]:
        elements = await overpass_client.query_pois(39.9612, -82.9988)
        normalized = []
        for item in elements:
            tags = item.get("tags", {})
            category = tags.get("amenity", "unknown")
            if category == "supermarket":
                category = "grocery"
            if category not in {"cafe", "park", "grocery"}:
                continue
            normalized.append(
                {
                    "external_id": str(item.get("id")),
                    "category": "coffee" if category == "cafe" else category,
                    "name": tags.get("name") or f"{category}-{item.get('id')}",
                    "lon": item.get("lon"),
                    "lat": item.get("lat"),
                }
            )
        return normalized

    await run_connector(
        "osm_overpass",
        overpass_source,
        fetch_pois,
        "pois.json",
        _validate(PoiPayload),
        _upsert_poi,
    )

    async def fetch_gtfs() -> list[dict[str, Any]]:
        if not settings.gtfs_url:
            raise RuntimeError("GTFS_URL not configured")
        client = GTFSClient(settings.gtfs_url)
        rows = await client.fetch_stops()
        return [
            {
                "external_id": str(row.get("stop_id")),
                "name": row.get("stop_name") or "Unknown Stop",
                "lon": float(row.get("stop_lon")),
                "lat": float(row.get("stop_lat")),
            }
            for row in rows
            if row.get("stop_id") and row.get("stop_lat") and row.get("stop_lon")
        ]

    await run_connector(
        "cota_gtfs",
        gtfs_source,
        fetch_gtfs,
        "transit_stops.json",
        _validate(TransitPayload),
        _upsert_transit_stop,
    )

    db.commit()
    logger.info("ingestion_run_complete", extra={"summary": summary})
    return summary


def get_sources_status(db: Session) -> list[dict[str, Any]]:
    ensure_source_status_defaults(db, CONNECTOR_SOURCE_NAMES)
    rows = list_source_status(db)
    payload = []
    for row in rows:
        is_stale = row.mode == SourceMode.fixture or row.state in {
            SourceState.partial,
            SourceState.failed,
            SourceState.paused,
        }
        reachable = None if row.mode == SourceMode.fixture else row.state == SourceState.ok
        payload.append(
            {
                "source_name": row.source_name,
                "mode": row.mode.value,
                "state": row.state.value,
                "reachable": reachable,
                "is_stale": is_stale,
                "last_run_started_at": row.last_run_started_at.isoformat() if row.last_run_started_at else None,
                "last_run_finished_at": row.last_run_finished_at.isoformat() if row.last_run_finished_at else None,
                "last_success_at": row.last_success_at.isoformat() if row.last_success_at else None,
                "last_error": row.last_error,
                "drift_detected": row.drift_detected,
                "drift_reason": row.drift_reason,
                "dlq_count": row.dlq_count,
                "paused_reason": row.paused_reason,
                "updated_at": row.updated_at.isoformat(),
            }
        )
    return payload


def set_source_pause(db: Session, source_name: str, reason: str) -> dict[str, Any]:
    row = pause_source(db, source_name=source_name, reason=reason)
    db.commit()
    return {
        "source_name": row.source_name,
        "state": row.state.value,
        "paused_reason": row.paused_reason,
    }


def set_source_resume(db: Session, source_name: str) -> dict[str, Any]:
    row = resume_source(db, source_name=source_name)
    recompute_source_dlq_count(db, source_name)
    db.commit()
    return {
        "source_name": row.source_name,
        "state": row.state.value,
        "paused_reason": row.paused_reason,
    }


def _replay_config_for_source(source_name: str):
    if source_name == "franklin_auditor":
        return _validate(ParcelPayload), _upsert_parcel
    if source_name == "columbus_arcgis_permits":
        return _validate(PermitPayload), _upsert_permit
    if source_name == "fema_nfhl":
        return _validate(FloodZonePayload), _upsert_flood_zone
    if source_name == "osm_overpass":
        return _validate(PoiPayload), _upsert_poi
    if source_name == "cota_gtfs":
        return _validate(TransitPayload), _upsert_transit_stop
    raise ValueError(f"Unsupported source '{source_name}'")


def replay_source_dlq(db: Session, tenant_id, source_name: str) -> dict[str, Any]:
    source = db.execute(select(Source).where(Source.name == source_name)).scalar_one_or_none()
    if source is None:
        raise ValueError(f"Unknown source '{source_name}'")

    status_row = get_or_create_source_status(db, source_name)
    if status_row.drift_detected:
        return {
            "ok": False,
            "message": "Replay blocked: drift_detected=true. Resolve drift and resume source first.",
            "attempted": 0,
            "succeeded": 0,
            "failed": 0,
            "skipped_duplicate": 0,
        }
    if status_row.state == SourceState.paused:
        return {
            "ok": False,
            "message": "Replay blocked: source is paused. Resume source first.",
            "attempted": 0,
            "succeeded": 0,
            "failed": 0,
            "skipped_duplicate": 0,
        }

    validator, upserter = _replay_config_for_source(source_name)
    dlq_rows = list(
        db.execute(select(SchemaDriftDLQ).where(SchemaDriftDLQ.source_id == source.id).order_by(SchemaDriftDLQ.occurred_at.asc())).scalars()
    )

    attempted = 0
    succeeded = 0
    failed = 0
    skipped_duplicate = 0

    for item in dlq_rows:
        attempted += 1
        if item.last_replayed_at is not None:
            skipped_duplicate += 1
            continue

        try:
            model = validator(item.raw_json)
            external_id = str(model.model_dump(mode="python").get("external_id") or item.external_id or "unknown")
            provenance, was_skipped = _upsert_provenance(
                db=db,
                source=source,
                external_id=external_id,
                raw_url=item.raw_url,
                raw_json=item.raw_json,
            )
            if was_skipped:
                skipped_duplicate += 1
            else:
                upserter(db, tenant_id, model, provenance.id)
                succeeded += 1
            item.replay_count += 1
            item.last_replayed_at = datetime.now(tz=UTC)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            item.error_text = f"{item.error_text} | replay_error: {exc}"

    recompute_source_dlq_count_by_source_id(db, source_name, source.id)
    db.commit()
    return {
        "ok": True,
        "message": "Replay completed",
        "attempted": attempted,
        "succeeded": succeeded,
        "failed": failed,
        "skipped_duplicate": skipped_duplicate,
    }







