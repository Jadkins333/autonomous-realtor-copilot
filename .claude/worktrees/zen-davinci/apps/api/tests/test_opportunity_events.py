from uuid import uuid4

from app.services.opportunities import _event_dedupe_key


def test_event_dedupe_key_is_deterministic() -> None:
    tenant_id = uuid4()
    parcel_id = uuid4()

    left = _event_dedupe_key(
        tenant_id=tenant_id,
        parcel_id=parcel_id,
        event_type="distress_signal_crossed",
        day="2026-03-05",
    )
    right = _event_dedupe_key(
        tenant_id=tenant_id,
        parcel_id=parcel_id,
        event_type="distress_signal_crossed",
        day="2026-03-05",
    )

    assert left == right


def test_event_dedupe_key_changes_by_day_and_event_type() -> None:
    tenant_id = uuid4()
    parcel_id = uuid4()

    day_a = _event_dedupe_key(
        tenant_id=tenant_id,
        parcel_id=parcel_id,
        event_type="neighborhood_heat_crossed",
        day="2026-03-05",
    )
    day_b = _event_dedupe_key(
        tenant_id=tenant_id,
        parcel_id=parcel_id,
        event_type="neighborhood_heat_crossed",
        day="2026-03-06",
    )
    event_b = _event_dedupe_key(
        tenant_id=tenant_id,
        parcel_id=parcel_id,
        event_type="flood_exposure_detected",
        day="2026-03-05",
    )

    assert day_a != day_b
    assert day_a != event_b
