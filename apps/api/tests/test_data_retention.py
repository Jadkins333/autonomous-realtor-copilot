"""Tests for data-retention settings and the prune_old_records_task logic.

These tests use an in-memory SQLite database so they run without a live
Postgres instance.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.models.entities import ComplianceEvent, SchemaDriftDLQ, Source, SourceRun, Tenant
from app.models.enums import SourceRunStatus

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_engine():
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    for table in [Tenant.__table__, Source.__table__, SourceRun.__table__,
                  ComplianceEvent.__table__, SchemaDriftDLQ.__table__]:
        table.create(bind=engine)
    return engine


def _make_source(db: Session) -> Source:
    source = Source(id=uuid4(), name="test_source", base_url="seed://test")
    db.add(source)
    db.flush()
    return source


# ---------------------------------------------------------------------------
# Retention settings
# ---------------------------------------------------------------------------

def test_retention_defaults_are_sensible():
    s = Settings()
    assert s.retention_source_runs_days > 0
    assert s.retention_compliance_events_days > 0
    assert s.retention_schema_drift_dlq_days > 0


def test_retention_settings_are_overridable():
    s = Settings(
        retention_source_runs_days=7,
        retention_compliance_events_days=14,
        retention_schema_drift_dlq_days=30,
    )
    assert s.retention_source_runs_days == 7
    assert s.retention_compliance_events_days == 14
    assert s.retention_schema_drift_dlq_days == 30


# ---------------------------------------------------------------------------
# Prune logic (in-process, no Celery worker needed)
# ---------------------------------------------------------------------------

def _prune(db: Session, settings: Settings) -> dict:
    """Inline reproduction of prune_old_records_task logic for unit-testing."""
    from sqlalchemy import delete as sa_delete

    now = datetime.now(tz=UTC)

    source_run_cutoff = now - timedelta(days=settings.retention_source_runs_days)
    deleted_source_runs = db.execute(
        sa_delete(SourceRun).where(SourceRun.started_at < source_run_cutoff)
    ).rowcount

    compliance_cutoff = now - timedelta(days=settings.retention_compliance_events_days)
    deleted_compliance = db.execute(
        sa_delete(ComplianceEvent).where(ComplianceEvent.created_at < compliance_cutoff)
    ).rowcount

    dlq_cutoff = now - timedelta(days=settings.retention_schema_drift_dlq_days)
    deleted_dlq = db.execute(
        sa_delete(SchemaDriftDLQ).where(
            SchemaDriftDLQ.last_replayed_at.isnot(None),
            SchemaDriftDLQ.last_replayed_at < dlq_cutoff,
        )
    ).rowcount

    db.commit()
    return {
        "deleted_source_runs": deleted_source_runs,
        "deleted_compliance_events": deleted_compliance,
        "deleted_schema_drift_dlq": deleted_dlq,
    }


def test_prune_removes_old_source_runs():
    engine = _make_engine()
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    db: Session = factory()
    try:
        source = _make_source(db)

        old_run = SourceRun(
            id=uuid4(), source_id=source.id,
            status=SourceRunStatus.success,
            started_at=datetime.now(tz=UTC) - timedelta(days=60),
        )
        recent_run = SourceRun(
            id=uuid4(), source_id=source.id,
            status=SourceRunStatus.success,
            started_at=datetime.now(tz=UTC) - timedelta(days=1),
        )
        db.add_all([old_run, recent_run])
        db.commit()

        settings = Settings(retention_source_runs_days=30)
        result = _prune(db, settings)

        assert result["deleted_source_runs"] == 1
        remaining = db.execute(select(SourceRun)).scalars().all()
        assert len(remaining) == 1
        assert remaining[0].id == recent_run.id
    finally:
        db.close()
        engine.dispose()


def test_prune_removes_old_compliance_events():
    engine = _make_engine()
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    db: Session = factory()
    try:
        tenant = Tenant(id=uuid4(), name="Retention Test", slug="retention-test")
        db.add(tenant)
        db.flush()

        old_event = ComplianceEvent(
            id=uuid4(), tenant_id=tenant.id, event_type="blocked",
            subject_type="message", subject_id="m1", rule_key="quiet_hours",
            details_json={},
            created_at=datetime.now(tz=UTC) - timedelta(days=120),
        )
        recent_event = ComplianceEvent(
            id=uuid4(), tenant_id=tenant.id, event_type="allowed",
            subject_type="message", subject_id="m2", rule_key="consent_required",
            details_json={},
            created_at=datetime.now(tz=UTC) - timedelta(days=1),
        )
        db.add_all([old_event, recent_event])
        db.commit()

        settings = Settings(retention_compliance_events_days=90)
        result = _prune(db, settings)

        assert result["deleted_compliance_events"] == 1
        remaining = db.execute(select(ComplianceEvent)).scalars().all()
        assert len(remaining) == 1
        assert remaining[0].id == recent_event.id
    finally:
        db.close()
        engine.dispose()


def test_prune_skips_unreplayed_dlq_items():
    """DLQ items that have never been replayed must NOT be pruned."""
    engine = _make_engine()
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    db: Session = factory()
    try:
        source = _make_source(db)

        never_replayed = SchemaDriftDLQ(
            id=uuid4(), source_id=source.id, raw_url="seed://x", external_id="ext-1",
            dedupe_key=str(uuid4()), raw_json={}, error_text="err",
            occurred_at=datetime.now(tz=UTC) - timedelta(days=90),
            last_replayed_at=None,
        )
        db.add(never_replayed)
        db.commit()

        settings = Settings(retention_schema_drift_dlq_days=30)
        result = _prune(db, settings)

        assert result["deleted_schema_drift_dlq"] == 0
        assert db.execute(select(SchemaDriftDLQ)).scalars().first() is not None
    finally:
        db.close()
        engine.dispose()
