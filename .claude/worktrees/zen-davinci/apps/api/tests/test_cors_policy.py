from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app


def _cors_options():
    layer = next(layer for layer in app.user_middleware if layer.cls is CORSMiddleware)
    return layer.kwargs


def test_settings_cors_allow_origins_list_parses_csv_and_deduplicates():
    settings = Settings(cors_allow_origins="https://a.test, https://b.test, https://a.test")
    assert settings.cors_allow_origins_list == ["https://a.test", "https://b.test"]


def test_settings_cors_allow_origins_list_supports_wildcard():
    settings = Settings(cors_allow_origins="*")
    assert settings.cors_allow_origins_list == ["*"]


def test_settings_empty_cors_allow_origins_uses_local_defaults():
    settings = Settings(cors_allow_origins="")
    assert settings.cors_allow_origins_list == ["http://localhost:3000", "http://127.0.0.1:3000"]


def test_app_cors_middleware_credentials_match_origin_mode():
    options = _cors_options()
    if "*" in options["allow_origins"]:
        assert options["allow_credentials"] is False
    else:
        assert options["allow_credentials"] is True
        assert options["allow_origins"]


def test_preflight_allows_first_configured_origin():
    options = _cors_options()
    allowed_origin = options["allow_origins"][0]
    if allowed_origin == "*":
        allowed_origin = "http://localhost:3000"

    with TestClient(app) as client:
        response = client.options(
            "/healthz",
            headers={
                "Origin": allowed_origin,
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code in (200, 204)
    assert response.headers.get("access-control-allow-origin") in (allowed_origin, "*")


