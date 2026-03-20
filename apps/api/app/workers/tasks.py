import asyncio
from datetime import UTC, datetime
from uuid import UUID

from celery.utils.log import get_task_logger
from redis import Redis

from app.core.config import get_settings
from app.db.session import SessionLocal
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
        except Exception:  # noqa: BLE001
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
        raise self.retry(exc=exc)
    finally:
        db.close()
