from __future__ import annotations

import asyncio
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.main import app
from app.models.enums import Channel, MessageStatus
from app.services import ingestion, outreach
import app.seed as app_seed


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def scalar_one(self):
        return self.value


class _FakeDB:
    def __init__(self, values):
        self.values = list(values)
        self.commits = 0

    def execute(self, *_args, **_kwargs):
        value = self.values.pop(0) if self.values else None
        return _ScalarResult(value)

    def add(self, *_args, **_kwargs):
        return

    def commit(self):
        self.commits += 1


def test_retry_with_jitter_applies_backoff_and_jitter(monkeypatch):
    attempts = {"count": 0}
    delays = []

    async def flaky_fetch():
        attempts["count"] += 1
        if attempts["count"] != 3:
            raise RuntimeError("transient failure")
        return [{"ok": True}]

    async def fake_sleep(delay):
        delays.append(delay)

    monkeypatch.setattr(ingestion.random, "uniform", lambda *_args, **_kwargs: 0.05)
    monkeypatch.setattr(ingestion.asyncio, "sleep", fake_sleep)

    result = asyncio.run(
        ingestion._retry_with_jitter(
            flaky_fetch,
            source_label="test_source",
            max_attempts=4,
            base_delay_seconds=0.1,
            jitter_seconds=0.2,
        )
    )

    assert attempts["count"] == 3
    assert delays == pytest.approx([0.15, 0.25])
    assert result == [{"ok": True}]


def test_approve_and_send_missing_email_returns_safe_pack_status(monkeypatch):
    tenant_id = uuid4()
    message_id = uuid4()
    pack_id = uuid4()

    message = SimpleNamespace(
        id=message_id,
        tenant_id=tenant_id,
        contact_id=uuid4(),
        status=MessageStatus.draft,
        channel=Channel.email,
        subject="Subject",
        body="Body",
        meta_json=None,
        pack_id=pack_id,
        sent_at=None,
        provider_message_id=None,
    )
    contact = SimpleNamespace(id=message.contact_id, tenant_id=tenant_id, email=None, phone=None)
    db = _FakeDB([message, contact])

    def _raise_pack_status(*_args, **_kwargs):
        raise RuntimeError("pack lookup failed")

    monkeypatch.setattr(outreach, "enforce_outbound_policy", lambda *_args, **_kwargs: (True, None))
    monkeypatch.setattr(outreach, "_refresh_pack_rollup_status", _raise_pack_status)
    monkeypatch.setattr(outreach.settings, "sandbox_mode", False, raising=False)

    result = asyncio.run(outreach.approve_and_send(db, tenant_id, message_id))

    assert result["status"] == "failed"
    assert result["reason"] == "Contact has no email"
    assert result["pack_id"] == pack_id
    assert result["pack_status"] is None
    assert message.status == MessageStatus.failed
    assert message.meta_json["error"] == "Contact has no email"
    assert db.commits == 1


def test_sources_status_shape_for_authenticated_user(monkeypatch):
    app.dependency_overrides[get_db] = lambda: SimpleNamespace()
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(user_id=uuid4(), tenant_id=uuid4(), role="agent")

    payload = [{
        "source_name": "franklin_auditor",
        "mode": "fixture",
        "state": "partial",
        "reachable": None,
        "is_stale": True,
        "last_run_started_at": None,
        "last_run_finished_at": None,
        "last_success_at": None,
        "last_error": "seed fallback",
        "drift_detected": False,
        "drift_reason": None,
        "dlq_count": 0,
        "paused_reason": None,
        "updated_at": "2026-03-05T00:00:00+00:00",
    }]
    monkeypatch.setattr("app.api.routes_sources.get_sources_status", lambda *_args, **_kwargs: payload)

    try:
        with TestClient(app) as client:
            response = client.get("/sources/status")
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body.get("items"), list)
        assert body["items"][0]["source_name"] == "franklin_auditor"
        assert body["items"][0]["mode"] == "fixture"
        assert "updated_at" in body["items"][0]
    finally:
        app.dependency_overrides.clear()




class _FakeProvider:
    def __init__(self, result, name="provider"):
        self.result = result
        self.name = name
        self.calls = []

    async def send(self, *args):
        self.calls.append(args)
        return self.result


def test_approve_and_send_email_non_sandbox_invokes_provider(monkeypatch):
    tenant_id = uuid4()
    message_id = uuid4()
    pack_id = uuid4()

    message = SimpleNamespace(
        id=message_id,
        tenant_id=tenant_id,
        contact_id=uuid4(),
        status=MessageStatus.draft,
        channel=Channel.email,
        subject="Subject",
        body="Body",
        meta_json={},
        pack_id=pack_id,
        sent_at=None,
        provider_message_id=None,
    )
    contact = SimpleNamespace(id=message.contact_id, tenant_id=tenant_id, email="lead@example.com", phone=None)
    db = _FakeDB([message, contact, None])

    provider = _FakeProvider(
        result=SimpleNamespace(ok=True, provider_message_id="pm-123", error=None),
        name="postmark",
    )

    monkeypatch.setattr(outreach, "enforce_outbound_policy", lambda *_args, **_kwargs: (True, None))
    monkeypatch.setattr(outreach.settings, "sandbox_mode", False, raising=False)
    monkeypatch.setattr(outreach, "get_email_provider", lambda: provider)
    monkeypatch.setattr(outreach, "_safe_pack_status", lambda *_args, **_kwargs: "submitted")

    result = asyncio.run(outreach.approve_and_send(db, tenant_id, message_id))

    assert provider.calls == [("lead@example.com", "Subject", "Body")]
    assert message.status == MessageStatus.sent
    assert message.provider_message_id == "pm-123"
    assert message.meta_json["approval_state"] == "approved"
    assert result["status"] == "sent"
    assert result["provider_message_id"] == "pm-123"
    assert result["pack_id"] == pack_id
    assert result["pack_status"] == "submitted"
    assert db.commits == 1


def test_approve_and_send_sms_non_sandbox_invokes_provider(monkeypatch):
    tenant_id = uuid4()
    message_id = uuid4()
    pack_id = uuid4()

    message = SimpleNamespace(
        id=message_id,
        tenant_id=tenant_id,
        contact_id=uuid4(),
        status=MessageStatus.draft,
        channel=Channel.sms,
        subject=None,
        body="Hello from test",
        meta_json={},
        pack_id=pack_id,
        sent_at=None,
        provider_message_id=None,
    )
    contact = SimpleNamespace(id=message.contact_id, tenant_id=tenant_id, email=None, phone="+15555550123")
    db = _FakeDB([message, contact, None])

    provider = _FakeProvider(
        result=SimpleNamespace(ok=True, provider_message_id="sms-321", error=None),
        name="console_sms",
    )

    monkeypatch.setattr(outreach, "enforce_outbound_policy", lambda *_args, **_kwargs: (True, None))
    monkeypatch.setattr(outreach.settings, "sandbox_mode", False, raising=False)
    monkeypatch.setattr(outreach, "get_sms_provider", lambda: provider)
    monkeypatch.setattr(outreach, "_safe_pack_status", lambda *_args, **_kwargs: "approved")

    result = asyncio.run(outreach.approve_and_send(db, tenant_id, message_id))

    assert provider.calls == [("+15555550123", "Hello from test")]
    assert message.status == MessageStatus.sent
    assert message.provider_message_id == "sms-321"
    assert message.meta_json["provider_fallback_reason"] == "Missing Twilio credentials; using console provider"
    assert message.meta_json["approval_state"] == "approved"
    assert result["status"] == "sent"
    assert result["provider_message_id"] == "sms-321"
    assert result["pack_id"] == pack_id
    assert result["pack_status"] == "approved"
    assert db.commits == 1

def test_retry_with_jitter_logs_error_context(monkeypatch):
	attempts = {'count': 0}
	warning_calls = []

	async def flaky_fetch():
		attempts['count'] += 1
		if attempts['count'] == 1:
			raise RuntimeError('boom')
		return [{'ok': True}]

	async def fake_sleep(_delay):
		return None

	def fake_warning(message, *args, **kwargs):
		warning_calls.append((message, kwargs.get('extra', {})))

	monkeypatch.setattr(ingestion.random, 'uniform', lambda *_args, **_kwargs: 0.0)
	monkeypatch.setattr(ingestion.asyncio, 'sleep', fake_sleep)
	monkeypatch.setattr(ingestion.logger, 'warning', fake_warning)

	result = asyncio.run(
		ingestion._retry_with_jitter(
			flaky_fetch,
			source_label='test_source',
			max_attempts=2,
			base_delay_seconds=0.1,
			jitter_seconds=0.0,
		)
	)

	assert result == [{'ok': True}]
	assert attempts['count'] == 2
	assert len(warning_calls) == 1

	message, extra = warning_calls[0]
	assert message == 'ingest_live_fetch_retry'
	assert extra['source'] == 'test_source'
	assert extra['attempt'] == 1
	assert extra['max_attempts'] == 2
	assert extra['delay_seconds'] == pytest.approx(0.1)
	assert extra['error'] == 'boom'

def test_seed_flood_zone_bad_ring_logs_warning(monkeypatch):
	warnings = []

	def fake_warning(message, *args, **kwargs):
		warnings.append((message, args, kwargs))

	bad_row = {
		'external_id': 'flood-1',
		'zone_code': 'AE',
		'coordinates': [[[['x', 'y'], ['x', 'y'], ['x', 'y'], ['x', 'y']]]],
	}

	monkeypatch.setattr(app_seed, 'load_seed_json', lambda _name: [bad_row])
	monkeypatch.setattr(app_seed.logger, 'warning', fake_warning)

	app_seed._seed_flood_zones(SimpleNamespace(), uuid4(), SimpleNamespace())

	assert len(warnings) == 1
	message, args, _kwargs = warnings[0]
	assert message == 'seed flood zone ring parse failed for %s: %s'
	assert args[0] == 'flood-1'
	assert isinstance(args[1], Exception)


def test_approve_and_send_non_draft_returns_idempotent_payload(monkeypatch):
 tenant_id = uuid4()
 message_id = uuid4()
 pack_id = uuid4()

 message = SimpleNamespace(
 id=message_id,
 tenant_id=tenant_id,
 contact_id=uuid4(),
 status=MessageStatus.sent,
 channel=Channel.email,
 subject='Subject',
 body='Body',
 meta_json={},
 pack_id=pack_id,
 sent_at=None,
 provider_message_id='pm-existing',
 )
 db = _FakeDB([message])

 provider = _FakeProvider(
 result=SimpleNamespace(ok=True, provider_message_id='pm-new', error=None),
 name='postmark',
 )

 monkeypatch.setattr(outreach, 'get_email_provider', lambda: provider)
 monkeypatch.setattr(outreach, '_safe_pack_status', lambda *_args, **_kwargs: 'approved')

 result = asyncio.run(outreach.approve_and_send(db, tenant_id, message_id))

 assert result['status'] == 'sent'
 assert result['provider_message_id'] == 'pm-existing'
 assert result['pack_id'] == pack_id
 assert result['pack_status'] == 'approved'
 assert result['idempotent'] is True
 assert provider.calls == []
 assert db.commits == 0

