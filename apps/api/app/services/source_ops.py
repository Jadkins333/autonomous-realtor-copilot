from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import SchemaDriftDLQ, Source, SourceStatus
from app.models.enums import SourceMode, SourceRunStatus, SourceState


def run_status_to_state(status: SourceRunStatus) -> SourceState:
    if status == SourceRunStatus.success:
        return SourceState.ok
    if status == SourceRunStatus.partial:
        return SourceState.partial
    return SourceState.failed


def get_or_create_source_status(
    db: Session,
    source_name: str,
    mode: SourceMode = SourceMode.fixture,
    state: SourceState = SourceState.partial,
) -> SourceStatus:
    row = db.execute(select(SourceStatus).where(SourceStatus.source_name == source_name)).scalar_one_or_none()
    if row:
        return row

    row = SourceStatus(
        source_name=source_name,
        mode=mode,
        state=state,
        drift_detected=False,
        dlq_count=0,
        updated_at=datetime.now(tz=UTC),
    )
    db.add(row)
    db.flush()
    return row


def touch_source_status_start(db: Session, source_name: str) -> SourceStatus:
    row = get_or_create_source_status(db, source_name)
    now = datetime.now(tz=UTC)
    row.last_run_started_at = now
    row.updated_at = now
    db.flush()
    return row


def recompute_source_dlq_count(db: Session, source_name: str) -> int:
    row = get_or_create_source_status(db, source_name)
    source = db.execute(select(Source).where(Source.name == source_name)).scalar_one_or_none()
    if source is None:
        row.dlq_count = 0
        row.updated_at = datetime.now(tz=UTC)
        db.flush()
        return 0
    count = int(db.execute(select(func.count(SchemaDriftDLQ.id)).where(SchemaDriftDLQ.source_id == source.id)).scalar() or 0)
    row.dlq_count = count
    row.updated_at = datetime.now(tz=UTC)
    db.flush()
    return count


def recompute_source_dlq_count_by_source_id(db: Session, source_name: str, source_id) -> int:
    row = get_or_create_source_status(db, source_name)
    count = int(db.execute(select(func.count(SchemaDriftDLQ.id)).where(SchemaDriftDLQ.source_id == source_id)).scalar() or 0)
    row.dlq_count = count
    row.updated_at = datetime.now(tz=UTC)
    db.flush()
    return count


def touch_source_status_finish(
    db: Session,
    source_name: str,
    *,
    mode: SourceMode,
    run_status: SourceRunStatus,
    error_text: str | None,
    drift_detected: bool,
    drift_reason: str | None,
    source_id=None,
) -> SourceStatus:
    row = get_or_create_source_status(db, source_name)
    now = datetime.now(tz=UTC)

    row.mode = mode
    row.last_run_finished_at = now
    row.updated_at = now

    if source_id is not None:
        row.dlq_count = int(
            db.execute(select(func.count(SchemaDriftDLQ.id)).where(SchemaDriftDLQ.source_id == source_id)).scalar() or 0
        )

    if drift_detected:
        # During drift we force paused mode and block replay until resolved.
        row.state = SourceState.paused
        row.drift_detected = True
        row.drift_reason = drift_reason or "schema drift detected"
        row.paused_reason = row.drift_reason
        row.last_error = error_text or row.drift_reason
        db.flush()
        return row

    next_state = run_status_to_state(run_status)
    row.state = next_state
    row.last_error = error_text
    if next_state == SourceState.ok:
        row.last_success_at = now

    # Keep manual pause sticky unless explicitly resumed.
    if row.paused_reason and row.state != SourceState.paused:
        row.state = SourceState.paused

    db.flush()
    return row


def pause_source(db: Session, source_name: str, reason: str) -> SourceStatus:
    row = get_or_create_source_status(db, source_name)
    now = datetime.now(tz=UTC)
    row.state = SourceState.paused
    row.paused_reason = reason
    row.updated_at = now
    db.flush()
    return row


def resume_source(db: Session, source_name: str) -> SourceStatus:
    row = get_or_create_source_status(db, source_name)
    now = datetime.now(tz=UTC)
    row.paused_reason = None
    row.drift_detected = False
    row.drift_reason = None

    if row.last_error and not row.last_success_at:
        row.state = SourceState.partial
    elif row.last_success_at and (not row.last_run_finished_at or row.last_success_at >= row.last_run_finished_at):
        row.state = SourceState.ok
    else:
        row.state = SourceState.partial

    row.updated_at = now
    db.flush()
    return row


def set_source_drift_debug(db: Session, source_name: str, drift_detected: bool, reason: str | None) -> SourceStatus:
    row = get_or_create_source_status(db, source_name)
    now = datetime.now(tz=UTC)
    row.updated_at = now

    if drift_detected:
        drift_reason = reason or "debug drift enabled"
        row.drift_detected = True
        row.drift_reason = drift_reason
        row.state = SourceState.paused
        row.paused_reason = drift_reason
        row.last_error = drift_reason
    else:
        row.drift_detected = False
        row.drift_reason = None
        if row.paused_reason and row.paused_reason in {"debug drift enabled", reason or ""}:
            row.paused_reason = None
        if row.state == SourceState.paused and not row.paused_reason:
            row.state = SourceState.partial if row.last_error else SourceState.ok

    db.flush()
    return row


def list_source_status(db: Session) -> list[SourceStatus]:
    return list(db.execute(select(SourceStatus).order_by(SourceStatus.source_name.asc())).scalars())


def ensure_source_status_defaults(db: Session, source_names: Iterable[str]) -> None:
    for source_name in source_names:
        get_or_create_source_status(db, source_name)
    db.flush()
