from __future__ import annotations

import asyncio
from types import SimpleNamespace
from uuid import uuid4

from app.services import ingestion


class FakeDB:
    def flush(self) -> None:
        return

    def commit(self) -> None:
        return


def test_live_sources_fall_back_to_fixture_mode(monkeypatch) -> None:
    tenant_id = uuid4()
    db = FakeDB()

    def fake_source(_db, name: str, base_url: str, ttl_seconds: int = 86400):
        return SimpleNamespace(id=uuid4(), name=name, base_url=base_url, default_ttl_seconds=ttl_seconds)

    monkeypatch.setattr(ingestion, "_get_or_create_source", fake_source)
    monkeypatch.setattr(ingestion, "_start_source_run", lambda *_args, **_kwargs: SimpleNamespace())
    monkeypatch.setattr(ingestion, "_finish_source_run", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(ingestion, "ensure_source_status_defaults", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        ingestion,
        "touch_source_status_start",
        lambda *_args, **_kwargs: SimpleNamespace(
            state=ingestion.SourceState.ok,
            paused_reason=None,
            drift_detected=False,
            drift_reason=None,
        ),
    )
    monkeypatch.setattr(ingestion, "touch_source_status_finish", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        ingestion,
        "_process_rows",
        lambda *args, **_kwargs: asyncio.sleep(0, result=(len(args[4]), 0, 0)),
    )

    async def fail_fetch(*_args, **_kwargs):
        raise RuntimeError("network unavailable")

    monkeypatch.setattr(ingestion.JsonRestConnector, "fetch", fail_fetch)
    monkeypatch.setattr(ingestion.OverpassClient, "query_pois", fail_fetch)

    fallback_rows = {
        "parcels.json": [
            {
                "external_id": "p-1",
                "parcel_number": "010-111111",
                "address": "145 N High St",
                "city": "Columbus",
                "state": "OH",
                "zip": "43215",
                "attributes_json": {"property_type": "single_family"},
                "lon": -82.9989,
                "lat": 39.9654,
            }
        ],
        "permits.json": [
            {
                "external_id": "permit-1",
                "address": "145 N High St",
                "permit_type": "Electrical",
                "status": "issued",
                "applied_date": "2026-01-01",
                "issued_date": "2026-01-02",
                "final_date": None,
                "lon": -82.9989,
                "lat": 39.9654,
            }
        ],
        "flood_zones.json": [
            {
                "external_id": "f-1",
                "zone_code": "AE",
                "coordinates": [[[[ -83.0150, 39.9550 ], [ -82.9850, 39.9550 ], [ -82.9850, 39.9750 ], [ -83.0150, 39.9750 ], [ -83.0150, 39.9550 ]]]],
            }
        ],
        "pois.json": [
            {
                "external_id": "poi-1",
                "category": "coffee",
                "name": "High Street Coffee",
                "lon": -82.9995,
                "lat": 39.9662,
            }
        ],
        "transit_stops.json": [
            {
                "external_id": "stop-1",
                "name": "N High St & Nationwide",
                "lon": -82.9998,
                "lat": 39.9692,
            }
        ],
    }

    monkeypatch.setattr(ingestion, "load_seed_json", lambda filename: fallback_rows.get(filename, []))

    summary = asyncio.run(ingestion.run_ingestion(db, tenant_id))

    assert "sources" in summary
    assert summary["sources"]
    for source_payload in summary["sources"].values():
        assert source_payload["used_seed"] is True
        assert source_payload["mode"] == "fixture"
        assert source_payload["seed_missing"] is False
