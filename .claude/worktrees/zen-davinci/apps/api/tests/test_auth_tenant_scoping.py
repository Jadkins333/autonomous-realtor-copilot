from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.main import app
from app.models.entities import Tenant, User
from app.models.enums import UserRole
from app.schemas.auth import LoginRequest
from app.utils.security import decode_token, get_password_hash


def _create_tenant(*, name: str, slug: str) -> Tenant:
    tenant = Tenant(name=name, slug=slug)
    db = SessionLocal()
    try:
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
        return tenant
    finally:
        db.close()


def _create_user(*, tenant_id, email: str, password: str, name: str) -> User:
    user = User(
        tenant_id=tenant_id,
        email=email,
        name=name,
        password_hash=get_password_hash(password),
        role=UserRole.admin,
    )
    db = SessionLocal()
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def _cleanup_auth_rows(*, tenant_ids: list) -> None:
    db = SessionLocal()
    try:
        db.execute(delete(User).where(User.tenant_id.in_(tenant_ids)))
        db.execute(delete(Tenant).where(Tenant.id.in_(tenant_ids)))
        db.commit()
    finally:
        db.close()


def test_tenant_model_exposes_slug_column() -> None:
    assert "slug" in Tenant.__table__.columns
    assert Tenant.__table__.columns["slug"].unique is True


def test_login_request_preserves_tenant_slug() -> None:
    payload = LoginRequest(tenant_slug="demo-realty", email="agent@example.com", password="secret")
    assert payload.model_dump()["tenant_slug"] == "demo-realty"


def test_users_can_share_email_across_tenants_and_login_is_tenant_scoped() -> None:
    tenant_a = _create_tenant(name=f"Tenant A {uuid4()}", slug=f"tenant-a-{uuid4().hex[:8]}")
    tenant_b = _create_tenant(name=f"Tenant B {uuid4()}", slug=f"tenant-b-{uuid4().hex[:8]}")
    email = f"shared-{uuid4().hex[:8]}@example.com"
    password_a = "secret-a"
    password_b = "secret-b"

    try:
        _create_user(tenant_id=tenant_a.id, email=email, password=password_a, name="Agent A")
        _create_user(tenant_id=tenant_b.id, email=email, password=password_b, name="Agent B")

        db = SessionLocal()
        try:
            users = db.execute(select(User).where(User.email == email)).scalars().all()
            assert len(users) == 2
            assert {str(user.tenant_id) for user in users} == {str(tenant_a.id), str(tenant_b.id)}
        finally:
            db.close()

        with TestClient(app) as client:
            response_a = client.post(
                "/auth/login",
                json={"tenant_slug": tenant_a.slug, "email": email, "password": password_a},
            )
            response_b = client.post(
                "/auth/login",
                json={"tenant_slug": tenant_b.slug, "email": email, "password": password_b},
            )
            wrong_tenant = client.post(
                "/auth/login",
                json={"tenant_slug": tenant_b.slug, "email": email, "password": password_a},
            )

        assert response_a.status_code == 200
        assert response_a.json()["user"]["tenant_id"] == str(tenant_a.id)
        payload_a = decode_token(response_a.json()["access_token"])
        assert payload_a is not None
        assert payload_a["tenant_id"] == str(tenant_a.id)

        assert response_b.status_code == 200
        assert response_b.json()["user"]["tenant_id"] == str(tenant_b.id)
        payload_b = decode_token(response_b.json()["access_token"])
        assert payload_b is not None
        assert payload_b["tenant_id"] == str(tenant_b.id)

        assert wrong_tenant.status_code == 401
        assert wrong_tenant.json()["detail"] == "Invalid credentials"
    finally:
        _cleanup_auth_rows(tenant_ids=[tenant_a.id, tenant_b.id])


def test_login_route_requires_known_tenant_slug() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/auth/login",
            json={"tenant_slug": f"missing-{uuid4().hex[:8]}", "email": "agent@example.com", "password": "secret"},
        )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_login_rejects_missing_tenant_slug() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/auth/login",
            json={"email": "agent@example.com", "password": "secret"},
        )
    assert response.status_code == 422


def test_legacy_email_only_login_is_rejected() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/auth/login",
            json={"email": get_settings().demo_user_email, "password": get_settings().demo_user_password},
        )
    assert response.status_code == 422
