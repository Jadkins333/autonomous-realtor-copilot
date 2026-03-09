"""Tests for GET /sequences/{id}/enrollments,
GET /contacts/{id}/messages, and GET /contacts/{id}/enrollments.

Uses a real database session (SessionLocal) to verify tenant isolation,
response shapes, ordering, and auth guards.
"""
from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.db.session import SessionLocal
from app.main import app
from app.models.entities import (
    Contact,
    Message,
    Sequence,
    SequenceEnrollment,
    SequenceStep,
    Tenant,
    User,
)
from app.models.enums import Channel, EnrollmentState, MessageDirection, MessageStatus, UserRole
from app.utils.security import create_access_token, get_password_hash


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_tenant(db, *, suffix: str) -> tuple[Tenant, User, str]:
    password = "test-pw-123"
    tenant = Tenant(name=f"Tenant {suffix}", slug=f"tenant-seq-{suffix}")
    db.add(tenant)
    db.flush()
    user = User(
        tenant_id=tenant.id,
        email=f"agent-{suffix}@example.com",
        name="Test Agent",
        password_hash=get_password_hash(password),
        role=UserRole.agent,
    )
    db.add(user)
    db.commit()
    db.refresh(tenant)
    db.refresh(user)
    return tenant, user, password


def _make_contact(db, *, tenant_id, name: str = "Alice Smith", email: str = "alice@example.com") -> Contact:
    contact = Contact(tenant_id=tenant_id, name=name, email=email, phone=None, tags_json=[])
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


def _make_sequence(db, *, tenant_id, key: str = "welcome") -> Sequence:
    seq = Sequence(
        tenant_id=tenant_id,
        key=key,
        name=f"Welcome sequence ({key})",
        description="Test sequence",
        is_enabled=True,
        sandbox_only=True,
    )
    db.add(seq)
    db.flush()
    step = SequenceStep(
        sequence_id=seq.id,
        step_order=1,
        delay_minutes=0,
        channel=Channel.email,
        template_subject="Hello {name}",
        template_body="Welcome to our service!",
        stop_on_reply=True,
    )
    db.add(step)
    db.commit()
    db.refresh(seq)
    return seq


def _make_enrollment(db, *, tenant_id, sequence_id, contact_id) -> SequenceEnrollment:
    enrollment = SequenceEnrollment(
        tenant_id=tenant_id,
        sequence_id=sequence_id,
        contact_id=contact_id,
        state=EnrollmentState.active,
        meta_json={"next_step_order": 1},
    )
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)
    return enrollment


def _make_message(db, *, tenant_id, contact_id, body: str = "Hello world!") -> Message:
    msg = Message(
        tenant_id=tenant_id,
        contact_id=contact_id,
        channel=Channel.email,
        direction=MessageDirection.outbound,
        status=MessageStatus.draft,
        subject="Test subject",
        body=body,
        meta_json={},
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def _auth_header(user_id, tenant_id) -> dict[str, str]:
    token = create_access_token(user_id=user_id, tenant_id=tenant_id, role="agent")
    return {"Authorization": f"Bearer {token}"}


def _cleanup(tenant_ids: list) -> None:
    db = SessionLocal()
    try:
        from sqlalchemy import delete as sa_delete
        for tid in tenant_ids:
            db.execute(sa_delete(SequenceEnrollment).where(SequenceEnrollment.tenant_id == tid))
            db.execute(sa_delete(Message).where(Message.tenant_id == tid))
            db.execute(sa_delete(SequenceStep).where(
                SequenceStep.sequence_id.in_(
                    select(Sequence.id).where(Sequence.tenant_id == tid)
                )
            ))
            db.execute(sa_delete(Sequence).where(Sequence.tenant_id == tid))
            db.execute(sa_delete(Contact).where(Contact.tenant_id == tid))
            db.execute(sa_delete(User).where(User.tenant_id == tid))
            db.execute(sa_delete(Tenant).where(Tenant.id == tid))
        db.commit()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Auth guard tests
# ---------------------------------------------------------------------------


def test_sequence_enrollments_requires_auth() -> None:
    with TestClient(app) as client:
        r = client.get(f"/sequences/{uuid4()}/enrollments")
    assert r.status_code == 401


def test_contact_messages_requires_auth() -> None:
    with TestClient(app) as client:
        r = client.get(f"/contacts/{uuid4()}/messages")
    assert r.status_code == 401


def test_contact_enrollments_requires_auth() -> None:
    with TestClient(app) as client:
        r = client.get(f"/contacts/{uuid4()}/enrollments")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /sequences/{id}/enrollments
# ---------------------------------------------------------------------------


def test_sequence_enrollments_success() -> None:
    db = SessionLocal()
    tenant_ids = []
    try:
        tenant, user, _ = _make_tenant(db, suffix="seq-enroll-1")
        tenant_ids.append(tenant.id)
        contact = _make_contact(db, tenant_id=tenant.id)
        seq = _make_sequence(db, tenant_id=tenant.id, key="seq-enroll-test-1")
        _make_enrollment(db, tenant_id=tenant.id, sequence_id=seq.id, contact_id=contact.id)
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            r = client.get(
                f"/sequences/{seq.id}/enrollments",
                headers=_auth_header(user.id, tenant.id),
            )
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 1
        row = data[0]
        assert row["contact_id"] == str(contact.id)
        assert row["contact_name"] == contact.name
        assert row["contact_email"] == contact.email
        assert row["state"] == "active"
        assert "enrolled_at" in row
    finally:
        _cleanup(tenant_ids)


def test_sequence_enrollments_wrong_tenant_returns_empty() -> None:
    db = SessionLocal()
    tenant_ids = []
    try:
        tenant_a, user_a, _ = _make_tenant(db, suffix="seq-wrong-a")
        tenant_b, user_b, _ = _make_tenant(db, suffix="seq-wrong-b")
        tenant_ids.extend([tenant_a.id, tenant_b.id])
        contact = _make_contact(db, tenant_id=tenant_a.id)
        seq = _make_sequence(db, tenant_id=tenant_a.id, key="seq-wrong-test")
        _make_enrollment(db, tenant_id=tenant_a.id, sequence_id=seq.id, contact_id=contact.id)
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            # tenant_b tries to read tenant_a's sequence enrollments
            r = client.get(
                f"/sequences/{seq.id}/enrollments",
                headers=_auth_header(user_b.id, tenant_b.id),
            )
        assert r.status_code == 200
        assert r.json() == []  # sequence not owned → empty, not 404
    finally:
        _cleanup(tenant_ids)


def test_sequence_enrollments_unknown_sequence_returns_empty() -> None:
    db = SessionLocal()
    tenant_ids = []
    try:
        tenant, user, _ = _make_tenant(db, suffix="seq-unknown")
        tenant_ids.append(tenant.id)
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            r = client.get(
                f"/sequences/{uuid4()}/enrollments",
                headers=_auth_header(user.id, tenant.id),
            )
        assert r.status_code == 200
        assert r.json() == []
    finally:
        _cleanup(tenant_ids)


def test_sequence_enrollments_empty_when_no_enrollments() -> None:
    db = SessionLocal()
    tenant_ids = []
    try:
        tenant, user, _ = _make_tenant(db, suffix="seq-empty")
        tenant_ids.append(tenant.id)
        seq = _make_sequence(db, tenant_id=tenant.id, key="seq-empty-test")
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            r = client.get(
                f"/sequences/{seq.id}/enrollments",
                headers=_auth_header(user.id, tenant.id),
            )
        assert r.status_code == 200
        assert r.json() == []
    finally:
        _cleanup(tenant_ids)


# ---------------------------------------------------------------------------
# GET /contacts/{id}/messages
# ---------------------------------------------------------------------------


def test_contact_messages_success() -> None:
    db = SessionLocal()
    tenant_ids = []
    try:
        tenant, user, _ = _make_tenant(db, suffix="msg-1")
        tenant_ids.append(tenant.id)
        contact = _make_contact(db, tenant_id=tenant.id)
        long_body = "A" * 200
        _make_message(db, tenant_id=tenant.id, contact_id=contact.id, body=long_body)
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            r = client.get(
                f"/contacts/{contact.id}/messages",
                headers=_auth_header(user.id, tenant.id),
            )
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        row = data[0]
        assert row["channel"] == "email"
        assert row["direction"] == "outbound"
        assert row["status"] == "draft"
        # body_preview is truncated to 120 chars
        assert len(row["body_preview"]) == 120
        assert row["subject"] == "Test subject"
    finally:
        _cleanup(tenant_ids)


def test_contact_messages_wrong_tenant_returns_empty() -> None:
    db = SessionLocal()
    tenant_ids = []
    try:
        tenant_a, user_a, _ = _make_tenant(db, suffix="msg-wrong-a")
        tenant_b, user_b, _ = _make_tenant(db, suffix="msg-wrong-b")
        tenant_ids.extend([tenant_a.id, tenant_b.id])
        contact = _make_contact(db, tenant_id=tenant_a.id)
        _make_message(db, tenant_id=tenant_a.id, contact_id=contact.id)
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            r = client.get(
                f"/contacts/{contact.id}/messages",
                headers=_auth_header(user_b.id, tenant_b.id),
            )
        assert r.status_code == 200
        assert r.json() == []
    finally:
        _cleanup(tenant_ids)


def test_contact_messages_empty_when_none() -> None:
    db = SessionLocal()
    tenant_ids = []
    try:
        tenant, user, _ = _make_tenant(db, suffix="msg-empty")
        tenant_ids.append(tenant.id)
        contact = _make_contact(db, tenant_id=tenant.id)
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            r = client.get(
                f"/contacts/{contact.id}/messages",
                headers=_auth_header(user.id, tenant.id),
            )
        assert r.status_code == 200
        assert r.json() == []
    finally:
        _cleanup(tenant_ids)


# ---------------------------------------------------------------------------
# GET /contacts/{id}/enrollments
# ---------------------------------------------------------------------------


def test_contact_enrollments_success() -> None:
    db = SessionLocal()
    tenant_ids = []
    try:
        tenant, user, _ = _make_tenant(db, suffix="cenroll-1")
        tenant_ids.append(tenant.id)
        contact = _make_contact(db, tenant_id=tenant.id)
        seq = _make_sequence(db, tenant_id=tenant.id, key="cenroll-test-1")
        _make_enrollment(db, tenant_id=tenant.id, sequence_id=seq.id, contact_id=contact.id)
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            r = client.get(
                f"/contacts/{contact.id}/enrollments",
                headers=_auth_header(user.id, tenant.id),
            )
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        row = data[0]
        assert row["sequence_id"] == str(seq.id)
        assert row["sequence_name"] == seq.name
        assert row["state"] == "active"
        assert "enrolled_at" in row
    finally:
        _cleanup(tenant_ids)


def test_contact_enrollments_wrong_tenant_returns_empty() -> None:
    db = SessionLocal()
    tenant_ids = []
    try:
        tenant_a, user_a, _ = _make_tenant(db, suffix="cenroll-wrong-a")
        tenant_b, user_b, _ = _make_tenant(db, suffix="cenroll-wrong-b")
        tenant_ids.extend([tenant_a.id, tenant_b.id])
        contact = _make_contact(db, tenant_id=tenant_a.id)
        seq = _make_sequence(db, tenant_id=tenant_a.id, key="cenroll-wrong-test")
        _make_enrollment(db, tenant_id=tenant_a.id, sequence_id=seq.id, contact_id=contact.id)
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            r = client.get(
                f"/contacts/{contact.id}/enrollments",
                headers=_auth_header(user_b.id, tenant_b.id),
            )
        assert r.status_code == 200
        assert r.json() == []
    finally:
        _cleanup(tenant_ids)


def test_contact_enrollments_empty_when_none() -> None:
    db = SessionLocal()
    tenant_ids = []
    try:
        tenant, user, _ = _make_tenant(db, suffix="cenroll-empty")
        tenant_ids.append(tenant.id)
        contact = _make_contact(db, tenant_id=tenant.id)
    finally:
        db.close()

    try:
        with TestClient(app) as client:
            r = client.get(
                f"/contacts/{contact.id}/enrollments",
                headers=_auth_header(user.id, tenant.id),
            )
        assert r.status_code == 200
        assert r.json() == []
    finally:
        _cleanup(tenant_ids)
