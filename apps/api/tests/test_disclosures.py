from __future__ import annotations

from collections.abc import Generator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.main import app
from app.models.entities import (
    ActivityEvent,
    ComplianceEvent,
    ConsentEvent,
    Contact,
    Conversation,
    DisclosureAcknowledgement,
    DisclosureDefinition,
    DisclosureGate,
    DisclosureVersion,
    Message,
    OutreachDraftPack,
    OutreachSendAttempt,
    SuppressionList,
    Tenant,
    User,
)
from app.models.enums import Channel, ConsentStatus, UserRole
from app.services import compliance as compliance_service
from app.services import outreach as outreach_service
from app.services.disclosures import (
    acknowledge_disclosure,
    ensure_disclosure_configuration,
    evaluate_disclosure_gate,
)

TABLES = [
    Tenant.__table__,
    User.__table__,
    Contact.__table__,
    ConsentEvent.__table__,
    SuppressionList.__table__,
    Conversation.__table__,
    DisclosureDefinition.__table__,
    DisclosureVersion.__table__,
    DisclosureAcknowledgement.__table__,
    DisclosureGate.__table__,
    OutreachDraftPack.__table__,
    Message.__table__,
    OutreachSendAttempt.__table__,
    ActivityEvent.__table__,
    ComplianceEvent.__table__,
]


@pytest.fixture()
def disclosure_env() -> Generator[dict[str, object], None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    for table in TABLES:
        table.create(bind=engine)

    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    setup_db: Session = session_factory()
    tenant = Tenant(id=uuid4(), name="Disclosure Test Realty")
    user = User(
        id=uuid4(),
        tenant_id=tenant.id,
        email="agent@demo.local",
        name="Disclosure Admin",
        password_hash="hash",
        role=UserRole.admin,
    )
    setup_db.add_all([tenant, user])
    setup_db.commit()

    def override_get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(
        user_id=user.id,
        tenant_id=tenant.id,
        role=user.role.value,
    )

    try:
        yield {
            "session_factory": session_factory,
            "tenant_id": tenant.id,
            "user_id": user.id,
        }
    finally:
        app.dependency_overrides.clear()
        setup_db.close()
        engine.dispose()


def _seed_contact(session_factory, *, tenant_id: UUID, user_id: UUID) -> UUID:
    db: Session = session_factory()
    try:
        ensure_disclosure_configuration(db, tenant_id, "OH", actor_user_id=user_id)
        contact = Contact(
            tenant_id=tenant_id,
            name=f"Disclosure Contact {uuid4().hex[:8]}",
            email=f"disclosure-{uuid4().hex[:8]}@example.com",
            timezone="America/New_York",
            tags_json=["seller"],
        )
        db.add(contact)
        db.flush()
        db.add(
            ConsentEvent(
                tenant_id=tenant_id,
                contact_id=contact.id,
                channel=Channel.email,
                status=ConsentStatus.opt_in,
                consent_text="I agree to receive email updates.",
                source="test",
                capture_method="test_fixture",
                policy_text_version="test-email-consent-v1",
                proof_artifact_ref=f"test://consent/{contact.id}/email",
                jurisdiction_assumptions_json={"state": "OH"},
                ip_address="127.0.0.1",
                user_agent="pytest",
            )
        )
        db.commit()
        return contact.id
    finally:
        db.close()


def _agency_relationship_version_id(session_factory, tenant_id: UUID) -> UUID:
    db: Session = session_factory()
    try:
        definition = db.execute(
            select(DisclosureDefinition).where(
                DisclosureDefinition.tenant_id == tenant_id,
                DisclosureDefinition.key == "ohio_agency_relationship",
            )
        ).scalar_one()
        version = db.execute(
            select(DisclosureVersion)
            .where(DisclosureVersion.disclosure_definition_id == definition.id)
            .order_by(DisclosureVersion.effective_date.desc(), DisclosureVersion.created_at.desc())
        ).scalars().first()
        assert version is not None
        return version.id
    finally:
        db.close()


def test_disclosure_workflow_blocks_then_passes_then_reblocks(disclosure_env, monkeypatch) -> None:
    monkeypatch.setattr(compliance_service, "is_within_quiet_hours", lambda *args, **kwargs: True)
    monkeypatch.setattr(
        outreach_service,
        "_message_disclosure_status",
        lambda db, message, *, pack, user_id: evaluate_disclosure_gate(
            db,
            tenant_id=message.tenant_id,
            user_id=user_id,
            action="outreach_approve",
            contact_id=message.contact_id,
        ),
    )

    session_factory = disclosure_env["session_factory"]
    tenant_id = disclosure_env["tenant_id"]
    user_id = disclosure_env["user_id"]
    contact_id = _seed_contact(session_factory, tenant_id=tenant_id, user_id=user_id)

    with TestClient(app) as client:
        evaluated = client.post(
            "/disclosures/evaluate",
            json={
                "action": "outreach_approve",
                "contact_id": str(contact_id),
                "source": "test_outreach",
                "log_presentation": True,
            },
        )
        assert evaluated.status_code == 200
        evaluation_payload = evaluated.json()
        assert evaluation_payload["allowed"] is False
        assert evaluation_payload["blocking_disclosures"]
        assert evaluation_payload["jurisdiction"] == "OH"

        created = client.post(
            "/outreach/draft-pack",
            json={
                "contact_id": str(contact_id),
                "objective": "Ohio disclosure outreach test",
                "channels": ["email"],
                "sandbox": True,
            },
        )
        assert created.status_code == 200
        first_draft_id = created.json()["drafts"][0]["id"]

        blocked = client.post(f"/outreach/drafts/{first_draft_id}/approve")
        assert blocked.status_code == 200
        blocked_payload = blocked.json()
        assert blocked_payload["status"] == "blocked"
        assert blocked_payload["disclosure_status"]["allowed"] is False
        assert "agency_relationship_required" in blocked_payload["disclosure_status"]["reason_codes"]

        current_version_id = evaluation_payload["blocking_disclosures"][0]["disclosure_version_id"]
        acknowledged = client.post(
            "/disclosures/acknowledge",
            json={
                "action": "outreach_approve",
                "disclosure_version_id": current_version_id,
                "contact_id": str(contact_id),
                "source": "test_outreach",
                "checkbox_acknowledged": True,
            },
        )
        assert acknowledged.status_code == 200
        assert acknowledged.json()["disclosure_status"]["allowed"] is True

        passed_pack = client.post(
            "/outreach/draft-pack",
            json={
                "contact_id": str(contact_id),
                "objective": "Ohio disclosure outreach test after acknowledgement",
                "channels": ["email"],
                "sandbox": True,
            },
        )
        second_draft_id = passed_pack.json()["drafts"][0]["id"]
        passed = client.post(f"/outreach/drafts/{second_draft_id}/approve")
        assert passed.status_code == 200
        passed_payload = passed.json()
        assert passed_payload["disclosure_status"]["allowed"] is True
        assert passed_payload["status"] == "sandbox_staged"

    db: Session = session_factory()
    try:
        definition = db.execute(
            select(DisclosureDefinition).where(
                DisclosureDefinition.tenant_id == tenant_id,
                DisclosureDefinition.key == "ohio_agency_relationship",
            )
        ).scalar_one()
        db.add(
            DisclosureVersion(
                tenant_id=tenant_id,
                disclosure_definition_id=definition.id,
                version="2026.03.20",
                title="Ohio agency relationship workflow acknowledgement",
                body_markdown="Updated workflow acknowledgement. Not legal advice.",
                effective_date=datetime.now(tz=UTC).date(),
                typed_ack_text=None,
                metadata_json={},
                record_retention_metadata_json={},
                created_at=datetime.now(tz=UTC),
            )
        )
        db.commit()
    finally:
        db.close()

    with TestClient(app) as client:
        reblocked_pack = client.post(
            "/outreach/draft-pack",
            json={
                "contact_id": str(contact_id),
                "objective": "Ohio disclosure outreach test after version update",
                "channels": ["email"],
                "sandbox": True,
            },
        )
        third_draft_id = reblocked_pack.json()["drafts"][0]["id"]
        reblocked = client.post(f"/outreach/drafts/{third_draft_id}/approve")
        assert reblocked.status_code == 200
        reblocked_payload = reblocked.json()
        assert reblocked_payload["status"] == "blocked"
        assert "agency_relationship_version_superseded" in reblocked_payload["disclosure_status"]["reason_codes"]


def test_disclosure_acknowledgements_are_immutable(disclosure_env) -> None:
    session_factory = disclosure_env["session_factory"]
    tenant_id = disclosure_env["tenant_id"]
    user_id = disclosure_env["user_id"]
    contact_id = _seed_contact(session_factory, tenant_id=tenant_id, user_id=user_id)
    version_id = _agency_relationship_version_id(session_factory, tenant_id)

    db: Session = session_factory()
    try:
        first = acknowledge_disclosure(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="outreach_approve",
            disclosure_version_id=version_id,
            contact_id=contact_id,
            source="immutability_test",
            checkbox_acknowledged=True,
        )
        second = acknowledge_disclosure(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="outreach_approve",
            disclosure_version_id=version_id,
            contact_id=contact_id,
            source="immutability_test",
            checkbox_acknowledged=True,
        )
        db.commit()

        assert first["acknowledgement"]["id"] != second["acknowledgement"]["id"]

        rows = db.execute(
            select(DisclosureAcknowledgement)
            .where(
                DisclosureAcknowledgement.tenant_id == tenant_id,
                DisclosureAcknowledgement.contact_id == contact_id,
                DisclosureAcknowledgement.disclosure_version_id == version_id,
            )
            .order_by(DisclosureAcknowledgement.acknowledged_at.asc())
        ).scalars().all()
        assert len(rows) >= 2
        assert rows[0].id != rows[1].id
        assert rows[0].acknowledged_at <= rows[1].acknowledged_at
    finally:
        db.close()
