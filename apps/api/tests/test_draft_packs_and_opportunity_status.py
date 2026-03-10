from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.main import app
from app.models.entities import ComplianceEvent, ConsentEvent, Contact, Message, OutreachDraftPack, Tenant, User
from app.models.enums import Channel, ConsentStatus, MessageDirection, MessageStatus, UserRole
from app.utils.security import get_password_hash


def _login_token(client: TestClient) -> str:
    settings = get_settings()
    response = client.post(
        "/auth/login",
        json={
            "tenant_slug": settings.default_tenant_slug,
            "email": settings.demo_user_email,
            "password": settings.demo_user_password,
        },
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_draft_pack_create_submit_approve_reject_flow() -> None:
    with TestClient(app) as client:
        token = _login_token(client)
        headers = {"Authorization": f"Bearer {token}"}

        contacts = client.get("/contacts", headers=headers)
        assert contacts.status_code == 200
        contact_id = contacts.json()[0]["id"]

        created = client.post(
            "/outreach/draft-pack",
            headers=headers,
            json={
                "contact_id": contact_id,
                "objective": "Test multi-channel outreach pack",
                "channels": ["sms", "email"],
                "sandbox": True,
            },
        )
        assert created.status_code == 200
        payload = created.json()
        assert len(payload["drafts"]) == 2
        pack_id = payload["id"]

        submitted = client.post(f"/outreach/draft-pack/{pack_id}/submit", headers=headers)
        assert submitted.status_code == 200
        assert submitted.json()["status"] == "submitted"

        first_draft_id = payload["drafts"][0]["id"]
        approved = client.post(f"/outreach/drafts/{first_draft_id}/approve", headers=headers)
        assert approved.status_code == 200
        assert approved.json()["approval_state"] == "approved"

        second_draft_id = payload["drafts"][1]["id"]
        rejected = client.post(f"/outreach/drafts/{second_draft_id}/reject", headers=headers)
        assert rejected.status_code == 200
        assert rejected.json()["approval_state"] == "rejected"
        assert rejected.json()["pack_status"] == "rejected"

        fetched = client.get(f"/outreach/draft-pack/{pack_id}", headers=headers)
        assert fetched.status_code == 200
        assert fetched.json()["status"] == "rejected"


def test_draft_pack_accepts_voice_channel() -> None:
    db = SessionLocal()
    tenant_ids = []
    suffix = uuid4().hex[:8]
    tenant_slug = f"voice-channel-{suffix}"
    tenant_email = f"voice-channel-{suffix}@example.com"
    try:
        tenant = Tenant(name="Voice Channel Tenant", slug=tenant_slug)
        db.add(tenant)
        db.flush()
        tenant_ids.append(tenant.id)
        user = User(
            tenant_id=tenant.id,
            email=tenant_email,
            name="Voice Channel Agent",
            password_hash=get_password_hash("voice-channel-pw"),
            role=UserRole.agent,
        )
        db.add(user)
        db.flush()
        contact = Contact(
            tenant_id=tenant.id,
            name="Voice Target",
            email="voice-target@example.com",
            phone="+16145550101",
            tags_json=[],
        )
        db.add(contact)
        db.commit()
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            login = client.post(
                "/auth/login",
                json={
                    "tenant_slug": tenant_slug,
                    "email": tenant_email,
                    "password": "voice-channel-pw",
                },
            )
            assert login.status_code == 200
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

            created = client.post(
                "/outreach/draft-pack",
                headers=headers,
                json={
                    "contact_id": str(contact.id),
                    "objective": "Call with a public-data update",
                    "channels": ["voice"],
                    "sandbox": True,
                },
            )
        assert created.status_code == 200
        payload = created.json()
        assert len(payload["drafts"]) == 1
        assert payload["drafts"][0]["channel"] == "voice"
        assert payload["drafts"][0]["status"] == "draft"
    finally:
        cleanup_db = SessionLocal()
        try:
            from sqlalchemy import delete

            for tenant_id in tenant_ids:
                cleanup_db.execute(delete(ComplianceEvent).where(ComplianceEvent.tenant_id == tenant_id))
                cleanup_db.execute(delete(Message).where(Message.tenant_id == tenant_id))
                cleanup_db.execute(delete(OutreachDraftPack).where(OutreachDraftPack.tenant_id == tenant_id))
                cleanup_db.execute(delete(Contact).where(Contact.tenant_id == tenant_id))
                cleanup_db.execute(delete(User).where(User.tenant_id == tenant_id))
                cleanup_db.execute(delete(Tenant).where(Tenant.id == tenant_id))
            cleanup_db.commit()
        finally:
            cleanup_db.close()


def test_approve_voice_draft_returns_unavailable_when_provider_not_configured(monkeypatch) -> None:
    db = SessionLocal()
    tenant_ids = []
    suffix = uuid4().hex[:8]
    tenant_slug = f"voice-approval-{suffix}"
    tenant_email = f"voice-approval-{suffix}@example.com"
    try:
        tenant = Tenant(name="Voice Approval Tenant", slug=tenant_slug)
        db.add(tenant)
        db.flush()
        tenant_ids.append(tenant.id)
        user = User(
            tenant_id=tenant.id,
            email=tenant_email,
            name="Voice Approval Agent",
            password_hash=get_password_hash("voice-approval-pw"),
            role=UserRole.agent,
        )
        db.add(user)
        db.flush()
        contact = Contact(
            tenant_id=tenant.id,
            name="Voice Approval Contact",
            email="voice-approval-contact@example.com",
            phone="+16145550102",
            tags_json=[],
        )
        db.add(contact)
        db.flush()
        db.add(
            ConsentEvent(
                tenant_id=tenant.id,
                contact_id=contact.id,
                channel=Channel.voice,
                status=ConsentStatus.opt_in,
                consent_text="Call me about listing updates",
                source="test",
            )
        )
        message = Message(
            tenant_id=tenant.id,
            contact_id=contact.id,
            channel=Channel.voice,
            direction=MessageDirection.outbound,
            status=MessageStatus.draft,
            subject=None,
            body="Voicemail outline",
            meta_json={},
        )
        db.add(message)
        db.commit()
        db.refresh(message)
    finally:
        db.close()

    try:
        monkeypatch.setattr("app.services.outreach.settings.sandbox_mode", False)
        monkeypatch.setattr("app.services.providers.settings.sandbox_mode", False)
        with TestClient(app) as client:
            login = client.post(
                "/auth/login",
                json={
                    "tenant_slug": tenant_slug,
                    "email": tenant_email,
                    "password": "voice-approval-pw",
                },
            )
            assert login.status_code == 200
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            approved = client.post(f"/outreach/drafts/{message.id}/approve", headers=headers)

        assert approved.status_code == 200
        payload = approved.json()
        assert payload["status"] == "unavailable"
        assert payload["approval_state"] == "draft"
        assert "Twilio Voice" in payload["reason"]
    finally:
        cleanup_db = SessionLocal()
        try:
            from sqlalchemy import delete

            for tenant_id in tenant_ids:
                cleanup_db.execute(delete(ComplianceEvent).where(ComplianceEvent.tenant_id == tenant_id))
                cleanup_db.execute(delete(ConsentEvent).where(ConsentEvent.tenant_id == tenant_id))
                cleanup_db.execute(delete(Message).where(Message.tenant_id == tenant_id))
                cleanup_db.execute(delete(OutreachDraftPack).where(OutreachDraftPack.tenant_id == tenant_id))
                cleanup_db.execute(delete(Contact).where(Contact.tenant_id == tenant_id))
                cleanup_db.execute(delete(User).where(User.tenant_id == tenant_id))
                cleanup_db.execute(delete(Tenant).where(Tenant.id == tenant_id))
            cleanup_db.commit()
        finally:
            cleanup_db.close()


def test_rewrite_voice_draft_returns_ai_assisted_response(monkeypatch) -> None:
    db = SessionLocal()
    tenant_ids = []
    suffix = uuid4().hex[:8]
    tenant_slug = f"voice-rewrite-{suffix}"
    tenant_email = f"voice-rewrite-{suffix}@example.com"
    try:
        tenant = Tenant(name="Voice Rewrite Tenant", slug=tenant_slug)
        db.add(tenant)
        db.flush()
        tenant_ids.append(tenant.id)
        user = User(
            tenant_id=tenant.id,
            email=tenant_email,
            name="Voice Rewrite Agent",
            password_hash=get_password_hash("voice-rewrite-pw"),
            role=UserRole.agent,
        )
        db.add(user)
        db.flush()
        contact = Contact(
            tenant_id=tenant.id,
            name="Voice Rewrite Contact",
            email="voice-rewrite-contact@example.com",
            phone="+16145550103",
            tags_json=[],
        )
        db.add(contact)
        db.flush()
        message = Message(
            tenant_id=tenant.id,
            contact_id=contact.id,
            channel=Channel.voice,
            direction=MessageDirection.outbound,
            status=MessageStatus.draft,
            subject=None,
            body="Legacy voicemail outline",
            meta_json={},
        )
        db.add(message)
        db.commit()
        db.refresh(message)
    finally:
        db.close()

    try:
        monkeypatch.setattr(
            "app.api.routes_outreach.get_llm_provider",
            lambda: SimpleNamespace(provider_label="test/mock-llm"),
        )
        monkeypatch.setattr(
            "app.api.routes_outreach.generate_outreach_draft",
            lambda *_args, **_kwargs: {
                "subject": None,
                "body": "Hi there, this is a quick follow-up call about the public-data update we prepared for your area. Please call us back if you want to talk through it.",
                "compliance_flags": [],
                "provider_label": "test/mock-llm",
            },
        )
        with TestClient(app) as client:
            login = client.post(
                "/auth/login",
                json={
                    "tenant_slug": tenant_slug,
                    "email": tenant_email,
                    "password": "voice-rewrite-pw",
                },
            )
            assert login.status_code == 200
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            rewritten = client.post(
                f"/outreach/drafts/{message.id}/rewrite",
                headers=headers,
                json={"tone": "professional", "notes": "Make it warmer"},
            )

        assert rewritten.status_code == 200
        payload = rewritten.json()
        assert payload["ai_generated"] is True
        assert payload["provider_label"] == "test/mock-llm"
        assert "call us back" in payload["proposed_body"].lower()
        assert payload["compliance_flags"] == []
    finally:
        cleanup_db = SessionLocal()
        try:
            from sqlalchemy import delete

            for tenant_id in tenant_ids:
                cleanup_db.execute(delete(ComplianceEvent).where(ComplianceEvent.tenant_id == tenant_id))
                cleanup_db.execute(delete(Message).where(Message.tenant_id == tenant_id))
                cleanup_db.execute(delete(OutreachDraftPack).where(OutreachDraftPack.tenant_id == tenant_id))
                cleanup_db.execute(delete(Contact).where(Contact.tenant_id == tenant_id))
                cleanup_db.execute(delete(User).where(User.tenant_id == tenant_id))
                cleanup_db.execute(delete(Tenant).where(Tenant.id == tenant_id))
            cleanup_db.commit()
        finally:
            cleanup_db.close()


def test_voice_status_endpoint_reports_unavailable_without_voice_config() -> None:
    with TestClient(app) as client:
        token = _login_token(client)
        headers = {"Authorization": f"Bearer {token}"}

        response = client.get("/outreach/voice-status", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is False
    assert "voice" in payload["reason"].lower()


def test_opportunity_status_change_creates_event_row() -> None:
    with TestClient(app) as client:
        token = _login_token(client)
        headers = {"Authorization": f"Bearer {token}"}

        search = client.get("/parcels/search?query=High", headers=headers)
        assert search.status_code == 200
        parcel_id = search.json()[0]["id"]

        update = client.post(
            f"/opportunities/{parcel_id}/status",
            headers=headers,
            json={"status": "active", "reason": "status event test"},
        )
        assert update.status_code == 200
        assert update.json()["status"] == "active"

        events = client.get(f"/opportunities/events?parcel_id={parcel_id}&days=30", headers=headers)
        assert events.status_code == 200
        rows = [row for row in events.json().get("items", []) if row.get("event_type") == "status_change"]
        assert rows, "Expected at least one status_change event"
        latest = rows[0]
        assert latest["details"]["to_status"] == "active"
