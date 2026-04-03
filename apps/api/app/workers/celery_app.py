from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "realtor_copilot",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    timezone="America/New_York",
    beat_schedule={
        "advance-sequences-every-minute": {
            "task": "app.workers.tasks.advance_sequences_task",
            "schedule": 60.0,
        },
        "prune-old-records-nightly": {
            "task": "app.workers.tasks.prune_old_records_task",
            # Run at 03:00 America/New_York every day (crontab: minute=0, hour=3)
            "schedule": 86400.0,
        },
    },
)

celery_app.autodiscover_tasks(["app.workers"])
