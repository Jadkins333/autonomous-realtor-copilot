from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.models.entities import ProvenanceRecord


def freshness(prov: ProvenanceRecord | None) -> dict:
    if prov is None:
        return {
            "fetched_at": None,
            "ttl_seconds": None,
            "staleness": "unknown",
            "is_stale": None,
        }

    age = datetime.now(tz=UTC) - prov.fetched_at
    stale = age > timedelta(seconds=prov.ttl_seconds)
    return {
        "fetched_at": prov.fetched_at.isoformat(),
        "ttl_seconds": prov.ttl_seconds,
        "staleness": "stale" if stale else "fresh",
        "is_stale": stale,
    }


def build_provenance(source_id, raw_url: str, external_id: str, prov: ProvenanceRecord | None) -> dict:
    return {
        "source_id": str(source_id) if source_id else None,
        "provenance_record_id": str(prov.id) if prov else None,
        "raw_url": raw_url,
        "external_id": external_id,
        "freshness": freshness(prov),
    }
