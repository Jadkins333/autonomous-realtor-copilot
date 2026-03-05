from __future__ import annotations

import os
from datetime import UTC, datetime

import httpx
from redis import Redis
from sqlalchemy import text, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import Source, SourceStatus

settings = get_settings()


def _safe_timestamp(value: str | bytes | None) -> str | None:
    if not value:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return value


def get_system_diagnostics(db: Session) -> dict:
    build = {
        "app_name": settings.app_name,
        "version": "1.0.0",
        "commit_sha": os.getenv("GIT_COMMIT_SHA", "unknown"),
    }

    db_ok = True
    db_message = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        db_ok = False
        db_message = "unreachable"

    redis_ok = True
    redis_message = "ok"
    worker_last_seen = None
    beat_last_seen = None
    try:
        redis_client = Redis.from_url(settings.redis_url, decode_responses=False)
        redis_ok = bool(redis_client.ping())
        worker_last_seen = _safe_timestamp(redis_client.get("heartbeat:worker:last_seen"))
        beat_last_seen = _safe_timestamp(redis_client.get("heartbeat:beat:last_seen"))
        redis_client.close()
    except Exception:  # noqa: BLE001
        redis_ok = False
        redis_message = "unreachable"

    statuses = list(db.execute(select(SourceStatus).order_by(SourceStatus.source_name.asc())).scalars())
    source_lookup = {
        source.name: source
        for source in db.execute(select(Source).where(Source.name.in_([row.source_name for row in statuses]))).scalars()
    }

    reachability = []
    for row in statuses:
        if row.mode.value == "fixture":
            reachability.append(
                {
                    "source_name": row.source_name,
                    "mode": row.mode.value,
                    "reachable": "n/a (fixture)",
                }
            )
            continue

        source = source_lookup.get(row.source_name)
        if source is None:
            reachability.append(
                {
                    "source_name": row.source_name,
                    "mode": row.mode.value,
                    "reachable": False,
                    "message": "missing source config",
                }
            )
            continue

        try:
            with httpx.Client(timeout=3.0, follow_redirects=True) as client:
                resp = client.get(source.base_url)
                ok = resp.status_code < 500
            reachability.append(
                {
                    "source_name": row.source_name,
                    "mode": row.mode.value,
                    "reachable": ok,
                    "message": "ok" if ok else "remote unavailable",
                }
            )
        except Exception:  # noqa: BLE001
            reachability.append(
                {
                    "source_name": row.source_name,
                    "mode": row.mode.value,
                    "reachable": False,
                    "message": "remote unavailable",
                }
            )

    return {
        "generated_at": datetime.now(tz=UTC).isoformat(),
        "build": build,
        "db": {"ok": db_ok, "message": db_message},
        "redis": {"ok": redis_ok, "message": redis_message},
        "worker_heartbeat": {"last_seen": worker_last_seen},
        "beat_heartbeat": {"last_seen": beat_last_seen},
        "sources": reachability,
    }
