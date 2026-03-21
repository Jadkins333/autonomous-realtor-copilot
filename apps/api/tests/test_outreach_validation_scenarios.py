from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.models.entities import (
    ActivityEvent,
    ComplianceEvent,
    ConsentEvent,
    Contact,
    Conversation,
    Message,
    OutreachDraftPack,
    OutreachSendAttempt,
    SuppressionList,
    Tenant,
    User,
)
from app.models.enums import Channel, ConsentStatus, UserRole
from app.services import compliance, outreach
from app.services.providers import ProviderResult


class _EmailProvider:
    name = "test_email"

    async def send(self, to_email: str, subject: str, body: str, *, idempotency_key: str) -> ProviderResult:
        return ProviderResult(
            ok=True,
            provider_message_id="email-123",
            request_payload={
                "to": to_email,
                "subject": subject,
                "body": body,
                "idempotency_key": idempotency_key,
            },
            response_payload={"accepted": True},
        )


def _allowed_disclosure() -> dict:
    return {
        "allowed": True,
        "reason_codes": [],
        "human_readable_messages": [],
        "jurisdiction": "OH",
        "blocking_disclosures": [],
    }


def _blocked_disclosure() -> dict:
    return {
        "allowed": False,
        "reason_codes": ["agency_relationship_required"],
        "human_readable_messages": ["This workflow is blocked until the required Ohio disclosure is completed."],
        "jurisdiction": "OH",
        "blocking_disclosures": [
            {
                "disclosure_version_id": str(uuid4()),
                "title": "Ohio agency relationship disclosure",
                "summary": "Review and acknowledge the applicable disclosure before continuing.",
                "acknowledgement_mode": "checkbox",
                "human_readable_message": "This workflow is blocked until the required Ohio disclosure is completed.",
                "reason_code": "agency_relationship_required",
            }
        ],
    }


def _make_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    tables = [
        Tenant.__table__,
        User.__table__,
        Contact.__table__,
        ConsentEvent.__table__,
        SuppressionList.__table__,
        Conversation.__table__,
        OutreachDraftPack.__table__,
        Message.__table__,
        OutreachSendAttempt.__table__,
        ActivityEvent.__table__,
        ComplianceEvent.__table__,
    ]
    for table in tables:
        table.create(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    return factory()


def _seed_actor(db: Session) -> tuple[Tenant, User]:
    tenant = Tenant(id=uuid4(), name="Demo Realty Columbus")
    user = User(
        id=uuid4(),
        tenant_id=tenant.id,
        email="agent@demo.local",
        name="Demo Agent",
        password_hash="hash",
        role=UserRole.admin,
    )
    db.add_all([tenant, user])
    db.commit()
    return tenant, user


def _seed_contact(
    db: Session,
    *,
    tenant_id,
    timezone: str = "America/New_York",
    email: str = "ava@example.com",
    phone: str = "+16145550101",
    with_email_consent: bool = True,
    with_sms_consent: bool = True,
) -> Contact:
    contact = Contact(
        id=uuid4(),
        tenant_id=tenant_id,
        name="Ava Thompson",
        email=email,
        phone=phone,
        timezone=timezone,
        tags_json=[],
        notes="",
    )
    db.add(contact)
    db.flush()

    now = datetime(2026, 3, 19, 12, 0, tzinfo=UTC)
    if with_email_consent:
        db.add(
            ConsentEvent(
                tenant_id=tenant_id,
                contact_id=contact.id,
                channel=Channel.email,
                status=ConsentStatus.opt_in,
                consent_text="I agree to receive email updates.",
                source="test",
                capture_method="pytest",
                policy_text_version="v1",
                proof_artifact_ref=f"proof://email/{contact.id}",
                occurred_at=now,
            )
        )
    if with_sms_consent:
        db.add(
            ConsentEvent(
                tenant_id=tenant_id,
                contact_id=contact.id,
                channel=Channel.sms,
                status=ConsentStatus.opt_in,
                consent_text="I agree to receive SMS updates.",
                source="test",
                capture_method="pytest",
                policy_text_version="v1",
                proof_artifact_ref=f"proof://sms/{contact.id}",
                occurred_at=now,
            )
        )
    db.commit()
    return contact


def _create_pack_and_message(
    db: Session,
    *,
    tenant_id,
    user_id,
    contact_id,
    objective: str,
    sandbox: bool,
    channel: str = "email",
):
    pack = outreach.create_draft_pack(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        contact_id=contact_id,
        parcel_id=None,
        objective=objective,
        channels=[channel],
        sandbox=sandbox,
    )
    outreach.submit_draft_pack(db, tenant_id, pack["id"], actor_user_id=user_id)
    return pack


def test_sandbox_draft_submit_and_approve_stages_one_send_attempt(monkeypatch) -> None:
    db = _make_session()
    tenant, user = _seed_actor(db)
    contact = _seed_contact(db, tenant_id=tenant.id)
    monkeypatch.setattr(outreach, "_message_disclosure_status", lambda *_args, **_kwargs: _allowed_disclosure())

    pack = _create_pack_and_message(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        contact_id=contact.id,
        objective="Share the latest Columbus opportunity update.",
        sandbox=True,
    )

    result = asyncio.run(outreach.approve_and_send(db, tenant.id, pack["drafts"][0]["id"], actor_user_id=user.id))

    assert result["status"] == "sandbox_staged"
    assert result["policy_snapshot"]["allowed"] is True
    assert db.execute(select(func.count(OutreachSendAttempt.id))).scalar_one() == 1


def test_live_send_returns_provider_unconfigured_when_provider_credentials_are_missing(monkeypatch) -> None:
    db = _make_session()
    tenant, user = _seed_actor(db)
    contact = _seed_contact(db, tenant_id=tenant.id)
    monkeypatch.setattr(outreach, "_message_disclosure_status", lambda *_args, **_kwargs: _allowed_disclosure())
    monkeypatch.setattr(
        outreach,
        "get_email_provider",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("Live email sending is not configured")),
    )

    pack = _create_pack_and_message(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        contact_id=contact.id,
        objective="Share the latest Columbus opportunity update.",
        sandbox=False,
    )

    result = asyncio.run(outreach.approve_and_send(db, tenant.id, pack["drafts"][0]["id"], actor_user_id=user.id))

    assert result["status"] == "provider_unconfigured"
    assert "not configured" in result["reason"].lower()


def test_send_is_blocked_for_stop_suppression(monkeypatch) -> None:
    db = _make_session()
    tenant, user = _seed_actor(db)
    contact = _seed_contact(db, tenant_id=tenant.id)
    monkeypatch.setattr(outreach, "_message_disclosure_status", lambda *_args, **_kwargs: _allowed_disclosure())

    pack = _create_pack_and_message(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        contact_id=contact.id,
        objective="Share the latest Columbus opportunity update.",
        sandbox=False,
    )
    db.add(
        SuppressionList(
            tenant_id=tenant.id,
            contact_id=contact.id,
            channel=Channel.email,
            reason="STOP",
        )
    )
    db.commit()

    result = asyncio.run(outreach.approve_and_send(db, tenant.id, pack["drafts"][0]["id"], actor_user_id=user.id))

    assert result["status"] == "blocked"
    assert "suppressed_contact" in result["reason_codes"]


def test_send_is_blocked_for_quiet_hours_using_recipient_timezone(monkeypatch) -> None:
    db = _make_session()
    tenant, user = _seed_actor(db)
    contact = _seed_contact(db, tenant_id=tenant.id, timezone="America/Los_Angeles")
    monkeypatch.setattr(outreach, "_message_disclosure_status", lambda *_args, **_kwargs: _allowed_disclosure())
    fixed_now = datetime(2026, 3, 19, 7, 0, tzinfo=UTC)
    monkeypatch.setattr(
        outreach,
        "evaluate_outbound_policy",
        lambda db_session, message, *, contact, sandbox_mode: compliance.evaluate_outbound_policy(
            db_session,
            message,
            contact=contact,
            sandbox_mode=sandbox_mode,
            now=fixed_now,
        ),
    )

    pack = _create_pack_and_message(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        contact_id=contact.id,
        objective="Share the latest Columbus opportunity update.",
        sandbox=False,
    )

    result = asyncio.run(outreach.approve_and_send(db, tenant.id, pack["drafts"][0]["id"], actor_user_id=user.id))

    assert result["status"] == "blocked"
    assert "quiet_hours" in result["reason_codes"]
    assert result["policy_snapshot"]["recipient_timezone_used"] == "America/Los_Angeles"


def test_send_is_blocked_for_fair_housing_copy(monkeypatch) -> None:
    db = _make_session()
    tenant, user = _seed_actor(db)
    contact = _seed_contact(db, tenant_id=tenant.id)
    monkeypatch.setattr(outreach, "_message_disclosure_status", lambda *_args, **_kwargs: _allowed_disclosure())

    pack = _create_pack_and_message(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        contact_id=contact.id,
        objective="This home is ideal for families in an exclusive neighborhood.",
        sandbox=False,
    )

    result = asyncio.run(outreach.approve_and_send(db, tenant.id, pack["drafts"][0]["id"], actor_user_id=user.id))

    assert result["status"] == "blocked"
    assert "fair_housing_flagged" in result["reason_codes"]


def test_send_is_blocked_when_required_disclosure_is_missing(monkeypatch) -> None:
    db = _make_session()
    tenant, user = _seed_actor(db)
    contact = _seed_contact(db, tenant_id=tenant.id)
    monkeypatch.setattr(outreach, "_message_disclosure_status", lambda *_args, **_kwargs: _blocked_disclosure())

    pack = _create_pack_and_message(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        contact_id=contact.id,
        objective="Share the latest Columbus opportunity update.",
        sandbox=False,
    )

    result = asyncio.run(outreach.approve_and_send(db, tenant.id, pack["drafts"][0]["id"], actor_user_id=user.id))

    assert result["status"] == "blocked"
    assert "agency_relationship_required" in result["reason_codes"]
    assert result["disclosure_status"]["allowed"] is False


def test_retry_idempotency_returns_existing_send_attempt_without_duplicate_provider_send(monkeypatch) -> None:
    db = _make_session()
    tenant, user = _seed_actor(db)
    contact = _seed_contact(db, tenant_id=tenant.id)
    monkeypatch.setattr(outreach, "_message_disclosure_status", lambda *_args, **_kwargs: _allowed_disclosure())
    monkeypatch.setattr(outreach, "get_email_provider", lambda **_kwargs: _EmailProvider())

    pack = _create_pack_and_message(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        contact_id=contact.id,
        objective="Share the latest Columbus opportunity update.",
        sandbox=False,
    )

    first = asyncio.run(outreach.approve_and_send(db, tenant.id, pack["drafts"][0]["id"], actor_user_id=user.id))
    second = asyncio.run(outreach.approve_and_send(db, tenant.id, pack["drafts"][0]["id"], actor_user_id=user.id))

    assert first["status"] == "sent"
    assert second["status"] == "sent"
    assert second["deduped"] is True
    assert db.execute(select(func.count(OutreachSendAttempt.id))).scalar_one() == 1


def test_live_send_dispatches_correct_httpx_payloads_to_providers(monkeypatch) -> None:
    db = _make_session()
    tenant, user = _seed_actor(db)
    contact = _seed_contact(db, tenant_id=tenant.id)
    monkeypatch.setattr(outreach, "_message_disclosure_status", lambda *_args, **_kwargs: _allowed_disclosure())
    
    from app.services import providers
    monkeypatch.setattr(outreach, "get_email_provider", lambda **_kwargs: providers.PostmarkEmailProvider())
    monkeypatch.setattr(outreach, "get_sms_provider", lambda **_kwargs: providers.TwilioSmsProvider())
    
    import httpx
    posted_payloads = []
    
    class MockResponse:
        def __init__(self, json_data, status_code, text=""):
            self.json_data = json_data
            self.status_code = status_code
            self.text = text
            self.is_success = 200 <= status_code < 300
            
        def json(self):
            return self.json_data
            
    async def mock_post(*args, **kwargs):
        posted_payloads.append((args, kwargs))
        return MockResponse({"MessageID": "postmark-123", "sid": "twilio-123"}, 200)
        
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    
    pack = _create_pack_and_message(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        contact_id=contact.id,
        objective="Send email.",
        sandbox=False,
        channel="email",
    )
    
    result = asyncio.run(outreach.approve_and_send(db, tenant.id, pack["drafts"][0]["id"], actor_user_id=user.id))
    assert result["status"] == "sent"
    assert "postmark-123" in result["provider_message_id"]
    assert len(posted_payloads) == 1
    assert "api.postmarkapp.com" in posted_payloads[0][0][1]
    
    pack2 = _create_pack_and_message(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        contact_id=contact.id,
        objective="Send sms.",
        sandbox=False,
        channel="sms",
    )
    result2 = asyncio.run(outreach.approve_and_send(db, tenant.id, pack2["drafts"][0]["id"], actor_user_id=user.id))
    assert result2["status"] == "sent"
    assert "twilio-123" in result2["provider_message_id"]
    assert len(posted_payloads) == 2
    assert "api.twilio.com" in posted_payloads[1][0][1]


def test_live_send_provider_api_failure_handles_cleanly(monkeypatch) -> None:
    db = _make_session()
    tenant, user = _seed_actor(db)
    contact = _seed_contact(db, tenant_id=tenant.id)
    monkeypatch.setattr(outreach, "_message_disclosure_status", lambda *_args, **_kwargs: _allowed_disclosure())
    
    from app.services import providers
    monkeypatch.setattr(outreach, "get_email_provider", lambda **_kwargs: providers.PostmarkEmailProvider())
    
    import httpx
    
    async def mock_post(*args, **kwargs):
        raise httpx.TimeoutException("Connection timed out")
        
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    
    pack = _create_pack_and_message(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        contact_id=contact.id,
        objective="Send email.",
        sandbox=False,
        channel="email",
    )
    
    result = asyncio.run(outreach.approve_and_send(db, tenant.id, pack["drafts"][0]["id"], actor_user_id=user.id))
    assert result["status"] == "provider_timeout"
    assert "Connection timed out" in result["reason"]
    
    attempt = db.execute(
        select(OutreachSendAttempt).where(OutreachSendAttempt.message_id == pack["drafts"][0]["id"])
    ).scalar_one()
    assert attempt.final_status == "provider_timeout"
    assert attempt.error_text == "Connection timed out"
