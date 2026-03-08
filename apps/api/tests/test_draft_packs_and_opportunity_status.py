from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app


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
                "channels": ["sms", "email", "voice"],
                "sandbox": True,
            },
        )
        assert created.status_code == 200
        payload = created.json()
        assert len(payload["drafts"]) == 3
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
