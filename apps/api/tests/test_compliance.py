from datetime import UTC, datetime
from uuid import uuid4

from app.models.enums import Channel
from app.services import compliance


class FakeDB:
    def __init__(self) -> None:
        self.events = []

    def add(self, obj) -> None:
        self.events.append(obj)


class FakeMessage:
    def __init__(self, channel: Channel) -> None:
        self.id = uuid4()
        self.tenant_id = uuid4()
        self.contact_id = uuid4()
        self.channel = channel


def test_flagged_terms_detection() -> None:
    text = "Ideal for families and perfect for singles with a church nearby"
    flags = compliance.evaluate_fair_housing_text(text)
    assert "ideal for families" in flags
    assert "perfect for singles" in flags


def test_sms_requires_explicit_consent(monkeypatch) -> None:
    db = FakeDB()
    message = FakeMessage(Channel.sms)

    monkeypatch.setattr(compliance, "has_explicit_channel_consent", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "is_suppressed", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "is_within_quiet_hours", lambda *args, **kwargs: True)
    monkeypatch.setattr(compliance, "outbound_count_today", lambda *args, **kwargs: 0)

    allowed, reason = compliance.enforce_outbound_policy(db, message)
    assert allowed is False
    assert reason == "Consent required for sms/voice"
    assert db.events, "Expected compliance event to be recorded"


def test_quiet_hours_blocks_outbound(monkeypatch) -> None:
    db = FakeDB()
    message = FakeMessage(Channel.email)

    monkeypatch.setattr(compliance, "has_explicit_channel_consent", lambda *args, **kwargs: True)
    monkeypatch.setattr(compliance, "is_suppressed", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "is_within_quiet_hours", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "outbound_count_today", lambda *args, **kwargs: 0)

    allowed, reason = compliance.enforce_outbound_policy(db, message)
    assert allowed is False
    assert reason == "Outside quiet hours"


def test_frequency_cap_blocks_outbound(monkeypatch) -> None:
    db = FakeDB()
    message = FakeMessage(Channel.email)

    monkeypatch.setattr(compliance, "has_explicit_channel_consent", lambda *args, **kwargs: True)
    monkeypatch.setattr(compliance, "is_suppressed", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "is_within_quiet_hours", lambda *args, **kwargs: True)
    monkeypatch.setattr(
        compliance,
        "outbound_count_today",
        lambda *args, **kwargs: compliance.settings.frequency_cap_per_day,
    )

    allowed, reason = compliance.enforce_outbound_policy(db, message)
    assert allowed is False
    assert reason == "Daily frequency cap reached"


def test_quiet_hours_window_helper() -> None:
    assert compliance.is_within_quiet_hours(datetime(2026, 1, 1, 14, 0, tzinfo=UTC)) is True
    assert compliance.is_within_quiet_hours(datetime(2026, 1, 1, 3, 0, tzinfo=UTC)) is False
