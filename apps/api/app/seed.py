from __future__ import annotations

import asyncio
import os
import uuid
from datetime import UTC, date, datetime

from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Point, Polygon
from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import (
    ConsentEvent,
    Contact,
    FloodZone,
    Message,
    MetricDefinition,
    Parcel,
    Permit,
    PoiFeature,
    ProvenanceRecord,
    Sequence,
    SequenceStep,
    Source,
    Tenant,
    TransitStop,
    User,
)
from app.models.enums import (
    Channel,
    ConsentStatus,
    MessageDirection,
    MessageStatus,
    SourceOrigin,
    UserRole,
)
from app.services.disclosures import ensure_disclosure_configuration
from app.services.ingestion import run_ingestion
from app.services.seed_loader import load_seed_json
from app.utils.hash import stable_hash
from app.utils.security import get_password_hash

settings = get_settings()


def _truthy_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _ensure_tenant_and_user(db):
    tenant = db.execute(select(Tenant).where(Tenant.name == settings.default_tenant_name)).scalar_one_or_none()
    if not tenant:
        tenant = Tenant(name=settings.default_tenant_name)
        db.add(tenant)
        db.flush()

    user = db.execute(
        select(User).where(User.tenant_id == tenant.id, User.email == settings.demo_user_email)
    ).scalar_one_or_none()
    if not user:
        user = User(
            tenant_id=tenant.id,
            email=settings.demo_user_email,
            name="Demo Agent",
            password_hash=get_password_hash(settings.demo_user_password),
            role=UserRole.admin,
        )
        db.add(user)

    ensure_disclosure_configuration(db, tenant.id, "OH")
    return tenant, user


def _ensure_metric_definitions(db):
    definitions = [
        {
            "key": "micro_market_nowcast_v1",
            "name": "Micro Market Nowcast",
            "version": "v1",
            "required_inputs_json": [
                "permits_per_100_parcels_90d",
                "poi_density_per_km2",
                "rate_series_delta_bps_90d",
            ],
            "formula_markdown": (
                "`permits_score = clamp(permits_per_100_parcels_90d * 10, 0, 100)`\n"
                "`poi_score = clamp(poi_density_per_km2 * 5, 0, 100)`\n"
                "`rates_score = clamp(50 - (rate_series_delta_bps_90d / 10), 0, 100)`\n"
                "`score = round(clamp(permits_score*0.5 + poi_score*0.3 + rates_score*0.2, 0, 100), 1)`"
            ),
        },
        {
            "key": "marketing_package_health_v1",
            "name": "Marketing Package Health",
            "version": "v1",
            "required_inputs_json": [
                "photo_count",
                "min_resolution_short_side",
                "rooms_covered",
                "description_text",
            ],
            "formula_markdown": (
                "`score = completeness(40) + copy_richness(30) - compliance_penalty(up to 30)`\n"
                "completeness uses photo count, min short-side resolution, and rooms covered."
            ),
        },
        {
            "key": "renovation_roi_v1",
            "name": "Renovation ROI Band",
            "version": "v1",
            "required_inputs_json": ["property_type", "last_sale_date", "neighborhood_permit_mix"],
            "formula_markdown": (
                "Rule-based banding using property type + neighborhood permit mix. "
                "Outputs qualitative ranges only (no dollar claims)."
            ),
        },
        {
            "key": "insurance_pressure_v1",
            "name": "Insurance Pressure",
            "version": "v1",
            "required_inputs_json": ["parcel_geom", "flood_polygons"],
            "formula_markdown": (
                "Flood intersection + nearest flood polygon distance -> pressure level with uncertainty note."
            ),
        },
        {
            "key": "negotiation_motivation_v1",
            "name": "Negotiation Motivation",
            "version": "v1",
            "required_inputs_json": [
                "days_since_last_sale",
                "open_violations_count",
                "permit_activity_last_90d_count",
            ],
            "formula_markdown": (
                "`score = 0`\n"
                "`+25 if open_violations_count >= 3`\n"
                "`+15 if open_violations_count in [1,2]`\n"
                "`+20 if permit_activity_last_90d_count >= 2`\n"
                "`+10 if permit_activity_last_90d_count == 1`\n"
                "`+25 if days_since_last_sale >= 3650`\n"
                "`+15 if days_since_last_sale in [1825..3649]`\n"
                "then clamp score to 0..100."
            ),
        },
    ]

    for item in definitions:
        exists = db.execute(
            select(MetricDefinition).where(
                MetricDefinition.key == item["key"], MetricDefinition.version == item["version"]
            )
        ).scalar_one_or_none()
        if not exists:
            db.add(MetricDefinition(**item))
            continue
        exists.name = item["name"]
        exists.formula_markdown = item["formula_markdown"]
        exists.required_inputs_json = item["required_inputs_json"]


def _ensure_contacts_and_consents(db, tenant_id):
    seed_contacts = [
        {
            "name": "Ava Thompson",
            "email": "ava@example.com",
            "phone": "+16145550101",
            "timezone": "America/New_York",
            "tags_json": ["buyer", "north_columbus"],
            "notes": "Prefers SMS updates",
        },
        {
            "name": "Noah Patel",
            "email": "noah@example.com",
            "phone": "+16145550102",
            "timezone": "America/New_York",
            "tags_json": ["seller", "clintonville"],
            "notes": "Considering listing this spring",
        },
        {
            "name": "Mia Chen",
            "email": "mia@example.com",
            "phone": "+16145550103",
            "timezone": "America/New_York",
            "tags_json": ["investor"],
            "notes": "Interested in rehab opportunities",
        },
    ]

    for payload in seed_contacts:
        contact = db.execute(
            select(Contact).where(Contact.tenant_id == tenant_id, Contact.email == payload["email"])
        ).scalar_one_or_none()
        if not contact:
            contact = Contact(tenant_id=tenant_id, **payload)
            db.add(contact)
            db.flush()
        elif not contact.timezone and payload.get("timezone"):
            contact.timezone = payload["timezone"]

        has_sms_opt_in = db.execute(
            select(ConsentEvent).where(
                ConsentEvent.tenant_id == tenant_id,
                ConsentEvent.contact_id == contact.id,
                ConsentEvent.channel == Channel.sms,
                ConsentEvent.status == ConsentStatus.opt_in,
            )
        ).scalar_one_or_none()
        if not has_sms_opt_in:
            db.add(
                ConsentEvent(
                    tenant_id=tenant_id,
                    contact_id=contact.id,
                    channel=Channel.sms,
                    status=ConsentStatus.opt_in,
                    consent_text="I agree to receive SMS updates.",
                    source="seed",
                    capture_method="seed_demo",
                    policy_text_version="demo-sms-consent-v1",
                    proof_artifact_ref=f"seed://consent/{contact.id}/sms",
                    jurisdiction_assumptions_json={"state": "OH"},
                    ip_address="127.0.0.1",
                    user_agent="seed-script",
                )
            )
        has_email_opt_in = db.execute(
            select(ConsentEvent).where(
                ConsentEvent.tenant_id == tenant_id,
                ConsentEvent.contact_id == contact.id,
                ConsentEvent.channel == Channel.email,
                ConsentEvent.status == ConsentStatus.opt_in,
            )
        ).scalar_one_or_none()
        if not has_email_opt_in:
            db.add(
                ConsentEvent(
                    tenant_id=tenant_id,
                    contact_id=contact.id,
                    channel=Channel.email,
                    status=ConsentStatus.opt_in,
                    consent_text="I agree to receive email updates.",
                    source="seed",
                    capture_method="seed_demo",
                    policy_text_version="demo-email-consent-v1",
                    proof_artifact_ref=f"seed://consent/{contact.id}/email",
                    jurisdiction_assumptions_json={"state": "OH"},
                    ip_address="127.0.0.1",
                    user_agent="seed-script",
                )
            )


def _ensure_sequences(db, tenant_id):
    sequence_templates = [
        ("new_lead", "New Lead Welcome", "First-touch intro for new inbound leads"),
        ("open_house_followup", "Open House Follow-up", "Post open-house thank-you and next steps"),
        ("post_showing", "Post Showing Check-in", "Feedback and decision support after showing"),
        ("seller_nurture", "Seller Nurture", "Keep prospective sellers warm with market notes"),
        ("expired_listing", "Expired Listing Re-engage", "Reintroduce support after listing expiration"),
        ("referral_ask", "Referral Ask", "Request referrals after successful close"),
        ("price_drop_alert", "Price Drop Alert", "Notify relevant contacts about nearby price drops"),
        ("permit_trigger_update", "Permit Trigger Neighborhood Update", "Send neighborhood permit trend updates"),
        ("annual_checkin", "Annual Home Check-in", "Annual touchpoint with value and maintenance notes"),
        ("similar_homes_followup", "Similar Homes Follow-up", "Recommend similar homes based on interest"),
    ]

    for key, name, description in sequence_templates:
        seq = db.execute(
            select(Sequence).where(Sequence.tenant_id == tenant_id, Sequence.key == key)
        ).scalar_one_or_none()
        if not seq:
            seq = Sequence(
                tenant_id=tenant_id,
                key=key,
                name=name,
                description=description,
                is_enabled=True,
                sandbox_only=True,
            )
            db.add(seq)
            db.flush()

        existing_steps = list(db.execute(select(SequenceStep).where(SequenceStep.sequence_id == seq.id)).scalars())
        if existing_steps:
            continue

        db.add_all(
            [
                SequenceStep(
                    sequence_id=seq.id,
                    step_order=1,
                    delay_minutes=0,
                    channel=Channel.email,
                    template_subject=f"{name}: quick update",
                    template_body=(
                        "Hi {contact_name},\n\n"
                        f"This is your {name.lower()} touchpoint from the Columbus public-data copilot."
                    ),
                    stop_on_reply=True,
                ),
                SequenceStep(
                    sequence_id=seq.id,
                    step_order=2,
                    delay_minutes=1440,
                    channel=Channel.sms,
                    template_subject=None,
                    template_body="Hi {contact_name}, checking in with your latest Columbus housing update.",
                    stop_on_reply=True,
                ),
            ]
        )


def _ensure_demo_drafts(db, tenant_id):
    contact = db.execute(
        select(Contact).where(Contact.tenant_id == tenant_id).order_by(Contact.created_at.asc()).limit(1)
    ).scalar_one_or_none()
    if not contact:
        return

    draft = db.execute(
        select(Message).where(
            Message.tenant_id == tenant_id,
            Message.contact_id == contact.id,
            Message.status == MessageStatus.draft,
        )
        .order_by(Message.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if draft:
        return

    db.add(
        Message(
            tenant_id=tenant_id,
            contact_id=contact.id,
            channel=Channel.email,
            direction=MessageDirection.outbound,
            status=MessageStatus.draft,
            subject="Columbus listing readiness snapshot",
            body=(
                "Hi there,\n\n"
                "I prepared a public-data snapshot for your area with permit momentum and local amenity signals. "
                "Reply if you want me to send your property-specific profile."
            ),
            meta_json={"seeded": True, "created_at": datetime.now(tz=UTC).isoformat()},
        )
    )


def _ensure_seed_source(db) -> Source:
    source = db.execute(select(Source).where(Source.name == "seed_public_dataset")).scalar_one_or_none()
    if source:
        return source

    source = Source(
        name="seed_public_dataset",
        base_url="seed://",
        license_notes="synthetic demo seed data",
        default_ttl_seconds=86400,
    )
    db.add(source)
    db.flush()
    return source


def _upsert_seed_provenance(db, source: Source, external_id: str, raw_url: str, raw_json: dict) -> ProvenanceRecord:
    raw_hash = stable_hash(raw_json)
    existing = db.execute(
        select(ProvenanceRecord)
        .where(ProvenanceRecord.source_id == source.id, ProvenanceRecord.external_id == external_id)
        .order_by(ProvenanceRecord.fetched_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    if existing and existing.raw_hash == raw_hash:
        return existing

    provenance = ProvenanceRecord(
        source_id=source.id,
        external_id=external_id,
        fetched_at=datetime.now(tz=UTC),
        raw_url=raw_url,
        raw_hash=raw_hash,
        ttl_seconds=86400,
        raw_json=raw_json,
    )
    db.add(provenance)
    db.flush()
    return provenance


def _seed_parcels(db, tenant_id, source: Source) -> None:
    rows = load_seed_json("parcels.json")
    for row in rows:
        parcel_number = str(row.get("parcel_number") or "").strip()
        address = str(row.get("address") or "").strip()
        if not parcel_number or not address:
            continue

        lon = row.get("lon")
        lat = row.get("lat")
        centroid_geom = None
        parcel_geom = None
        if isinstance(lon, (float, int)) and isinstance(lat, (float, int)):
            lon_f = float(lon)
            lat_f = float(lat)
            centroid_geom = from_shape(Point(lon_f, lat_f), srid=4326)
            offset = 0.00018
            square = Polygon(
                [
                    (lon_f - offset, lat_f - offset),
                    (lon_f + offset, lat_f - offset),
                    (lon_f + offset, lat_f + offset),
                    (lon_f - offset, lat_f + offset),
                    (lon_f - offset, lat_f - offset),
                ]
            )
            parcel_geom = from_shape(MultiPolygon([square]), srid=4326)

        external_id = f"parcel:{row.get('external_id') or parcel_number}"
        provenance = _upsert_seed_provenance(
            db,
            source,
            external_id=external_id,
            raw_url=f"seed://parcels.json#{external_id}",
            raw_json=row,
        )

        parcel = db.execute(
            select(Parcel).where(Parcel.tenant_id == tenant_id, Parcel.parcel_number == parcel_number)
        ).scalar_one_or_none()

        if not parcel:
            parcel = Parcel(
                tenant_id=tenant_id,
                parcel_number=parcel_number,
                address=address,
                city=str(row.get("city") or "Columbus"),
                state=str(row.get("state") or "OH"),
                zip=str(row.get("zip") or "43215"),
                geom=parcel_geom,
                centroid=centroid_geom,
                attributes_json=row.get("attributes_json") or {},
                source_origin=SourceOrigin.public_record,
                source_origin_details_json={
                    "field_origin_mode": "record_level",
                    "market": settings.default_locale,
                    "rules_configured": True,
                },
                provenance_id=provenance.id,
                updated_at=datetime.now(tz=UTC),
            )
            db.add(parcel)
            continue

        parcel.address = address
        parcel.city = str(row.get("city") or "Columbus")
        parcel.state = str(row.get("state") or "OH")
        parcel.zip = str(row.get("zip") or "43215")
        parcel.geom = parcel_geom
        parcel.centroid = centroid_geom
        parcel.attributes_json = row.get("attributes_json") or {}
        parcel.source_origin = SourceOrigin.public_record
        parcel.source_origin_details_json = {
            "field_origin_mode": "record_level",
            "market": settings.default_locale,
            "rules_configured": True,
        }
        parcel.provenance_id = provenance.id
        parcel.updated_at = datetime.now(tz=UTC)


def _seed_permits(db, tenant_id, source: Source) -> None:
    rows = load_seed_json("permits.json")
    for row in rows:
        external_id = str(row.get("external_id") or "").strip()
        address = str(row.get("address") or "").strip()
        if not external_id or not address:
            continue

        lon = row.get("lon")
        lat = row.get("lat")
        point = None
        if isinstance(lon, (float, int)) and isinstance(lat, (float, int)):
            point = from_shape(Point(float(lon), float(lat)), srid=4326)

        provenance = _upsert_seed_provenance(
            db,
            source,
            external_id=f"permit:{external_id}",
            raw_url=f"seed://permits.json#{external_id}",
            raw_json=row,
        )

        linked_parcel = db.execute(
            select(Parcel).where(Parcel.tenant_id == tenant_id, Parcel.address.ilike(address))
        ).scalar_one_or_none()

        permit = db.execute(
            select(Permit).where(Permit.tenant_id == tenant_id, Permit.external_id == external_id)
        ).scalar_one_or_none()

        if not permit:
            permit = Permit(
                tenant_id=tenant_id,
                external_id=external_id,
                parcel_id=linked_parcel.id if linked_parcel else None,
                address=address,
                permit_type=str(row.get("permit_type") or "Unknown"),
                permit_subtype=row.get("permit_subtype"),
                status=str(row.get("status") or "unknown"),
                applied_date=_parse_date(row.get("applied_date")),
                issued_date=_parse_date(row.get("issued_date")),
                final_date=_parse_date(row.get("final_date")),
                geom=point,
                raw_json=row,
                provenance_id=provenance.id,
            )
            db.add(permit)
            continue

        permit.parcel_id = linked_parcel.id if linked_parcel else permit.parcel_id
        permit.address = address
        permit.permit_type = str(row.get("permit_type") or "Unknown")
        permit.permit_subtype = row.get("permit_subtype")
        permit.status = str(row.get("status") or "unknown")
        permit.applied_date = _parse_date(row.get("applied_date"))
        permit.issued_date = _parse_date(row.get("issued_date"))
        permit.final_date = _parse_date(row.get("final_date"))
        permit.geom = point
        permit.raw_json = row
        permit.provenance_id = provenance.id


def _seed_flood_zones(db, tenant_id, source: Source) -> None:
    rows = load_seed_json("flood_zones.json")
    for row in rows:
        external_id = str(row.get("external_id") or "").strip()
        zone_code = str(row.get("zone_code") or "UNKNOWN")
        if not external_id:
            continue

        polygons = []
        for ring_group in row.get("coordinates") or []:
            if not ring_group:
                continue
            outer = ring_group[0]
            if len(outer) < 4:
                continue
            try:
                polygons.append(Polygon([(float(x), float(y)) for x, y in outer]))
            except Exception:
                continue
        if not polygons:
            continue

        geom = from_shape(MultiPolygon(polygons), srid=4326)
        provenance = _upsert_seed_provenance(
            db,
            source,
            external_id=f"flood:{external_id}",
            raw_url=f"seed://flood_zones.json#{external_id}",
            raw_json=row,
        )

        flood = db.execute(
            select(FloodZone).where(FloodZone.tenant_id == tenant_id, FloodZone.external_id == external_id)
        ).scalar_one_or_none()

        if not flood:
            db.add(
                FloodZone(
                    tenant_id=tenant_id,
                    external_id=external_id,
                    zone_code=zone_code,
                    geom=geom,
                    raw_json=row,
                    provenance_id=provenance.id,
                )
            )
            continue

        flood.zone_code = zone_code
        flood.geom = geom
        flood.raw_json = row
        flood.provenance_id = provenance.id


def _seed_pois(db, tenant_id, source: Source) -> None:
    rows = load_seed_json("pois.json")
    for row in rows:
        external_id = str(row.get("external_id") or "").strip()
        name = str(row.get("name") or "").strip()
        category = str(row.get("category") or "unknown")
        lon = row.get("lon")
        lat = row.get("lat")

        if not external_id or not name:
            continue
        if not isinstance(lon, (float, int)) or not isinstance(lat, (float, int)):
            continue

        point = from_shape(Point(float(lon), float(lat)), srid=4326)
        provenance = _upsert_seed_provenance(
            db,
            source,
            external_id=f"poi:{external_id}",
            raw_url=f"seed://pois.json#{external_id}",
            raw_json=row,
        )

        poi = db.execute(
            select(PoiFeature).where(PoiFeature.tenant_id == tenant_id, PoiFeature.name == name)
        ).scalar_one_or_none()

        if not poi:
            db.add(
                PoiFeature(
                    tenant_id=tenant_id,
                    category=category,
                    name=name,
                    geom=point,
                    raw_json=row,
                    provenance_id=provenance.id,
                )
            )
            continue

        poi.category = category
        poi.geom = point
        poi.raw_json = row
        poi.provenance_id = provenance.id


def _seed_transit_stops(db, tenant_id, source: Source) -> None:
    rows = load_seed_json("transit_stops.json")
    for row in rows:
        external_id = str(row.get("external_id") or "").strip()
        name = str(row.get("name") or "").strip()
        lon = row.get("lon")
        lat = row.get("lat")

        if not external_id or not name:
            continue
        if not isinstance(lon, (float, int)) or not isinstance(lat, (float, int)):
            continue

        point = from_shape(Point(float(lon), float(lat)), srid=4326)
        provenance = _upsert_seed_provenance(
            db,
            source,
            external_id=f"transit:{external_id}",
            raw_url=f"seed://transit_stops.json#{external_id}",
            raw_json=row,
        )

        stop = db.execute(
            select(TransitStop).where(TransitStop.tenant_id == tenant_id, TransitStop.external_id == external_id)
        ).scalar_one_or_none()

        if not stop:
            db.add(
                TransitStop(
                    tenant_id=tenant_id,
                    external_id=external_id,
                    name=name,
                    geom=point,
                    raw_json=row,
                    provenance_id=provenance.id,
                )
            )
            continue

        stop.name = name
        stop.geom = point
        stop.raw_json = row
        stop.provenance_id = provenance.id


def _seed_public_demo_data(db, tenant_id) -> None:
    seed_source = _ensure_seed_source(db)
    _seed_parcels(db, tenant_id, seed_source)
    _ensure_missing_signals_parcel(db, tenant_id, seed_source)
    _seed_permits(db, tenant_id, seed_source)
    _seed_flood_zones(db, tenant_id, seed_source)
    _seed_pois(db, tenant_id, seed_source)
    _seed_transit_stops(db, tenant_id, seed_source)


def _ensure_missing_signals_parcel(db, tenant_id, source: Source) -> None:
    parcel_id = uuid.UUID(settings.test_parcel_missing_signals_id)
    raw = {
        "external_id": "parcel-missing-signals",
        "parcel_number": "010-000111",
        "address": "999 Missing Signal Ln",
        "city": "Columbus",
        "state": "OH",
        "zip": "43215",
        "attributes_json": {
            "coordinates": [-82.99, 39.96],
            # Intentionally no last_sale_date/open_violations_count to force insufficient_data checks.
        },
    }
    provenance = _upsert_seed_provenance(
        db,
        source,
        external_id="parcel:missing_signals",
        raw_url="seed://parcels.json#missing_signals",
        raw_json=raw,
    )
    point = from_shape(Point(-82.99, 39.96), srid=4326)
    square = Polygon(
        [
            (-82.9902, 39.9598),
            (-82.9898, 39.9598),
            (-82.9898, 39.9602),
            (-82.9902, 39.9602),
            (-82.9902, 39.9598),
        ]
    )
    geom = from_shape(MultiPolygon([square]), srid=4326)

    parcel = db.execute(
        select(Parcel).where(Parcel.id == parcel_id, Parcel.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if not parcel:
        parcel = Parcel(
            id=parcel_id,
            tenant_id=tenant_id,
            parcel_number=raw["parcel_number"],
            address=raw["address"],
            city=raw["city"],
            state=raw["state"],
            zip=raw["zip"],
            geom=geom,
            centroid=point,
            attributes_json=raw["attributes_json"],
            source_origin=SourceOrigin.public_record,
            source_origin_details_json={
                "field_origin_mode": "record_level",
                "market": settings.default_locale,
                "rules_configured": True,
            },
            provenance_id=provenance.id,
            updated_at=datetime.now(tz=UTC),
        )
        db.add(parcel)
        return

    parcel.parcel_number = raw["parcel_number"]
    parcel.address = raw["address"]
    parcel.city = raw["city"]
    parcel.state = raw["state"]
    parcel.zip = raw["zip"]
    parcel.geom = geom
    parcel.centroid = point
    parcel.attributes_json = raw["attributes_json"]
    parcel.source_origin = SourceOrigin.public_record
    parcel.source_origin_details_json = {
        "field_origin_mode": "record_level",
        "market": settings.default_locale,
        "rules_configured": True,
    }
    parcel.provenance_id = provenance.id
    parcel.updated_at = datetime.now(tz=UTC)


def bootstrap_seed() -> None:
    deterministic_only = _truthy_env("SEED_DETERMINISTIC_ONLY", default=False)

    db = SessionLocal()
    try:
        tenant, _ = _ensure_tenant_and_user(db)
        _ensure_metric_definitions(db)
        _ensure_contacts_and_consents(db, tenant.id)
        _ensure_sequences(db, tenant.id)
        _seed_public_demo_data(db, tenant.id)
        db.commit()

        if not deterministic_only:
            asyncio.run(run_ingestion(db, tenant.id))

        _ensure_demo_drafts(db, tenant.id)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    bootstrap_seed()
