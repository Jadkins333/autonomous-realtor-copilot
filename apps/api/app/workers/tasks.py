import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

from celery.utils.log import get_task_logger
from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import delete

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import ComplianceEvent, SchemaDriftDLQ, SourceRun
from app.services.sequences import advance_sequence_steps
from app.workers.celery_app import celery_app

logger = get_task_logger(__name__)
settings = get_settings()


@celery_app.task(name="app.workers.tasks.advance_sequences_task")
def advance_sequences_task() -> dict:
    db = SessionLocal()
    try:
        now = datetime.now(tz=UTC).isoformat()
        try:
            redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
            redis_client.set("heartbeat:worker:last_seen", now)
            # Beat schedules this task; timestamp is a best-effort beat heartbeat proxy.
            redis_client.set("heartbeat:beat:last_seen", now)
            redis_client.close()
        except (RedisError, ConnectionError, OSError):  # noqa: BLE001
            logger.warning("heartbeat update failed")

        count = advance_sequence_steps(db)
        logger.info("advanced sequence steps", extra={"created_drafts": count})
        return {"created_drafts": count}
    finally:
        db.close()


@celery_app.task(
    name="app.workers.tasks.async_approve_and_send_task",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    max_retries=3
)
def async_approve_and_send_task(self, tenant_id: str, message_id: str, actor_user_id: str | None = None) -> dict:
    from app.services.outreach import approve_and_send
    
    db = SessionLocal()
    try:
        t_id = UUID(tenant_id)
        m_id = UUID(message_id)
        u_id = UUID(actor_user_id) if actor_user_id else None
        
        result = asyncio.run(approve_and_send(db, t_id, m_id, actor_user_id=u_id))
        return result
    except Exception as exc:
        logger.error("Failed to approve_and_send message %s: %s", message_id, exc)
        raise self.retry(exc=exc) from exc
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.prune_old_records_task")
def prune_old_records_task() -> dict:
    """Delete records that have exceeded their configured retention window.

    Tables pruned:
    - source_runs:       completed/failed runs older than retention_source_runs_days
    - compliance_events: events older than retention_compliance_events_days
    - schema_drift_dlq:  replayed DLQ items older than retention_schema_drift_dlq_days
    """
    db = SessionLocal()
    try:
        now = datetime.now(tz=UTC)

        source_run_cutoff = now - timedelta(days=settings.retention_source_runs_days)
        result_sr = db.execute(
            delete(SourceRun).where(SourceRun.started_at < source_run_cutoff)
        )
        deleted_source_runs = result_sr.rowcount

        compliance_cutoff = now - timedelta(days=settings.retention_compliance_events_days)
        result_ce = db.execute(
            delete(ComplianceEvent).where(ComplianceEvent.created_at < compliance_cutoff)
        )
        deleted_compliance = result_ce.rowcount

        dlq_cutoff = now - timedelta(days=settings.retention_schema_drift_dlq_days)
        result_dlq = db.execute(
            delete(SchemaDriftDLQ).where(
                SchemaDriftDLQ.last_replayed_at.isnot(None),
                SchemaDriftDLQ.last_replayed_at < dlq_cutoff,
            )
        )
        deleted_dlq = result_dlq.rowcount

        db.commit()
        summary = {
            "deleted_source_runs": deleted_source_runs,
            "deleted_compliance_events": deleted_compliance,
            "deleted_schema_drift_dlq": deleted_dlq,
        }
        logger.info("prune_old_records_complete", extra=summary)
        return summary
    finally:
        db.close()
