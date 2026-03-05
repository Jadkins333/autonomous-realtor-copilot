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


