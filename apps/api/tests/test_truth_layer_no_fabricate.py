from datetime import UTC, datetime

from app.services import insights


class ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar(self):
        return self._value


class FakeDB:
    def __init__(self):
        self.calls = 0
        self.committed = False

    def execute(self, stmt, params=None):
        self.calls += 1
        # parcels_count, permits_count, poi_count queries in order
        if self.calls == 1:
            return ScalarResult(0)
        if self.calls == 2:
            return ScalarResult(0)
        if self.calls == 3:
            return ScalarResult(0)
        return ScalarResult(0)

    def commit(self):
        self.committed = True


def test_micro_market_nowcast_returns_insufficient_data(monkeypatch):
    db = FakeDB()

    class Defn:
        key = "micro_market_nowcast_v1"
        version = "v1"
        formula_markdown = "formula"

    class MetricRow:
        computed_at = datetime.now(tz=UTC)

    monkeypatch.setattr(insights, "_definition", lambda *_args, **_kwargs: Defn())
    monkeypatch.setattr(insights, "_latest_source_provenance", lambda *_args, **_kwargs: (None, None))
    monkeypatch.setattr(insights, "load_seed_json", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(insights, "_store_metric_value", lambda *_args, **_kwargs: MetricRow())

    payload = insights.compute_micro_market_nowcast(db, tenant_id="tenant")

    assert payload["status"] == "insufficient_data"
    assert "missing_inputs" in payload
    assert "parcels_count" in payload["missing_inputs"]
    assert payload["value"]["score_0_100"] is None
    assert db.committed is True
