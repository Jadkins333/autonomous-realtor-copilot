from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.core.config import get_settings

settings = get_settings()


def build_public_page_last_updated(
    freshness: dict | None,
    *,
    jurisdiction: str,
    now: datetime | None = None,
) -> dict:
    fetched_at = None
    if isinstance(freshness, dict):
        fetched_at = freshness.get("fetched_at")

    if not fetched_at:
        return {
            "jurisdiction": jurisdiction,
            "last_updated_at": None,
            "status": "unavailable",
            "warning_message": "Last updated date unavailable. Review source freshness before using this page in advertising.",
        }

    try:
        parsed = datetime.fromisoformat(str(fetched_at))
    except ValueError:
        return {
            "jurisdiction": jurisdiction,
            "last_updated_at": None,
            "status": "unavailable",
            "warning_message": "Last updated date unavailable. Review source freshness before using this page in advertising.",
        }

    current = now or datetime.now(tz=UTC)
    is_stale = False
    if jurisdiction == "OH":
        is_stale = parsed < current - timedelta(days=settings.ohio_website_update_window_days)
    elif isinstance(freshness, dict) and freshness.get("is_stale") is True:
        is_stale = True

    if is_stale:
        return {
            "jurisdiction": jurisdiction,
            "last_updated_at": parsed.isoformat(),
            "status": "stale",
            "warning_message": "Last updated information may be stale. Review source freshness before using this page in advertising.",
        }

    return {
        "jurisdiction": jurisdiction,
        "last_updated_at": parsed.isoformat(),
        "status": "current",
        "warning_message": None,
    }
