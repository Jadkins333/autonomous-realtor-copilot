"""Golden workflow integration test.

Exercises the full user-facing flow against the real database:
  login → parcel search (tenant-scoped) → parcel detail → copilot chat → trace contract
  cross-tenant isolation → zero results for unrelated tenant

Runs with the actual Docker API container (SessionLocal), so it produces a
receipt that is meaningful: it is not mocked infrastructure.
"""
from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.main import app
from app.models.entities import Parcel, Tenant, User
from app.models.enums import UserRole
from app.utils.security import get_password_hash

settings = get_settings()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _login(client: TestClient, *, tenant_slug: str, email: str, password: str) -> str | None:
    """Return the access token, or None on failure."""
    r = client.post(
        "/auth/login",
        json={"tenant_slug": tenant_slug, "email": email, "password": password},
    )
    if r.status_code == 200:
        return r.json()["access_token"]
    return None


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_isolated_tenant(*, slug_suffix: str) -> tuple:
    """Create a fresh tenant + user pair; return (tenant, user, password)."""
    slug = f"test-golden-{slug_suffix}"
    email = f"agent-{slug_suffix}@example.com"
    password = "golden-pw"
    db = SessionLocal()
    try:
        tenant = Tenant(name=f"Test Tenant {slug_suffix}", slug=slug)
        db.add(tenant)
        db.flush()
        user = User(
            tenant_id=tenant.id,
            email=email,
            name="Golden Agent",
            password_hash=get_password_hash(password),
            role=UserRole.agent,
        )
        db.add(user)
        db.commit()
        db.refresh(tenant)
        db.refresh(user)
        return tenant, user, password
    finally:
        db.close()


def _cleanup(*, tenant_ids: list) -> None:
    db = SessionLocal()
    try:
        db.execute(delete(User).where(User.tenant_id.in_(tenant_ids)))
        db.execute(delete(Tenant).where(Tenant.id.in_(tenant_ids)))
        db.commit()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_demo_login_returns_jwt_with_correct_tenant() -> None:
    """Login as the seeded demo user; verify token carries the right tenant."""
    from app.utils.security import decode_token

    with TestClient(app) as client:
        token = _login(
            client,
            tenant_slug=settings.default_tenant_slug,
            email=settings.demo_user_email,
            password=settings.demo_user_password,
        )

    assert token is not None, "Demo login should succeed"
    claims = decode_token(token)
    assert claims is not None
    assert claims["tenant_id"] is not None
    assert claims["role"] in {"admin", "agent", "viewer"}


def test_parcel_search_is_tenant_scoped() -> None:
    """Search returns results only for the requesting tenant."""
    with TestClient(app) as client:
        token = _login(
            client,
            tenant_slug=settings.default_tenant_slug,
            email=settings.demo_user_email,
            password=settings.demo_user_password,
        )
        assert token is not None

        # Demo tenant should have seeded parcels
        r = client.get("/parcels/search?query=010", headers=_auth_headers(token))

    assert r.status_code == 200
    results = r.json()
    assert isinstance(results, list)
    # Seed parcel numbers all start with "010-"; at least one expected
    assert len(results) > 0, "Demo tenant should have seeded parcels matching '010'"


def test_parcel_detail_includes_required_fields() -> None:
    """Parcel detail endpoint returns all UI-required fields."""
    with TestClient(app) as client:
        token = _login(
            client,
            tenant_slug=settings.default_tenant_slug,
            email=settings.demo_user_email,
            password=settings.demo_user_password,
        )
        assert token is not None

        parcels = client.get("/parcels/search?query=010", headers=_auth_headers(token)).json()
        assert parcels, "Need at least one parcel to test detail endpoint"
        parcel_id = parcels[0]["id"]

        r = client.get(f"/parcels/{parcel_id}", headers=_auth_headers(token))

    assert r.status_code == 200
    detail = r.json()

    # Fields the UI reads
    for field in ("id", "address", "permits_summary", "flood_zone", "transit_proximity", "timeline"):
        assert field in detail, f"Missing field: {field}"

    assert "last_12_months_count" in detail["permits_summary"]
    assert "intersects" in detail["flood_zone"]
    assert "score_0_100" in detail["transit_proximity"]
    assert isinstance(detail["timeline"], list)


def test_parcel_detail_insights_have_formula_markdown() -> None:
    """Insight cards expose formula_markdown for the ProvenanceDrawer."""
    with TestClient(app) as client:
        token = _login(
            client,
            tenant_slug=settings.default_tenant_slug,
            email=settings.demo_user_email,
            password=settings.demo_user_password,
        )
        assert token is not None

        parcel_id = client.get("/parcels/search?query=010", headers=_auth_headers(token)).json()[0]["id"]
        detail = client.get(f"/parcels/{parcel_id}", headers=_auth_headers(token)).json()

    insights = detail.get("insights", {})
    for insight_key in ("renovation_roi", "insurance_pressure"):
        assert insight_key in insights, f"Missing insight: {insight_key}"
        insight = insights[insight_key]
        assert "formula_markdown" in insight, f"{insight_key} missing formula_markdown"
        assert "value" in insight, f"{insight_key} missing value"


def test_copilot_chat_returns_trace_with_selected_agent() -> None:
    """Copilot chat fulfils the trace contract: selected_agent, tools_used, provenance."""
    with TestClient(app) as client:
        token = _login(
            client,
            tenant_slug=settings.default_tenant_slug,
            email=settings.demo_user_email,
            password=settings.demo_user_password,
        )
        assert token is not None

        r = client.post(
            "/copilot/chat",
            json={"message": "columbus market snapshot"},
            headers=_auth_headers(token),
        )

    assert r.status_code == 200
    payload = r.json()
    assert payload["status"] == "ok"
    assert isinstance(payload["text"], str) and payload["text"]

    trace = payload.get("trace", {})
    assert trace.get("selected_agent"), "trace.selected_agent must be non-empty"
    assert isinstance(trace.get("tools_used"), list), "trace.tools_used must be a list"
    assert "provenance" in trace, "trace.provenance must be present"
    assert "freshness" in trace, "trace.freshness must be present"


def test_cross_tenant_isolation_parcel_search() -> None:
    """A user from an isolated tenant sees zero results from the demo seed."""
    suffix = uuid4().hex[:8]
    tenant, _user, password = _create_isolated_tenant(slug_suffix=suffix)
    try:
        with TestClient(app) as client:
            token = _login(
                client,
                tenant_slug=tenant.slug,
                email=f"agent-{suffix}@example.com",
                password=password,
            )
            assert token is not None, "Isolated tenant login should succeed"

            r = client.get("/parcels/search?query=010", headers=_auth_headers(token))
        assert r.status_code == 200
        assert r.json() == [], "Isolated tenant must see zero parcels from demo seed"
    finally:
        _cleanup(tenant_ids=[tenant.id])


def test_golden_workflow_end_to_end() -> None:
    """Single-test narrative: login → search → detail → copilot → trace verified.

    This is the canonical receipt for the golden workflow. All assertions run in
    sequence so a failure points precisely to where the chain broke.
    """
    with TestClient(app) as client:
        # 1. Login
        token = _login(
            client,
            tenant_slug=settings.default_tenant_slug,
            email=settings.demo_user_email,
            password=settings.demo_user_password,
        )
        assert token is not None, "Step 1 (login) failed"

        headers = _auth_headers(token)

        # 2. Parcel search — tenant-scoped data exists
        parcels = client.get("/parcels/search?query=010", headers=headers).json()
        assert len(parcels) > 0, "Step 2 (parcel search) returned no results"
        parcel_id = parcels[0]["id"]

        # 3. Parcel detail — full payload including insights
        detail = client.get(f"/parcels/{parcel_id}", headers=headers).json()
        assert detail.get("id") == parcel_id, "Step 3 (parcel detail) id mismatch"
        assert "insights" in detail, "Step 3 (parcel detail) missing insights"

        # 4. Copilot chat — deterministic routing with trace
        chat_r = client.post(
            "/copilot/chat",
            json={"message": "renovation roi for parcel"},
            headers=headers,
        )
        assert chat_r.status_code == 200, f"Step 4 (copilot chat) status {chat_r.status_code}"
        chat = chat_r.json()
        assert chat["status"] == "ok", f"Step 4 copilot status != ok: {chat['status']}"

        # 5. Trace contract
        trace = chat.get("trace", {})
        assert trace.get("selected_agent"), "Step 5 (trace) missing selected_agent"
        assert "provenance" in trace, "Step 5 (trace) missing provenance"
