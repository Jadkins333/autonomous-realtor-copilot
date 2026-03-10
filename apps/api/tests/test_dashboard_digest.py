from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import app
from app.utils.security import create_access_token


class DummyDB:
    def commit(self) -> None:
        return


def _auth_header(role: str) -> dict[str, str]:
    token = create_access_token(user_id=uuid4(), tenant_id=uuid4(), role=role)
    return {"Authorization": f"Bearer {token}"}


def test_dashboard_digest_requires_auth() -> None:
    with TestClient(app) as client:
        response = client.get("/system/dashboard-digest")
    assert response.status_code == 401


def test_dashboard_digest_shape_for_authenticated_user(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    monkeypatch.setattr(
        "app.api.routes_system.build_dashboard_digest",
        lambda *_args, **_kwargs: {
            "generated_at": "2026-03-10T14:00:00+00:00",
            "verified_at": "2026-03-10T14:00:00+00:00",
            "overview": {
                "verified_label": "Deterministic digest",
                "parcels": 42,
                "messages": 12,
                "drafts": 3,
            },
            "urgent_tasks": [
                {
                    "title": "1 source requires review",
                    "detail": "franklin_auditor is stale",
                    "href": "/sources",
                    "severity": "warning",
                }
            ],
            "market_shift": {
                "status": "ok",
                "score_0_100": 61.5,
                "freshness": {"staleness": "fresh", "fetched_at": "2026-03-10T13:50:00+00:00"},
                "drivers": [{"label": "Permit momentum", "value": "moderate"}],
            },
            "client_milestones": [
                {
                    "contact_id": str(uuid4()),
                    "contact_name": "Ava Agent",
                    "detail": "Reply is waiting",
                    "href": "/contacts/123",
                    "kind": "reply_needed",
                }
            ],
            "follow_up_opportunities": [
                {
                    "parcel_id": str(uuid4()),
                    "address": "145 N High St",
                    "heat_score": 72,
                    "distress_score": 0.58,
                    "href": "/properties/123",
                }
            ],
            "conversation_starters": {
                "label": "Verified talking points",
                "verified_facts": ["Permit momentum is moderate."],
                "variants": [
                    {
                        "tone": "email",
                        "text": "We are seeing moderate permit momentum in your area this month.",
                    }
                ],
                "ai_generated": False,
                "provider_label": None,
            },
        },
    )

    try:
        with TestClient(app) as client:
            response = client.get("/system/dashboard-digest", headers=_auth_header("agent"))
        assert response.status_code == 200
        payload = response.json()
        assert payload["overview"]["verified_label"] == "Deterministic digest"
        assert payload["urgent_tasks"][0]["href"] == "/sources"
        assert payload["market_shift"]["score_0_100"] == 61.5
        assert payload["conversation_starters"]["variants"][0]["tone"] == "email"
    finally:
        app.dependency_overrides.clear()
