from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.db.session import SessionLocal
from app.main import app
from app.models.entities import MetricValue, Parcel, Permit, Tenant
from app.services.compliance import evaluate_fair_housing_text


TENANT = os.getenv("DEFAULT_TENANT_SLUG", "demo-realty")
EMAIL = os.getenv("DEMO_USER_EMAIL", "agent@demo.local")
PASSWORD = os.getenv("DEMO_USER_PASSWORD", "demo123")


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


def choose_supported_draft(client: TestClient, headers: dict[str, str], contact_id: str) -> tuple[dict, bool]:
    drafts = client.get("/outreach/drafts", headers=headers)
    expect(drafts.status_code == 200, f"draft list failed: {drafts.status_code}")
    for draft in drafts.json():
        if draft.get("channel") in {"email", "sms"}:
            return draft, False

    created = client.post(
        "/outreach/draft-pack",
        headers=headers,
        json={
            "contact_id": contact_id,
            "objective": "Live-provider smoke rewrite proof",
            "channels": ["email"],
            "sandbox": True,
        },
    )
    expect(created.status_code == 200, f"draft pack create failed: {created.status_code} {created.text}")
    created_json = created.json()
    for draft in created_json["drafts"]:
        if draft.get("channel") in {"email", "sms"}:
            return draft, True

    raise AssertionError("Could not find a supported draft for rewrite smoke")


def choose_parcel_with_score(client: TestClient, headers: dict[str, str]) -> tuple[dict, dict]:
    seen_ids: set[str] = set()
    for query in ("High", "Main", "Oak", "St", "Ave", "Rd", "010"):
        response = client.get(f"/parcels/search?query={query}", headers=headers)
        expect(response.status_code == 200, f"parcel search failed for {query!r}: {response.status_code}")
        for parcel in response.json():
            parcel_id = parcel["id"]
            if parcel_id in seen_ids:
                continue
            seen_ids.add(parcel_id)
            negotiation = client.get(f"/parcels/{parcel_id}/negotiation", headers=headers)
            expect(
                negotiation.status_code == 200,
                f"parcel negotiation failed for {parcel_id}: {negotiation.status_code}",
            )
            negotiation_json = negotiation.json()
            if negotiation_json.get("motivation_score") is not None:
                return parcel, negotiation_json

    raise AssertionError("Could not find a parcel with a deterministic negotiation score")


def create_temp_scored_parcel() -> dict:
    db = SessionLocal()
    try:
        tenant = db.execute(select(Tenant).where(Tenant.slug == TENANT)).scalar_one_or_none()
        expect(tenant is not None, f"Tenant {TENANT!r} not found for live smoke")

        suffix = uuid4().hex[:8]
        parcel = Parcel(
            tenant_id=tenant.id,
            parcel_number=f"llm-live-{suffix}",
            address=f"LLM Live Smoke {suffix} Test Ave",
            city="Columbus",
            state="OH",
            zip="43215",
            attributes_json={
                "last_sale_date": "2010-01-01",
                "open_violations_count": 3,
            },
        )
        db.add(parcel)
        db.flush()

        permit = Permit(
            tenant_id=tenant.id,
            external_id=f"llm-live-{suffix}",
            parcel_id=parcel.id,
            address=parcel.address,
            permit_type="Renovation",
            status="issued",
            applied_date=date.today(),
            issued_date=date.today(),
            raw_json={},
        )
        db.add(permit)
        db.commit()

        return {
            "tenant_id": tenant.id,
            "parcel_id": parcel.id,
            "address": parcel.address,
            "seeded": True,
        }
    finally:
        db.close()


def cleanup_temp_scored_parcel(parcel_info: dict | None) -> None:
    if not parcel_info:
        return

    db = SessionLocal()
    try:
        parcel_id = parcel_info["parcel_id"]
        tenant_id = parcel_info["tenant_id"]
        db.execute(
            delete(MetricValue).where(
                MetricValue.tenant_id == tenant_id,
                MetricValue.subject_id == str(parcel_id),
            )
        )
        db.execute(delete(Permit).where(Permit.tenant_id == tenant_id, Permit.parcel_id == parcel_id))
        db.execute(delete(Parcel).where(Parcel.tenant_id == tenant_id, Parcel.id == parcel_id))
        db.commit()
    finally:
        db.close()


def ensure_parcel_with_score(client: TestClient, headers: dict[str, str]) -> tuple[dict, dict, dict | None]:
    try:
        parcel, negotiation_json = choose_parcel_with_score(client, headers)
        return parcel, negotiation_json, None
    except AssertionError:
        seeded = create_temp_scored_parcel()
        parcel_id = seeded["parcel_id"]
        negotiation = client.get(f"/parcels/{parcel_id}/negotiation", headers=headers)
        expect(negotiation.status_code == 200, f"seeded parcel negotiation failed: {negotiation.status_code}")
        negotiation_json = negotiation.json()
        expect(
            negotiation_json.get("motivation_score") is not None,
            "Seeded parcel should produce a deterministic negotiation score",
        )
        parcel = {"id": str(parcel_id), "address": seeded["address"]}
        return parcel, negotiation_json, seeded


def write_output(path: str | None, proof: dict) -> None:
    rendered = json.dumps(proof, indent=2)
    if path:
        output_path = Path(path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a live local-provider LLM smoke against the FastAPI app.")
    parser.add_argument("--output", type=str, default=None, help="Optional path to write JSON proof.")
    args = parser.parse_args()

    cleanup_info: dict | None = None
    try:
        with TestClient(app) as client:
            token = login(client)
            headers = auth_headers(token)

            llm_status = client.get("/copilot/llm-status", headers=headers)
            expect(llm_status.status_code == 200, f"llm-status failed: {llm_status.status_code}")
            llm_status_json = llm_status.json()
            expect(llm_status_json["llm_enabled"] is True, "LLM should be enabled for live smoke")
            expect(llm_status_json["available"] is True, "Provider should report available for live smoke")
            expect(bool(llm_status_json["provider_label"]), "Provider label must be present when live")

            chat = client.post(
                "/copilot/chat",
                json={"message": "columbus market snapshot"},
                headers=headers,
            )
            expect(chat.status_code == 200, f"copilot chat failed: {chat.status_code}")
            chat_json = chat.json()
            expect(bool(chat_json["text"]), "Deterministic chat text must be present")
            expect(bool(chat_json["ai_narration"]), "AI narration must be present when provider is live")
            expect(chat_json["trace"]["llm_used"] is True, "Trace must show llm_used=true when provider is live")
            expect(
                chat_json["trace"]["llm_provider"] == llm_status_json["provider_label"],
                "Copilot trace provider must match llm-status provider label",
            )

            contacts = client.get("/contacts", headers=headers)
            expect(contacts.status_code == 200, f"contacts list failed: {contacts.status_code}")
            contacts_json = contacts.json()
            expect(len(contacts_json) > 0, "Expected at least one seeded contact")
            contact = contacts_json[0]
            contact_id = contact["id"]

            summary = client.get(f"/contacts/{contact_id}/summary", headers=headers)
            expect(summary.status_code == 200, f"contact summary failed: {summary.status_code}")
            summary_json = summary.json()
            expect(summary_json["unavailable"] is False, "Contact summary should be live when provider is available")
            expect(summary_json["ai_generated"] is True, "Contact summary must be marked AI-generated")
            expect(bool(summary_json["provider_label"]), "Contact summary must include provider label")
            expect(len(summary_json["summary_bullets"]) > 0, "Contact summary should include bullets")
            expect(bool(summary_json["raw_summary"]), "Contact summary should include raw summary text")

            parcel, negotiation_json, cleanup_info = ensure_parcel_with_score(client, headers)
            parcel_id = parcel["id"]

            explanation = client.get(
                f"/parcels/{parcel_id}/score-explanation/negotiation_motivation_v1",
                headers=headers,
            )
            expect(explanation.status_code == 200, f"score explanation failed: {explanation.status_code}")
            explanation_json = explanation.json()
            expect(explanation_json["unavailable"] is False, "Score explanation should be live when provider is available")
            expect(explanation_json["ai_generated"] is True, "Score explanation must be marked AI-generated")
            expect(bool(explanation_json["provider_label"]), "Score explanation must include provider label")
            expect(bool(explanation_json["explanation"]), "Score explanation must contain explanation text")
            expect(explanation_json["metric_key"] == "negotiation_motivation_v1", "Metric key mismatch")
            expect(explanation_json["computed_score"] is not None, "Score explanation must include a computed score")
            expect(
                explanation_json["computed_score"] == negotiation_json["motivation_score"],
                "Score explanation must reference the deterministic computed score",
            )

            draft, created_draft = choose_supported_draft(client, headers, contact_id)
            draft_id = draft["id"]

            rewrite = client.post(
                f"/outreach/drafts/{draft_id}/rewrite",
                json={"tone": "professional", "notes": "Keep it concise and grounded in the saved contact context."},
                headers=headers,
            )
            expect(rewrite.status_code == 200, f"rewrite failed: {rewrite.status_code} {rewrite.text}")
            rewrite_json = rewrite.json()
            expect(rewrite_json["ai_generated"] is True, "Rewrite must be marked AI-generated")
            expect(bool(rewrite_json["provider_label"]), "Rewrite must include provider label")
            expect(bool(rewrite_json["proposed_body"]), "Rewrite must return a proposed body")
            expected_flags = evaluate_fair_housing_text(rewrite_json["proposed_body"])
            expect(
                rewrite_json["compliance_flags"] == expected_flags,
                "Rewrite compliance flags must match the deterministic fair-housing checker",
            )

            proof = {
                "llm_status": llm_status_json,
                "copilot_chat": {
                    "status": chat_json["status"],
                    "text": chat_json["text"],
                    "ai_narration": chat_json["ai_narration"],
                    "trace_llm_used": chat_json["trace"]["llm_used"],
                    "selected_agent": chat_json["trace"]["selected_agent"],
                    "provider_label": chat_json["trace"]["llm_provider"],
                },
                "contact_summary": {
                    "contact_id": contact_id,
                    "contact_name": contact.get("name"),
                    "summary_bullets": summary_json["summary_bullets"],
                    "provider_label": summary_json["provider_label"],
                    "data_coverage": summary_json["data_coverage"],
                },
                "score_explanation": {
                    "parcel_id": parcel_id,
                    "address": parcel.get("address"),
                    "computed_score": explanation_json["computed_score"],
                    "deterministic_score": negotiation_json["motivation_score"],
                    "explanation": explanation_json["explanation"],
                    "key_drivers": explanation_json["key_drivers"],
                    "suggested_actions": explanation_json["suggested_actions"],
                    "provider_label": explanation_json["provider_label"],
                    "seeded_parcel": bool(cleanup_info),
                },
                "outreach_rewrite": {
                    "draft_id": draft_id,
                    "channel": draft["channel"],
                    "used_existing_draft": not created_draft,
                    "proposed_subject": rewrite_json["proposed_subject"],
                    "proposed_body": rewrite_json["proposed_body"],
                    "compliance_flags": rewrite_json["compliance_flags"],
                    "expected_compliance_flags": expected_flags,
                    "provider_label": rewrite_json["provider_label"],
                },
            }

        write_output(args.output, proof)
        return 0
    finally:
        cleanup_temp_scored_parcel(cleanup_info)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"llm_live_smoke_failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
