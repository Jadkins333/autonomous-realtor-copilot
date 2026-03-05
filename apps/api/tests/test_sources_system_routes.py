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
