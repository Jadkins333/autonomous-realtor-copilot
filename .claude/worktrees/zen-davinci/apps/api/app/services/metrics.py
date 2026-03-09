from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import Message, Parcel, Permit, SchemaDriftDLQ, SourceRun
from app.models.enums import MessageStatus


def get_metrics_payload(db: Session) -> dict:
    parcels = int(db.execute(select(func.count(Parcel.id))).scalar() or 0)
    permits = int(db.execute(select(func.count(Permit.id))).scalar() or 0)
    messages = int(db.execute(select(func.count(Message.id))).scalar() or 0)
    drafts = int(
        db.execute(select(func.count(Message.id)).where(Message.status == MessageStatus.draft)).scalar() or 0
    )
    dlq = int(db.execute(select(func.count(SchemaDriftDLQ.id))).scalar() or 0)
    last_run = db.execute(select(SourceRun).order_by(SourceRun.started_at.desc()).limit(1)).scalar_one_or_none()

    return {
        "parcels": parcels,
        "permits": permits,
        "messages": messages,
        "drafts": drafts,
        "dlq_size": dlq,
        "last_source_run_status": last_run.status.value if last_run else "none",
        "last_source_run_started_at": last_run.started_at.isoformat() if last_run else None,
    }
