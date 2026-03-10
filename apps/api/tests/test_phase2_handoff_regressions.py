from __future__ import annotations

import asyncio
from datetime import UTC, datetime
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
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(
        user_id=uuid4(), tenant_id=uuid4(), role="agent"
    )

    payload = [
        {
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
        }
    ]
    monkeypatch.setattr(
        "app.api.routes_sources.get_sources_status", lambda *_args, **_kwargs: payload
    )

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


class _FakeVoiceProvider(_FakeProvider):
    async def call(self, *args):
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
    contact = SimpleNamespace(
        id=message.contact_id, tenant_id=tenant_id, email="lead@example.com", phone=None
    )
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
    contact = SimpleNamespace(
        id=message.contact_id, tenant_id=tenant_id, email=None, phone="+15555550123"
    )
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
    assert (
        message.meta_json["provider_fallback_reason"]
        == "Missing Twilio credentials; using console provider"
    )
    assert message.meta_json["approval_state"] == "approved"
    assert result["status"] == "sent"
    assert result["provider_message_id"] == "sms-321"
    assert result["pack_id"] == pack_id
    assert result["pack_status"] == "approved"
    assert db.commits == 1


def test_approve_and_send_voice_non_sandbox_invokes_provider(monkeypatch):
    tenant_id = uuid4()
    message_id = uuid4()
    pack_id = uuid4()

    message = SimpleNamespace(
        id=message_id,
        tenant_id=tenant_id,
        contact_id=uuid4(),
        status=MessageStatus.draft,
        channel=Channel.voice,
        subject=None,
        body="Approved voice script",
        meta_json={},
        pack_id=pack_id,
        sent_at=None,
        provider_message_id=None,
    )
    contact = SimpleNamespace(
        id=message.contact_id, tenant_id=tenant_id, email=None, phone="+15555550123"
    )
    db = _FakeDB([message, contact, None])

    provider = _FakeVoiceProvider(
        result=SimpleNamespace(
            ok=True,
            provider_message_id="CA-voice-123",
            provider_status="queued",
            provider_payload={"sid": "CA-voice-123", "status": "queued"},
            error=None,
        ),
        name="twilio_voice",
    )

    monkeypatch.setattr(outreach, "enforce_outbound_policy", lambda *_args, **_kwargs: (True, None))
    monkeypatch.setattr(outreach.settings, "sandbox_mode", False, raising=False)
    monkeypatch.setattr(outreach.settings, "public_api_base_url", "https://staging.example.com/api", raising=False)
    monkeypatch.setattr(
        outreach,
        "get_voice_provider_status",
        lambda: SimpleNamespace(available=True, reason=None, provider_name="twilio_voice"),
    )
    monkeypatch.setattr(outreach, "get_voice_provider", lambda: provider)
    monkeypatch.setattr(outreach, "_safe_pack_status", lambda *_args, **_kwargs: "approved")

    result = asyncio.run(outreach.approve_and_send(db, tenant_id, message_id))

    assert provider.calls == [
        (
            "+15555550123",
            f"https://staging.example.com/api/webhooks/twilio/voice/twiml/{message_id}",
            "https://staging.example.com/api/webhooks/twilio/voice/status",
        )
    ]
    assert message.status == MessageStatus.queued
    assert message.provider_message_id == "CA-voice-123"
    assert message.meta_json["approval_state"] == "approved"
    assert message.meta_json["voice_twiml_url"].endswith(f"/{message_id}")
    assert result["status"] == "queued"
    assert result["provider_message_id"] == "CA-voice-123"
    assert db.commits == 1


def test_approve_and_send_voice_returns_unavailable_without_provider(monkeypatch):
    tenant_id = uuid4()
    message_id = uuid4()
    pack_id = uuid4()

    message = SimpleNamespace(
        id=message_id,
        tenant_id=tenant_id,
        contact_id=uuid4(),
        status=MessageStatus.draft,
        channel=Channel.voice,
        subject=None,
        body="Approved voice script",
        meta_json={},
        pack_id=pack_id,
        sent_at=None,
        provider_message_id=None,
    )
    contact = SimpleNamespace(
        id=message.contact_id, tenant_id=tenant_id, email=None, phone="+15555550123"
    )
    db = _FakeDB([message, contact])

    monkeypatch.setattr(outreach, "enforce_outbound_policy", lambda *_args, **_kwargs: (True, None))
    monkeypatch.setattr(outreach.settings, "sandbox_mode", False, raising=False)
    monkeypatch.setattr(
        outreach,
        "get_voice_provider_status",
        lambda: SimpleNamespace(
            available=False,
            reason="Twilio Voice requires TWILIO_VOICE_FROM_NUMBER or TWILIO_FROM_NUMBER.",
        ),
    )
    monkeypatch.setattr(outreach, "get_voice_provider", lambda: None)
    monkeypatch.setattr(outreach, "_safe_pack_status", lambda *_args, **_kwargs: "submitted")

    result = asyncio.run(outreach.approve_and_send(db, tenant_id, message_id))

    assert result["status"] == "unavailable"
    assert result["approval_state"] == "draft"
    assert "TWILIO_VOICE_FROM_NUMBER" in result["reason"]
    assert message.status == MessageStatus.draft
    assert db.commits == 0


def test_retry_with_jitter_logs_error_context(monkeypatch):
    attempts = {"count": 0}
    warning_calls = []

    async def flaky_fetch():
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("boom")
        return [{"ok": True}]

    async def fake_sleep(_delay):
        return None

    def fake_warning(message, *args, **kwargs):
        warning_calls.append((message, kwargs.get("extra", {})))

    monkeypatch.setattr(ingestion.random, "uniform", lambda *_args, **_kwargs: 0.0)
    monkeypatch.setattr(ingestion.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(ingestion.logger, "warning", fake_warning)

    result = asyncio.run(
        ingestion._retry_with_jitter(
            flaky_fetch,
            source_label="test_source",
            max_attempts=2,
            base_delay_seconds=0.1,
            jitter_seconds=0.0,
        )
    )

    assert result == [{"ok": True}]
    assert attempts["count"] == 2
    assert len(warning_calls) == 1

    message, extra = warning_calls[0]
    assert message == "ingest_live_fetch_retry"
    assert extra["source"] == "test_source"
    assert extra["attempt"] == 1
    assert extra["max_attempts"] == 2
    assert extra["delay_seconds"] == pytest.approx(0.1)
    assert extra["error"] == "boom"


def test_seed_flood_zone_bad_ring_logs_warning(monkeypatch):
    warnings = []

    def fake_warning(message, *args, **kwargs):
        warnings.append((message, args, kwargs))

    bad_row = {
        "external_id": "flood-1",
        "zone_code": "AE",
        "coordinates": [[[["x", "y"], ["x", "y"], ["x", "y"], ["x", "y"]]]],
    }

    monkeypatch.setattr(app_seed, "load_seed_json", lambda _name: [bad_row])
    monkeypatch.setattr(app_seed.logger, "warning", fake_warning)

    app_seed._seed_flood_zones(SimpleNamespace(), uuid4(), SimpleNamespace())

    assert len(warnings) == 1
    message, args, _kwargs = warnings[0]
    assert message == "seed flood zone ring parse failed for %s: %s"
    assert args[0] == "flood-1"
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
        subject="Subject",
        body="Body",
        meta_json={},
        pack_id=pack_id,
        sent_at=None,
        provider_message_id="pm-existing",
    )
    db = _FakeDB([message])

    provider = _FakeProvider(
        result=SimpleNamespace(ok=True, provider_message_id="pm-new", error=None),
        name="postmark",
    )

    monkeypatch.setattr(outreach, "get_email_provider", lambda: provider)
    monkeypatch.setattr(outreach, "_safe_pack_status", lambda *_args, **_kwargs: "approved")

    result = asyncio.run(outreach.approve_and_send(db, tenant_id, message_id))

    assert result["status"] == "sent"
    assert result["provider_message_id"] == "pm-existing"
    assert result["pack_id"] == pack_id
    assert result["pack_status"] == "approved"
    assert result["idempotent"] is True
    assert provider.calls == []
    assert db.commits == 0


def test_trim_error_text_returns_tail():
    value = "x" * (ingestion.MAX_ERROR_TEXT_CHARS + 25)
    trimmed = ingestion._trim_error_text(value)
    assert len(trimmed) == ingestion.MAX_ERROR_TEXT_CHARS
    assert trimmed == value[-ingestion.MAX_ERROR_TEXT_CHARS :]


class _NestedTxn:
    def __init__(self, db):
        self.db = db

    def __enter__(self):
        self.db.begin_nested_calls += 1
        return self

    def __exit__(self, exc_type, _exc, _tb):
        if exc_type:
            self.db.nested_errors += 1
        return False


class _NestedDB:
    def __init__(self):
        self.begin_nested_calls = 0
        self.nested_errors = 0

    def begin_nested(self):
        return _NestedTxn(self)


def test_process_rows_continues_after_row_upsert_failure(monkeypatch):
    db = _NestedDB()
    source = SimpleNamespace(id=uuid4(), name="franklin_auditor", base_url="seed://auditor")
    rows = [{"external_id": "row-1"}, {"external_id": "row-2"}]
    drift_events = []
    upsert_calls = {"count": 0}

    monkeypatch.setattr(
        ingestion,
        "_upsert_provenance",
        lambda *_args, **_kwargs: (SimpleNamespace(id=uuid4()), False),
    )
    monkeypatch.setattr(
        ingestion,
        "_record_schema_drift",
        lambda *_args, **kwargs: drift_events.append(kwargs["event_type"]) or True,
    )

    def upserter(_db, _tenant_id, _item, _provenance_id):
        upsert_calls["count"] += 1
        if upsert_calls["count"] == 1:
            raise RuntimeError("boom")

    ingested, skipped, drift_count = asyncio.run(
        ingestion._process_rows(
            db,
            uuid4(),
            source,
            source.base_url,
            rows,
            lambda raw: raw,
            upserter,
        )
    )

    assert ingested == 1
    assert skipped == 0
    assert drift_count == 1
    assert drift_events == ["upsert_error"]
    assert db.begin_nested_calls == 3
    assert db.nested_errors == 1


class _ReplayResult:
    def __init__(self, scalar=None, scalars=None):
        self._scalar = scalar
        self._scalars = scalars or []

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return iter(self._scalars)


class _ReplayDB:
    def __init__(self, results):
        self.results = list(results)
        self.commits = 0

    def execute(self, *_args, **_kwargs):
        return self.results.pop(0)

    def commit(self):
        self.commits += 1


def test_replay_source_dlq_enforces_retry_cap_and_trims_error(monkeypatch):
    source = SimpleNamespace(id=uuid4(), name="franklin_auditor")
    status_row = SimpleNamespace(drift_detected=False, state=ingestion.SourceState.ok)
    dlq_item = SimpleNamespace(
        id=uuid4(),
        source_id=source.id,
        occurred_at=datetime.now(tz=UTC),
        raw_json={"external_id": "row-1"},
        raw_url="seed://auditor#row-1",
        external_id="row-1",
        error_text="e" * (ingestion.MAX_ERROR_TEXT_CHARS + 10),
        replay_count=ingestion.MAX_REPLAY_RETRIES - 1,
        last_replayed_at=None,
    )

    db = _ReplayDB(
        [
            _ReplayResult(scalar=source),
            _ReplayResult(scalars=[dlq_item]),
            _ReplayResult(scalars=[]),
            _ReplayResult(scalar=source),
            _ReplayResult(scalars=[]),
        ]
    )

    class _Validated:
        def model_dump(self, mode="python"):
            return {"external_id": "row-1"}

    monkeypatch.setattr(ingestion, "get_or_create_source_status", lambda *_args, **_kwargs: status_row)
    monkeypatch.setattr(ingestion, "recompute_source_dlq_count_by_source_id", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(ingestion, "_replay_config_for_source", lambda *_args, **_kwargs: (lambda _raw: _Validated(), lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("x" * 4000))))
    monkeypatch.setattr(
        ingestion,
        "_upsert_provenance",
        lambda *_args, **_kwargs: (SimpleNamespace(id=uuid4()), False),
    )

    first = ingestion.replay_source_dlq(db, uuid4(), "franklin_auditor")
    second = ingestion.replay_source_dlq(db, uuid4(), "franklin_auditor")

    assert first["attempted"] == 1
    assert first["failed"] == 1
    assert dlq_item.replay_count == ingestion.MAX_REPLAY_RETRIES
    assert len(dlq_item.error_text) == ingestion.MAX_ERROR_TEXT_CHARS
    assert dlq_item.error_text == ("x" * ingestion.MAX_ERROR_TEXT_CHARS)
    assert second["attempted"] == 0
    assert db.commits == 2
