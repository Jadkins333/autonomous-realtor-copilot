from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.main import app


class DummyDB:
    pass


def test_missing_signals_parcel_returns_insufficient_data_without_numeric_scores() -> None:
    parcel_id = uuid4()
    app.dependency_overrides[get_db] = lambda: DummyDB()
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(user_id=uuid4(), tenant_id=uuid4(), role="agent")

    payload = {
        "status": "insufficient_data",
        "insufficient_data": True,
        "missing_inputs": ["permit_activity_last_90d_count"],
        "renovation_roi": {"coverage_summary": {"coverage_pct": 66.7}},
    }

    try:
        from app.api import routes_insights

        original = routes_insights.compute_parcel_insights
        routes_insights.compute_parcel_insights = lambda *_args, **_kwargs: payload
        with TestClient(app) as client:
            response = client.get(f"/insights/parcels/{parcel_id}")
        assert response.status_code == 200
        assert response.json() == payload
    finally:
        from app.api import routes_insights

        routes_insights.compute_parcel_insights = original
        app.dependency_overrides.clear()
