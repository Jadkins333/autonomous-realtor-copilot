from __future__ import annotations

import json
import sys

from fastapi.testclient import TestClient

from app.main import app


TENANT = "demo-realty"
EMAIL = "agent@demo.local"
PASSWORD = "demo123"


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def login(client: TestClient) -> str:
    response = client.post(
        "/auth/login",
        json={
            "tenant_slug": TENANT,
            "email": EMAIL,
            "password": PASSWORD,
        },
    )
    expect(response.status_code == 200, f"login failed: {response.status_code} {response.text}")
    return response.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def choose_supported_draft(client: TestClient, headers: dict[str, str], contact_id: str) -> dict:
    drafts = client.get("/outreach/drafts", headers=headers)
    expect(drafts.status_code == 200, f"draft list failed: {drafts.status_code}")
    for draft in drafts.json():
        if draft.get("channel") in {"email", "sms"}:
            return draft

    created = client.post(
        "/outreach/draft-pack",
        headers=headers,
        json={
            "contact_id": contact_id,
            "objective": "Offline provider smoke rewrite proof",
            "channels": ["email"],
            "sandbox": True,
        },
    )
    expect(created.status_code == 200, f"draft pack create failed: {created.status_code} {created.text}")
    for draft in created.json()["drafts"]:
        if draft.get("channel") in {"email", "sms"}:
            return draft

    raise AssertionError("Expected a supported draft for rewrite smoke")


def main() -> int:
    with TestClient(app) as client:
        token = login(client)
        headers = auth_headers(token)

        llm_status = client.get("/copilot/llm-status", headers=headers)
        expect(llm_status.status_code == 200, f"llm-status failed: {llm_status.status_code}")
        llm_status_json = llm_status.json()
        expect(llm_status_json["llm_enabled"] is True, "LLM should be enabled for offline-provider smoke")
        expect(llm_status_json["available"] is False, "Provider should report unavailable when offline")

        chat = client.post(
            "/copilot/chat",
            json={"message": "columbus market snapshot"},
            headers=headers,
        )
        expect(chat.status_code == 200, f"copilot chat failed: {chat.status_code}")
        chat_json = chat.json()
        expect(bool(chat_json["text"]), "Deterministic chat text must be present")
        expect(chat_json["ai_narration"] is None, "AI narration must be absent when provider is offline")
        expect(chat_json["trace"]["llm_used"] is False, "Trace must show llm_used=false when provider is offline")

        contacts = client.get("/contacts", headers=headers)
        expect(contacts.status_code == 200, f"contacts list failed: {contacts.status_code}")
        contacts_json = contacts.json()
        expect(len(contacts_json) > 0, "Expected at least one seeded contact")
        contact_id = contacts_json[0]["id"]

        summary = client.get(f"/contacts/{contact_id}/summary", headers=headers)
        expect(summary.status_code == 200, f"contact summary failed: {summary.status_code}")
        summary_json = summary.json()
        expect(summary_json["unavailable"] is True, "Contact summary should degrade with unavailable=true")

        parcels = client.get("/parcels/search?query=010", headers=headers)
        expect(parcels.status_code == 200, f"parcel search failed: {parcels.status_code}")
        parcels_json = parcels.json()
        expect(len(parcels_json) > 0, "Expected at least one seeded parcel")
        parcel_id = parcels_json[0]["id"]

        explanation = client.get(
            f"/parcels/{parcel_id}/score-explanation/negotiation_motivation_v1",
            headers=headers,
        )
        expect(explanation.status_code == 200, f"score explanation failed: {explanation.status_code}")
        explanation_json = explanation.json()
        expect(
            explanation_json["unavailable"] is True,
            "Score explanation should degrade with unavailable=true",
        )

        draft = choose_supported_draft(client, headers, contact_id)
        draft_id = draft["id"]

        rewrite = client.post(
            f"/outreach/drafts/{draft_id}/rewrite",
            json={"tone": "professional", "notes": "Keep it concise"},
            headers=headers,
        )
        expect(rewrite.status_code == 503, f"rewrite should fail closed with 503, got {rewrite.status_code}")

        proof = {
            "llm_status": llm_status_json,
            "copilot_chat": {
                "status": chat_json["status"],
                "has_text": bool(chat_json["text"]),
                "ai_narration": chat_json["ai_narration"],
                "trace_llm_used": chat_json["trace"]["llm_used"],
                "selected_agent": chat_json["trace"]["selected_agent"],
            },
            "contact_summary": {
                "status_code": summary.status_code,
                "unavailable": summary_json["unavailable"],
                "bullets": summary_json["summary_bullets"],
            },
            "score_explanation": {
                "status_code": explanation.status_code,
                "unavailable": explanation_json["unavailable"],
                "metric_key": explanation_json["metric_key"],
            },
            "outreach_rewrite": {
                "draft_id": draft_id,
                "channel": draft["channel"],
                "status_code": rewrite.status_code,
                "detail": rewrite.json()["detail"],
            },
        }

    print(json.dumps(proof, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"llm_smoke_failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
