from celery.utils.log import get_task_logger

from app.db.session import SessionLocal
from app.services.sequences import advance_sequence_steps
from app.workers.celery_app import celery_app

logger = get_task_logger(__name__)


@celery_app.task(name="app.workers.tasks.advance_sequences_task")
def advance_sequences_task() -> dict:
    db = SessionLocal()
    try:
        count = advance_sequence_steps(db)
        logger.info("advanced sequence steps", extra={"created_drafts": count})
        return {"created_drafts": count}
    finally:
        db.close()
