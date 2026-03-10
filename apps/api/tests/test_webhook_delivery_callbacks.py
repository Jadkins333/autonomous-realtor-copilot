from __future__ import annotations

import base64
import hashlib
import hmac
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.main import app
from app.models.entities import Contact, Message, SuppressionList, Tenant, User
from app.models.enums import Channel, MessageDirection, MessageStatus, UserRole
from app.utils.security import get_password_hash


def _make_tenant(db, *, suffix: str) -> tuple[Tenant, User]:
    tenant = Tenant(name=f"Webhook Tenant {suffix}", slug=f"tenant-webhook-{suffix}")
    db.add(tenant)
    db.flush()
    user = User(
        tenant_id=tenant.id,
        email=f"agent-{suffix}@example.com",
        name="Webhook Agent",
        password_hash=get_password_hash("webhook-pw"),
        role=UserRole.agent,
    )
    db.add(user)
    db.commit()
    db.refresh(tenant)
    db.refresh(user)
    return tenant, user


def _make_contact(
    db,
    *,
    tenant_id,
    name: str = "Alice Callback",
    email: str = "alice@example.com",
    phone: str = "+16145550123",
) -> Contact:
    contact = Contact(
        tenant_id=tenant_id,
        name=name,
        email=email,
        phone=phone,
        tags_json=[],
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


def _make_message(
    db,
    *,
    tenant_id,
    contact_id,
    channel: Channel,
    provider_message_id: str,
) -> Message:
    message = Message(
        tenant_id=tenant_id,
        contact_id=contact_id,
        channel=channel,
        direction=MessageDirection.outbound,
        status=MessageStatus.sent,
        subject="Callback test",
        body="Provider callback verification",
        provider_message_id=provider_message_id,
        meta_json={"approval_state": "approved"},
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def _cleanup(tenant_ids: list) -> None:
    db = SessionLocal()
    try:
        for tenant_id in tenant_ids:
            db.execute(delete(SuppressionList).where(SuppressionList.tenant_id == tenant_id))
            db.execute(delete(Message).where(Message.tenant_id == tenant_id))
            db.execute(delete(Contact).where(Contact.tenant_id == tenant_id))
            db.execute(delete(User).where(User.tenant_id == tenant_id))
            db.execute(delete(Tenant).where(Tenant.id == tenant_id))
        db.commit()
    finally:
        db.close()


def _twilio_signature(url: str, params: dict[str, str], token: str) -> str:
    message = url + "".join(f"{key}{value}" for key, value in sorted(params.items()))
    digest = hmac.new(token.encode("utf-8"), message.encode("utf-8"), hashlib.sha1).digest()
    return base64.b64encode(digest).decode("utf-8")


def _set_webhook_env(monkeypatch) -> None:
    monkeypatch.setenv("TWILIO_WEBHOOK_AUTH_TOKEN", "twilio-secret")
    monkeypatch.setenv("POSTMARK_WEBHOOK_USERNAME", "postmark-user")
    monkeypatch.setenv("POSTMARK_WEBHOOK_PASSWORD", "postmark-pass")
    get_settings.cache_clear()


def test_twilio_status_webhook_rejects_missing_signature(monkeypatch) -> None:
    _set_webhook_env(monkeypatch)
    with TestClient(app) as client:
        response = client.post(
            "/webhooks/twilio/status",
            data={"MessageSid": "SM-missing-signature", "MessageStatus": "delivered"},
        )
    assert response.status_code == 403
    assert "Twilio signature" in response.json()["detail"]


def test_twilio_status_webhook_marks_sms_delivered(monkeypatch) -> None:
    _set_webhook_env(monkeypatch)
    db = SessionLocal()
    tenant_ids = []
    try:
        suffix = uuid4().hex[:8]
        tenant, _user = _make_tenant(db, suffix=suffix)
        tenant_ids.append(tenant.id)
        contact = _make_contact(db, tenant_id=tenant.id)
        message = _make_message(
            db,
            tenant_id=tenant.id,
            contact_id=contact.id,
            channel=Channel.sms,
            provider_message_id="SM-delivered-123",
        )
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            params = {"MessageSid": "SM-delivered-123", "MessageStatus": "delivered"}
            response = client.post(
                "/webhooks/twilio/status",
                data=params,
                headers={
                    "X-Twilio-Signature": _twilio_signature(
                        "http://testserver/webhooks/twilio/status",
                        params,
                        "twilio-secret",
                    )
                },
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["ok"] is True
        assert payload["matched"] is True
        assert payload["status"] == "delivered"

        db = SessionLocal()
        try:
            refreshed = db.execute(select(Message).where(Message.id == message.id)).scalar_one()
            assert refreshed.status == MessageStatus.delivered
            assert refreshed.meta_json["delivery_provider"] == "twilio"
            assert refreshed.meta_json["provider_delivery_status"] == "delivered"
        finally:
            db.close()
    finally:
        _cleanup(tenant_ids)


def test_twilio_status_webhook_accepts_public_api_base_url_signature(monkeypatch) -> None:
    _set_webhook_env(monkeypatch)
    monkeypatch.setenv("PUBLIC_API_BASE_URL", "https://staging.example.com/api")
    get_settings.cache_clear()

    db = SessionLocal()
    tenant_ids = []
    try:
        suffix = uuid4().hex[:8]
        tenant, _user = _make_tenant(db, suffix=suffix)
        tenant_ids.append(tenant.id)
        contact = _make_contact(db, tenant_id=tenant.id)
        message = _make_message(
            db,
            tenant_id=tenant.id,
            contact_id=contact.id,
            channel=Channel.sms,
            provider_message_id="SM-staging-url-123",
        )
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            params = {"MessageSid": "SM-staging-url-123", "MessageStatus": "delivered"}
            response = client.post(
                "/webhooks/twilio/status",
                data=params,
                headers={
                    "X-Twilio-Signature": _twilio_signature(
                        "https://staging.example.com/api/webhooks/twilio/status",
                        params,
                        "twilio-secret",
                    )
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["ok"] is True
        assert payload["matched"] is True

        db = SessionLocal()
        try:
            refreshed = db.execute(select(Message).where(Message.id == message.id)).scalar_one()
            assert refreshed.status == MessageStatus.delivered
        finally:
            db.close()
    finally:
        _cleanup(tenant_ids)
        get_settings.cache_clear()


def test_twilio_status_webhook_rejects_internal_url_signature_when_public_base_is_configured(monkeypatch) -> None:
    _set_webhook_env(monkeypatch)
    monkeypatch.setenv("PUBLIC_API_BASE_URL", "https://staging.example.com/api")
    get_settings.cache_clear()

    with TestClient(app) as client:
        params = {"MessageSid": "SM-wrong-base-123", "MessageStatus": "delivered"}
        response = client.post(
            "/webhooks/twilio/status",
            data=params,
            headers={
                "X-Twilio-Signature": _twilio_signature(
                    "http://testserver/webhooks/twilio/status",
                    params,
                    "twilio-secret",
                )
            },
        )

    assert response.status_code == 403
    assert "Twilio signature" in response.json()["detail"]
    get_settings.cache_clear()


def test_twilio_status_webhook_marks_sms_failed(monkeypatch) -> None:
    _set_webhook_env(monkeypatch)
    db = SessionLocal()
    tenant_ids = []
    try:
        suffix = uuid4().hex[:8]
        tenant, _user = _make_tenant(db, suffix=suffix)
        tenant_ids.append(tenant.id)
        contact = _make_contact(db, tenant_id=tenant.id)
        message = _make_message(
            db,
            tenant_id=tenant.id,
            contact_id=contact.id,
            channel=Channel.sms,
            provider_message_id="SM-failed-123",
        )
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            params = {
                "MessageSid": "SM-failed-123",
                "MessageStatus": "undelivered",
                "ErrorCode": "30003",
                "ErrorMessage": "Unreachable destination handset",
            }
            response = client.post(
                "/webhooks/twilio/status",
                data=params,
                headers={
                    "X-Twilio-Signature": _twilio_signature(
                        "http://testserver/webhooks/twilio/status",
                        params,
                        "twilio-secret",
                    )
                },
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["matched"] is True
        assert payload["status"] == "failed"

        db = SessionLocal()
        try:
            refreshed = db.execute(select(Message).where(Message.id == message.id)).scalar_one()
            assert refreshed.status == MessageStatus.failed
            assert refreshed.meta_json["provider_error_code"] == "30003"
            assert refreshed.meta_json["provider_delivery_status"] == "undelivered"
        finally:
            db.close()
    finally:
        _cleanup(tenant_ids)


def test_postmark_delivery_webhook_rejects_missing_basic_auth(monkeypatch) -> None:
    _set_webhook_env(monkeypatch)
    with TestClient(app) as client:
        response = client.post(
            "/webhooks/postmark/delivery",
            json={"RecordType": "Delivery", "MessageID": "pm-no-auth"},
        )
    assert response.status_code == 401
    assert "Postmark webhook authentication" in response.json()["detail"]


def test_postmark_delivery_webhook_marks_email_delivered(monkeypatch) -> None:
    _set_webhook_env(monkeypatch)
    db = SessionLocal()
    tenant_ids = []
    try:
        suffix = uuid4().hex[:8]
        tenant, _user = _make_tenant(db, suffix=suffix)
        tenant_ids.append(tenant.id)
        contact = _make_contact(db, tenant_id=tenant.id)
        message = _make_message(
            db,
            tenant_id=tenant.id,
            contact_id=contact.id,
            channel=Channel.email,
            provider_message_id="pm-delivered-123",
        )
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            response = client.post(
                "/webhooks/postmark/delivery",
                json={
                    "RecordType": "Delivery",
                    "MessageID": "pm-delivered-123",
                    "Recipient": "alice@example.com",
                    "DeliveredAt": "2026-03-10T02:00:00Z",
                },
                auth=("postmark-user", "postmark-pass"),
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["matched"] is True
        assert payload["status"] == "delivered"

        db = SessionLocal()
        try:
            refreshed = db.execute(select(Message).where(Message.id == message.id)).scalar_one()
            assert refreshed.status == MessageStatus.delivered
            assert refreshed.meta_json["delivery_provider"] == "postmark"
            assert refreshed.meta_json["provider_delivery_status"] == "delivery"
        finally:
            db.close()
    finally:
        _cleanup(tenant_ids)


def test_postmark_bounce_webhook_marks_email_failed_and_suppresses_contact(monkeypatch) -> None:
    _set_webhook_env(monkeypatch)
    db = SessionLocal()
    tenant_ids = []
    try:
        suffix = uuid4().hex[:8]
        tenant, _user = _make_tenant(db, suffix=suffix)
        tenant_ids.append(tenant.id)
        contact = _make_contact(db, tenant_id=tenant.id)
        message = _make_message(
            db,
            tenant_id=tenant.id,
            contact_id=contact.id,
            channel=Channel.email,
            provider_message_id="pm-bounce-123",
        )
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            response = client.post(
                "/webhooks/postmark/bounce",
                json={
                    "RecordType": "Bounce",
                    "MessageID": "pm-bounce-123",
                    "Type": "HardBounce",
                    "Description": "Mailbox unavailable",
                    "Email": "alice@example.com",
                },
                auth=("postmark-user", "postmark-pass"),
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["matched"] is True
        assert payload["status"] == "failed"
        assert payload["suppressed"] is True

        db = SessionLocal()
        try:
            refreshed = db.execute(select(Message).where(Message.id == message.id)).scalar_one()
            assert refreshed.status == MessageStatus.failed
            assert refreshed.meta_json["provider_delivery_status"] == "bounce"
            suppression = db.execute(
                select(SuppressionList).where(
                    SuppressionList.tenant_id == tenant.id,
                    SuppressionList.contact_id == contact.id,
                    SuppressionList.channel == Channel.email,
                )
            ).scalar_one_or_none()
            assert suppression is not None
            assert "bounce" in suppression.reason.lower()
        finally:
            db.close()
    finally:
        _cleanup(tenant_ids)
