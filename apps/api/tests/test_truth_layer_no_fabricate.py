from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.main import app
from app.schemas.truth import TruthMetricResponse
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


class DummyDB:
    pass


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
    assert "permits_per_100_parcels_90d" in payload["missing_inputs"]
    assert payload["value"]["score_0_100"] is None
    assert db.committed is True


def test_nowcast_formula_components_are_deterministic() -> None:
    payload = insights.compute_nowcast_score_components(
        permits_per_100_parcels_90d=4.0,
        poi_density_per_km2=8.0,
        rate_series_delta_bps_90d=50.0,
    )
    assert payload["components"]["permits_score"] == 40.0
    assert payload["components"]["poi_score"] == 40.0
    assert payload["components"]["rates_score"] == 45.0
    assert payload["score"] == 41.0


def test_city_insight_conforms_to_truth_contract() -> None:
    payload = {
        "status": "ok",
        "insufficient_data": False,
        "formula_key": "micro_market_nowcast_v1",
        "formula_version": "v1",
        "formula_markdown": "formula",
        "computed_at": "2026-03-19T12:00:00+00:00",
        "value": {"score_0_100": 41.0},
        "inputs": {"permits_per_100_parcels_90d": {"value": 4.0, "fields": [], "ids": []}},
        "provenance": {"sources": []},
        "freshness": {"fetched_at": "2026-03-19T11:00:00+00:00", "ttl_seconds": 86400, "staleness": "fresh", "is_stale": False},
        "coverage_summary": {"coverage_pct": 100, "required_total": 1, "required_present": 1, "missing_required": []},
        "missing_inputs": [],
    }

    app.dependency_overrides[get_db] = lambda: DummyDB()
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(user_id=uuid4(), tenant_id=uuid4(), role="agent")

    try:
        from app.api import routes_insights

        original = routes_insights.compute_micro_market_nowcast
        routes_insights.compute_micro_market_nowcast = lambda *_args, **_kwargs: payload
        with TestClient(app) as client:
            response = client.get("/insights/city/columbus")
        assert response.status_code == 200
        parsed = TruthMetricResponse.model_validate(response.json())
        assert parsed.formula_key == "micro_market_nowcast_v1"
        assert parsed.formula_version == "v1"
    finally:
        from app.api import routes_insights

        routes_insights.compute_micro_market_nowcast = original
        app.dependency_overrides.clear()
