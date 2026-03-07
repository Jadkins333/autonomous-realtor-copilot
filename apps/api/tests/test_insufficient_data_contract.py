from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app


def test_missing_signals_parcel_returns_insufficient_data_without_numeric_scores() -> None:
    settings = get_settings()
    with TestClient(app) as client:
        login = client.post(
            "/auth/login",
            json={
                "tenant_slug": settings.default_tenant_slug,
                "email": settings.demo_user_email,
                "password": settings.demo_user_password,
            },
        )
        assert login.status_code == 200
        token = login.json()["access_token"]
        response = client.get(
            f"/insights/parcels/{settings.test_parcel_missing_signals_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "insufficient_data"
    assert payload["insufficient_data"] is True
    assert payload["missing_inputs"]
    assert payload["renovation_roi"]["coverage_summary"]["coverage_pct"] < 100
