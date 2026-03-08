from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.deps import AuthContext, get_admin_auth_context
from app.db.session import get_db
from app.main import app
from app.utils.security import create_access_token


class DummyDB:
    def commit(self) -> None:
        return


def _auth_header(role: str) -> dict[str, str]:
    token = create_access_token(user_id=uuid4(), tenant_id=uuid4(), role=role)
    return {"Authorization": f"Bearer {token}"}


def test_sources_status_requires_auth() -> None:
    with TestClient(app) as client:
        response = client.get("/sources/status")
    assert response.status_code == 401


def test_system_diagnostics_requires_auth() -> None:
    with TestClient(app) as client:
        response = client.get("/system/diagnostics")
    assert response.status_code == 401


def test_opportunities_requires_auth() -> None:
    with TestClient(app) as client:
        response = client.get("/opportunities")
    assert response.status_code == 401


def test_opportunity_events_requires_auth() -> None:
    with TestClient(app) as client:
        response = client.get("/opportunities/events")
    assert response.status_code == 401


def test_opportunities_shape_for_authenticated_user(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    monkeypatch.setattr(
        "app.api.routes_opportunities.list_opportunities",
        lambda *_args, **_kwargs: {
            "status": "ok",
            "model_version": "v1",
            "items": [
                {
                    "parcel_id": str(uuid4()),
                    "address": "145 N High St",
                    "neighborhood_heat": {"value": {"score_0_100": 72}},
                    "distress_likelihood": {"value": {"score_0_1": 0.58}},
                }
            ],
        },
    )

    try:
        with TestClient(app) as client:
            response = client.get("/opportunities", headers=_auth_header("agent"))
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "ok"
        assert isinstance(payload["items"], list)
        assert "parcel_id" in payload["items"][0]
    finally:
        app.dependency_overrides.clear()


def test_opportunity_events_shape_for_authenticated_user(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    monkeypatch.setattr(
        "app.api.routes_opportunities.list_opportunity_events",
        lambda *_args, **_kwargs: {
            "status": "ok",
            "filters": {"days": 30},
            "items": [
                {
                    "id": str(uuid4()),
                    "parcel_id": str(uuid4()),
                    "address": "145 N High St",
                    "event_type": "distress_signal_crossed",
                    "severity": "medium",
                    "created_at": "2026-03-05T00:00:00+00:00",
                }
            ],
        },
    )

    try:
        with TestClient(app) as client:
            response = client.get("/opportunities/events?days=30", headers=_auth_header("agent"))
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "ok"
        assert isinstance(payload["items"], list)
        assert "event_type" in payload["items"][0]
    finally:
        app.dependency_overrides.clear()


def test_pause_requires_admin(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    monkeypatch.setattr(
        "app.api.routes_sources.set_source_pause",
        lambda *_args, **_kwargs: {"source_name": "franklin_auditor", "state": "paused"},
    )

    try:
        with TestClient(app) as client:
            response = client.post(
                "/sources/franklin_auditor/pause",
                headers=_auth_header("agent"),
                json={"reason": "manual pause"},
            )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_pause_allows_admin(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    monkeypatch.setattr(
        "app.api.routes_sources.set_source_pause",
        lambda *_args, **_kwargs: {
            "source_name": "franklin_auditor",
            "state": "paused",
            "paused_reason": "manual pause",
        },
    )

    try:
        with TestClient(app) as client:
            response = client.post(
                "/sources/franklin_auditor/pause",
                headers=_auth_header("admin"),
                json={"reason": "manual pause"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["state"] == "paused"
    finally:
        app.dependency_overrides.clear()


def test_replay_refusal_returns_409(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    monkeypatch.setattr(
        "app.api.routes_sources.replay_source_dlq",
        lambda *_args, **_kwargs: {
            "ok": False,
            "message": "Replay blocked: drift_detected=true. Resolve drift and resume source first.",
            "attempted": 0,
            "succeeded": 0,
            "failed": 0,
            "skipped_duplicate": 0,
        },
    )

    try:
        with TestClient(app) as client:
            response = client.post(
                "/sources/franklin_auditor/dlq/replay",
                headers=_auth_header("admin"),
            )
        assert response.status_code == 409
        detail = response.json()["detail"]
        assert "Replay blocked" in detail["message"]
    finally:
        app.dependency_overrides.clear()


def test_system_diagnostics_admin_shape_and_safe_fields(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    monkeypatch.setattr(
        "app.api.routes_system.get_system_diagnostics",
        lambda *_args, **_kwargs: {
            "generated_at": "2026-03-05T00:00:00+00:00",
            "build": {"app_name": "API", "version": "1.0.0", "commit_sha": "unknown"},
            "db": {"ok": True, "message": "ok"},
            "redis": {"ok": True, "message": "ok"},
            "worker_heartbeat": {"last_seen": None},
            "beat_heartbeat": {"last_seen": None},
            "sources": [{"source_name": "franklin_auditor", "mode": "fixture", "reachable": "n/a (fixture)"}],
        },
    )

    try:
        with TestClient(app) as client:
            response = client.get("/system/diagnostics", headers=_auth_header("admin"))
        assert response.status_code == 200
        payload = response.json()
        for key in ["build", "db", "redis", "sources"]:
            assert key in payload
        payload_text = str(payload).lower()
        assert "password" not in payload_text
        assert "token" not in payload_text
        assert "secret" not in payload_text
    finally:
        app.dependency_overrides.clear()


def test_resume_requires_admin(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    monkeypatch.setattr(
        "app.api.routes_sources.set_source_resume",
        lambda *_args, **_kwargs: {"source_name": "franklin_auditor", "state": "ok"},
    )

    try:
        with TestClient(app) as client:
            response = client.post(
                "/sources/franklin_auditor/resume",
                headers=_auth_header("agent"),
            )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_resume_allows_admin(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    monkeypatch.setattr(
        "app.api.routes_sources.set_source_resume",
        lambda *_args, **_kwargs: {"source_name": "franklin_auditor", "state": "ok"},
    )

    try:
        with TestClient(app) as client:
            response = client.post(
                "/sources/franklin_auditor/resume",
                headers=_auth_header("admin"),
            )
        assert response.status_code == 200
        assert response.json()["state"] == "ok"
    finally:
        app.dependency_overrides.clear()


def test_replay_allows_admin_success(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    monkeypatch.setattr(
        "app.api.routes_sources.replay_source_dlq",
        lambda *_args, **_kwargs: {
            "ok": True,
            "attempted": 3,
            "succeeded": 3,
            "failed": 0,
            "skipped_duplicate": 0,
            "message": "Replayed 3 items",
        },
    )

    try:
        with TestClient(app) as client:
            response = client.post(
                "/sources/franklin_auditor/dlq/replay",
                headers=_auth_header("admin"),
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["ok"] is True
        assert payload["attempted"] == 3
        assert payload["succeeded"] == 3
    finally:
        app.dependency_overrides.clear()


def test_sources_status_shape_authenticated(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    monkeypatch.setattr(
        "app.api.routes_sources.get_sources_status",
        lambda *_args, **_kwargs: [
            {
                "source_name": "franklin_auditor",
                "mode": "fixture",
                "state": "partial",
                "reachable": None,
                "is_stale": True,
                "last_run_started_at": None,
                "last_run_finished_at": None,
                "last_success_at": None,
                "last_error": "Live source unavailable",
                "drift_detected": False,
                "drift_reason": None,
                "dlq_count": 0,
                "paused_reason": None,
                "updated_at": "2026-03-07T00:00:00+00:00",
            }
        ],
    )

    try:
        with TestClient(app) as client:
            response = client.get("/sources/status", headers=_auth_header("agent"))
        assert response.status_code == 200
        payload = response.json()
        assert "items" in payload
        item = payload["items"][0]
        assert item["source_name"] == "franklin_auditor"
        assert item["state"] == "partial"
        assert item["is_stale"] is True
    finally:
        app.dependency_overrides.clear()


def test_debug_drift_disabled_in_production(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    app.dependency_overrides[get_admin_auth_context] = lambda: AuthContext(user_id=uuid4(), tenant_id=uuid4(), role="admin")

    monkeypatch.setattr("app.api.routes_sources.settings.environment", "production", raising=False)
    monkeypatch.setattr("app.api.routes_sources.settings.debug_diag", False, raising=False)

    try:
        with TestClient(app) as client:
            response = client.post(
                "/sources/franklin_auditor/debug/drift",
                json={"drift_detected": True, "reason": "test"},
            )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_debug_drift_disabled_in_production_even_when_debug_enabled(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    app.dependency_overrides[get_admin_auth_context] = lambda: AuthContext(user_id=uuid4(), tenant_id=uuid4(), role="admin")

    monkeypatch.setattr("app.api.routes_sources.settings.environment", "production", raising=False)
    monkeypatch.setattr("app.api.routes_sources.settings.debug_diag", True, raising=False)

    try:
        with TestClient(app) as client:
            response = client.post(
                "/sources/franklin_auditor/debug/drift",
                json={"drift_detected": True, "reason": "test"},
            )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()
