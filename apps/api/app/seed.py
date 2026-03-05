from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import (
    ConsentEvent,
    Contact,
    Message,
    MetricDefinition,
    Sequence,
    SequenceStep,
    Tenant,
    User,
)
from app.models.enums import Channel, ConsentStatus, MessageDirection, MessageStatus, UserRole
from app.services.ingestion import run_ingestion
from app.utils.security import get_password_hash

settings = get_settings()


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

    return tenant, user


def _ensure_metric_definitions(db):
    definitions = [
        {
            "key": "micro_market_nowcast_v1",
            "name": "Micro Market Nowcast",
            "version": "v1",
            "formula_markdown": (
                "`score = 0.45*permit_component + 0.25*poi_component + 0.30*rate_component`\n"
                "where `permit_component=min(100, permit_activity_rate*5)`, `poi_component=min(100, poi_density_proxy*8)`, "
                "and `rate_component=clamp(0,100,50-(rate_delta*180))`."
            ),
        },
        {
            "key": "marketing_package_health_v1",
            "name": "Marketing Package Health",
            "version": "v1",
            "formula_markdown": (
                "`score = completeness(40) + copy_richness(30) - compliance_penalty(up to 30)`\n"
                "completeness uses photo count, min short-side resolution, and rooms covered."
            ),
        },
        {
            "key": "renovation_roi_v1",
            "name": "Renovation ROI Band",
            "version": "v1",
            "formula_markdown": (
                "Rule-based banding using property type + neighborhood permit mix. "
                "Outputs qualitative ranges only (no dollar claims)."
            ),
        },
        {
            "key": "insurance_pressure_v1",
            "name": "Insurance Pressure",
            "version": "v1",
            "formula_markdown": (
                "Flood intersection + nearest flood polygon distance -> pressure level with uncertainty note."
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


def _ensure_contacts_and_consents(db, tenant_id):
    seed_contacts = [
        {
            "name": "Ava Thompson",
            "email": "ava@example.com",
            "phone": "+16145550101",
            "tags_json": ["buyer", "north_columbus"],
            "notes": "Prefers SMS updates",
        },
        {
            "name": "Noah Patel",
            "email": "noah@example.com",
            "phone": "+16145550102",
            "tags_json": ["seller", "clintonville"],
            "notes": "Considering listing this spring",
        },
        {
            "name": "Mia Chen",
            "email": "mia@example.com",
            "phone": "+16145550103",
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

        existing_steps = list(
            db.execute(select(SequenceStep).where(SequenceStep.sequence_id == seq.id)).scalars()
        )
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


def bootstrap_seed() -> None:
    db = SessionLocal()
    try:
        tenant, _ = _ensure_tenant_and_user(db)
        _ensure_metric_definitions(db)
        _ensure_contacts_and_consents(db, tenant.id)
        _ensure_sequences(db, tenant.id)
        db.commit()

        asyncio.run(run_ingestion(db, tenant.id))
        _ensure_demo_drafts(db, tenant.id)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    bootstrap_seed()
