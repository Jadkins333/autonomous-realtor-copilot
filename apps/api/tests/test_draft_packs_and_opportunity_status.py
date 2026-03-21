from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.main import app


class DummyDB:
    pass


def test_draft_pack_create_submit_approve_reject_flow() -> None:
    pack_id = uuid4()
    draft_ids = [uuid4(), uuid4(), uuid4()]

    app.dependency_overrides[get_db] = lambda: DummyDB()
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(user_id=uuid4(), tenant_id=uuid4(), role="agent")

    try:
        from app.api import routes_outreach

        original_create = routes_outreach.create_draft_pack
        original_submit = routes_outreach.submit_draft_pack
        original_approve = routes_outreach.approve_and_send
        original_reject = routes_outreach.reject_draft
        original_fetch = routes_outreach.get_draft_pack

        routes_outreach.create_draft_pack = lambda *_args, **_kwargs: {
            "id": pack_id,
            "created_at": "2026-03-19T12:00:00+00:00",
            "created_by_user_id": uuid4(),
            "parcel_id": None,
            "contact_id": uuid4(),
            "status": "draft",
            "sandbox": True,
            "objective": "Test multi-channel outreach pack",
            "drafts": [
                {
                    "id": draft_ids[0],
                    "contact_id": uuid4(),
                    "channel": "sms",
                    "body": "Body",
                    "status": "draft",
                    "created_at": "2026-03-19T12:00:00+00:00",
                },
                {
                    "id": draft_ids[1],
                    "contact_id": uuid4(),
                    "channel": "email",
                    "subject": "Subject",
                    "body": "Body",
                    "status": "draft",
                    "created_at": "2026-03-19T12:00:00+00:00",
                },
                {
                    "id": draft_ids[2],
                    "contact_id": uuid4(),
                    "channel": "voice",
                    "body": "Body",
                    "status": "draft",
                    "created_at": "2026-03-19T12:00:00+00:00",
                },
            ],
        }
        routes_outreach.submit_draft_pack = lambda *_args, **_kwargs: {
            "id": pack_id,
            "status": "submitted",
            "submitted_at": "2026-03-19T12:01:00+00:00",
        }
        async def fake_approve_and_send(*_args, **_kwargs) -> dict[str, Any]:
            return {
                "status": "sandbox_staged",
                "pack_id": pack_id,
                "pack_status": "submitted",
                "policy_snapshot": {
                    "allowed": True,
                    "reason_codes": [],
                    "human_readable_explanations": [],
                    "evaluated_at": "2026-03-19T12:01:30+00:00",
                    "recipient_timezone_used": "America/New_York",
                    "consent_evidence_refs": [],
                    "delivery_mode": "sandbox",
                    "fair_housing_scan": {
                        "blocked": False,
                        "flagged_terms": [],
                        "reason_codes": [],
                        "explanations": [],
                    },
                },
            }

        routes_outreach.approve_and_send = fake_approve_and_send
        routes_outreach.reject_draft = lambda *_args, **_kwargs: {
            "id": draft_ids[1],
            "pack_id": pack_id,
            "status": "blocked",
            "approval_state": "rejected",
            "pack_status": "rejected",
            "reason_codes": [],
            "explanations": [],
        }
        routes_outreach.get_draft_pack = lambda *_args, **_kwargs: {
            "id": pack_id,
            "created_at": "2026-03-19T12:00:00+00:00",
            "created_by_user_id": uuid4(),
            "parcel_id": None,
            "contact_id": uuid4(),
            "status": "rejected",
            "sandbox": True,
            "objective": "Test multi-channel outreach pack",
            "drafts": [],
        }

        with TestClient(app) as client:
            headers = {"Authorization": "Bearer demo"}
            created = client.post(
                "/outreach/draft-pack",
                headers=headers,
                json={
                    "contact_id": str(uuid4()),
                    "objective": "Test multi-channel outreach pack",
                    "channels": ["sms", "email", "voice"],
                    "sandbox": True,
                },
            )
            assert created.status_code == 200
            payload = created.json()
            assert len(payload["drafts"]) == 3

            submitted = client.post(f"/outreach/draft-pack/{pack_id}/submit", headers=headers)
            assert submitted.status_code == 200
            assert submitted.json()["status"] == "submitted"

            approved = client.post(f"/outreach/drafts/{draft_ids[0]}/approve", headers=headers)
            assert approved.status_code == 200
            assert approved.json()["approval_state"] == "approved"

            rejected = client.post(f"/outreach/drafts/{draft_ids[1]}/reject", headers=headers)
            assert rejected.status_code == 200
            assert rejected.json()["approval_state"] == "rejected"
            assert rejected.json()["pack_status"] == "rejected"

            fetched = client.get(f"/outreach/draft-pack/{pack_id}", headers=headers)
            assert fetched.status_code == 200
            assert fetched.json()["status"] == "rejected"
    finally:
        from app.api import routes_outreach

        routes_outreach.create_draft_pack = original_create
        routes_outreach.submit_draft_pack = original_submit
        routes_outreach.approve_and_send = original_approve
        routes_outreach.reject_draft = original_reject
        routes_outreach.get_draft_pack = original_fetch
        app.dependency_overrides.clear()


def test_opportunity_status_change_creates_event_row() -> None:
    parcel_id = uuid4()
    app.dependency_overrides[get_db] = lambda: DummyDB()
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(user_id=uuid4(), tenant_id=uuid4(), role="agent")

    try:
        from app.api import routes_opportunities

        original_set = routes_opportunities.set_opportunity_status
        original_list = routes_opportunities.list_opportunity_events

        routes_opportunities.set_opportunity_status = lambda *_args, **_kwargs: {
            "parcel_id": str(parcel_id),
            "status": "active",
            "blocked": False,
        }
        routes_opportunities.list_opportunity_events = lambda *_args, **_kwargs: {
            "status": "ok",
            "items": [
                {
                    "event_type": "status_change",
                    "details": {"to_status": "active"},
                }
            ],
        }

        with TestClient(app) as client:
            headers = {"Authorization": "Bearer demo"}
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
    finally:
        from app.api import routes_opportunities

        routes_opportunities.set_opportunity_status = original_set
        routes_opportunities.list_opportunity_events = original_list
        app.dependency_overrides.clear()


def test_parcel_detail_exposes_source_origin_and_restriction_metadata() -> None:
    parcel_id = uuid4()
    app.dependency_overrides[get_db] = lambda: DummyDB()
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(user_id=uuid4(), tenant_id=uuid4(), role="agent")
    original_search = None
    original_detail = None

    try:
        from app.api import routes_parcels

        original_search = routes_parcels.search_parcels
        original_detail = routes_parcels.get_parcel_detail

        routes_parcels.search_parcels = lambda *_args, **_kwargs: [
            {
                "id": str(parcel_id),
                "parcel_number": "010-123456",
                "address": "145 N High St",
                "city": "Columbus",
                "state": "OH",
                "zip": "43215",
                "updated_at": "2026-03-19T12:00:00+00:00",
                "source_origin": "public_record",
                "field_origin_mode": "record_level",
                "display_policy": {
                    "can_display_public": True,
                    "can_display_authenticated": True,
                    "requires_vow_registration": False,
                    "can_cache_offline": True,
                    "can_export": True,
                    "can_use_in_ai_summary": True,
                    "can_use_in_mobile": True,
                    "block_reason_codes": [],
                    "required_prerequisites": [],
                    "current_surface": "web",
                    "current_surface_allowed": True,
                },
                "freshness": {
                    "fetched_at": "2026-03-19T12:00:00+00:00",
                    "ttl_seconds": 86400,
                    "staleness": "fresh",
                    "is_stale": False,
                },
                "attribution_requirements": [],
                "restricted_actions": [],
                "restricted_content": {"blocked": False, "title": None, "message": None, "reason_codes": []},
                "vow_registration": None,
                "disclosure_status": {
                    "allowed": True,
                    "blocking_disclosures": [],
                    "reason_codes": [],
                    "human_readable_messages": [],
                    "jurisdiction": "OH",
                },
                "public_page_compliance": {
                    "jurisdiction": "OH",
                    "last_updated_at": "2026-03-19T12:00:00+00:00",
                    "status": "ok",
                    "message": "Current for public presentation.",
                    "update_window_days": 30,
                },
            }
        ]
        routes_parcels.get_parcel_detail = lambda *_args, **_kwargs: {
            "id": str(parcel_id),
            "parcel_number": "010-123456",
            "address": "145 N High St",
            "city": "Columbus",
            "state": "OH",
            "zip": "43215",
            "updated_at": "2026-03-19T12:00:00+00:00",
            "source_origin": "public_record",
            "field_origin_mode": "record_level",
            "display_policy": {
                "can_display_public": True,
                "can_display_authenticated": True,
                "requires_vow_registration": False,
                "can_cache_offline": True,
                "can_export": True,
                "can_use_in_ai_summary": True,
                "can_use_in_mobile": True,
                "block_reason_codes": [],
                "required_prerequisites": [],
                "current_surface": "web",
                "current_surface_allowed": True,
            },
            "freshness": {
                "fetched_at": "2026-03-19T12:00:00+00:00",
                "ttl_seconds": 86400,
                "staleness": "fresh",
                "is_stale": False,
            },
            "attribution_requirements": [],
            "restricted_actions": [],
            "restricted_content": {"blocked": False, "title": None, "message": None, "reason_codes": []},
            "vow_registration": None,
            "disclosure_status": {
                "allowed": True,
                "blocking_disclosures": [],
                "reason_codes": [],
                "human_readable_messages": [],
                "jurisdiction": "OH",
            },
            "public_page_compliance": {
                "jurisdiction": "OH",
                "last_updated_at": "2026-03-19T12:00:00+00:00",
                "status": "ok",
                "message": "Current for public presentation.",
                "update_window_days": 30,
            },
            "attributes_json": {},
            "provenance": {},
            "permits_summary": {},
            "flood_zone": {},
            "nearby_pois": [],
            "transit_proximity": {},
            "timeline": [],
            "insights": {},
        }

        with TestClient(app) as client:
            headers = {"Authorization": "Bearer demo", "x-client-surface": "web"}

            search = client.get("/parcels/search?query=High", headers=headers)
            assert search.status_code == 200
            parcel = search.json()[0]
            assert "source_origin" in parcel
            assert "display_policy" in parcel
            assert "restricted_actions" in parcel

            detail = client.get(f"/parcels/{parcel_id}", headers=headers)
            assert detail.status_code == 200
            payload = detail.json()
            assert payload["source_origin"] == "public_record"
            assert payload["display_policy"]["current_surface"] == "web"
            assert "freshness" in payload
            assert "restricted_content" in payload
    finally:
        if original_search is not None and original_detail is not None:
            from app.api import routes_parcels

            routes_parcels.search_parcels = original_search
            routes_parcels.get_parcel_detail = original_detail
        app.dependency_overrides.clear()
