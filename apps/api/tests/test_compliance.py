from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

from app.models.enums import Channel, ConsentStatus
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
        self.subject = "Subject"
        self.body = "Plain compliant copy"


def test_flagged_terms_detection() -> None:
    text = "Ideal for families and perfect for singles with a church nearby"
    flags = compliance.evaluate_fair_housing_text(text)
    assert "ideal for families" in flags
    assert "perfect for singles" in flags


def test_sms_requires_explicit_consent(monkeypatch) -> None:
    db = FakeDB()
    message = FakeMessage(Channel.sms)
    contact = SimpleNamespace(timezone="America/New_York")

    monkeypatch.setattr(compliance, "latest_consent_event", lambda *args, **kwargs: None)
    monkeypatch.setattr(compliance, "is_suppressed", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "outbound_count_today", lambda *args, **kwargs: 0)
    monkeypatch.setattr(compliance, "has_pending_stop_on_reply", lambda *args, **kwargs: False)

    decision = compliance.evaluate_outbound_policy(db, message, contact=contact, sandbox_mode=False)
    assert decision.allowed is False
    assert "consent_required" in decision.reason_codes


def test_quiet_hours_blocks_outbound(monkeypatch) -> None:
    db = FakeDB()
    message = FakeMessage(Channel.email)
    contact = SimpleNamespace(timezone="America/New_York")

    monkeypatch.setattr(
        compliance,
        "latest_consent_event",
        lambda *args, **kwargs: SimpleNamespace(
            id=uuid4(),
            status=ConsentStatus.opt_in,
            revoked_at=None,
            proof_artifact_ref="proof://email",
            policy_text_version="v1",
            occurred_at=datetime.now(tz=UTC),
        ),
    )
    monkeypatch.setattr(compliance, "is_suppressed", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "outbound_count_today", lambda *args, **kwargs: 0)
    monkeypatch.setattr(compliance, "has_pending_stop_on_reply", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "is_within_quiet_hours", lambda *args, **kwargs: False)

    decision = compliance.evaluate_outbound_policy(db, message, contact=contact, sandbox_mode=False)
    assert decision.allowed is False
    assert "quiet_hours" in decision.reason_codes


def test_frequency_cap_blocks_outbound(monkeypatch) -> None:
    db = FakeDB()
    message = FakeMessage(Channel.email)
    contact = SimpleNamespace(timezone="America/New_York")

    monkeypatch.setattr(
        compliance,
        "latest_consent_event",
        lambda *args, **kwargs: SimpleNamespace(
            id=uuid4(),
            status=ConsentStatus.opt_in,
            revoked_at=None,
            proof_artifact_ref="proof://email",
            policy_text_version="v1",
            occurred_at=datetime.now(tz=UTC),
        ),
    )
    monkeypatch.setattr(compliance, "is_suppressed", lambda *args, **kwargs: False)
    monkeypatch.setattr(
        compliance,
        "outbound_count_today",
        lambda *args, **kwargs: compliance.settings.frequency_cap_per_day,
    )
    monkeypatch.setattr(compliance, "has_pending_stop_on_reply", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "is_within_quiet_hours", lambda *args, **kwargs: True)

    decision = compliance.evaluate_outbound_policy(db, message, contact=contact, sandbox_mode=False)
    assert decision.allowed is False
    assert "frequency_cap" in decision.reason_codes


def test_missing_timezone_blocks_live_send(monkeypatch) -> None:
    db = FakeDB()
    message = FakeMessage(Channel.email)
    contact = SimpleNamespace(timezone=None)

    monkeypatch.setattr(
        compliance,
        "latest_consent_event",
        lambda *args, **kwargs: SimpleNamespace(
            id=uuid4(),
            status=ConsentStatus.opt_in,
            revoked_at=None,
            proof_artifact_ref="proof://email",
            policy_text_version="v1",
            occurred_at=datetime.now(tz=UTC),
        ),
    )
    monkeypatch.setattr(compliance, "is_suppressed", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "has_pending_stop_on_reply", lambda *args, **kwargs: False)

    decision = compliance.evaluate_outbound_policy(db, message, contact=contact, sandbox_mode=False)
    assert decision.allowed is False
    assert "recipient_timezone_missing" in decision.reason_codes


def test_stale_consent_is_blocked(monkeypatch) -> None:
    db = FakeDB()
    message = FakeMessage(Channel.sms)
    contact = SimpleNamespace(timezone="America/New_York")

    monkeypatch.setattr(
        compliance,
        "latest_consent_event",
        lambda *args, **kwargs: SimpleNamespace(
            id=uuid4(),
            status=ConsentStatus.opt_in,
            revoked_at=None,
            proof_artifact_ref="proof://sms",
            policy_text_version="v1",
            occurred_at=datetime.now(tz=UTC) - timedelta(days=compliance.settings.consent_max_age_days + 1),
        ),
    )
    monkeypatch.setattr(compliance, "is_suppressed", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "outbound_count_today", lambda *args, **kwargs: 0)
    monkeypatch.setattr(compliance, "has_pending_stop_on_reply", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "is_within_quiet_hours", lambda *args, **kwargs: True)

    decision = compliance.evaluate_outbound_policy(db, message, contact=contact, sandbox_mode=False)
    assert decision.allowed is False
    assert "consent_stale" in decision.reason_codes


def test_fair_housing_scan_blocks_flagged_copy(monkeypatch) -> None:
    db = FakeDB()
    message = FakeMessage(Channel.email)
    message.body = "This home is ideal for families in an exclusive neighborhood."
    contact = SimpleNamespace(timezone="America/New_York")

    monkeypatch.setattr(
        compliance,
        "latest_consent_event",
        lambda *args, **kwargs: SimpleNamespace(
            id=uuid4(),
            status=ConsentStatus.opt_in,
            revoked_at=None,
            proof_artifact_ref="proof://email",
            policy_text_version="v1",
            occurred_at=datetime.now(tz=UTC),
        ),
    )
    monkeypatch.setattr(compliance, "is_suppressed", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "outbound_count_today", lambda *args, **kwargs: 0)
    monkeypatch.setattr(compliance, "has_pending_stop_on_reply", lambda *args, **kwargs: False)
    monkeypatch.setattr(compliance, "is_within_quiet_hours", lambda *args, **kwargs: True)

    decision = compliance.evaluate_outbound_policy(db, message, contact=contact, sandbox_mode=False)
    assert decision.allowed is False
    assert "fair_housing_flagged" in decision.reason_codes
    assert decision.fair_housing_scan["blocked"] is True


def test_quiet_hours_window_helper() -> None:
    assert compliance.is_within_quiet_hours("America/New_York", datetime(2026, 1, 1, 14, 0, tzinfo=UTC)) is True
    assert compliance.is_within_quiet_hours("America/New_York", datetime(2026, 1, 1, 3, 0, tzinfo=UTC)) is False
