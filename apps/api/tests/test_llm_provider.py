"""Tests for the LLM provider abstraction.

Tests cover:
  - get_llm_provider() returns None when LLM_ENABLED=false (default)
  - OllamaProvider raises LLMUnavailable on ConnectError
  - OllamaProvider raises LLMUnavailable on timeout
  - OllamaProvider raises LLMUnavailable on HTTP error
  - OllamaProvider raises LLMUnavailable on empty response
  - OllamaProvider returns text on success
  - LMStudioProvider raises LLMUnavailable on ConnectError
  - LMStudioProvider returns text on success
  - health_check returns False on connection error
  - _reset_llm_provider_cache clears cache so new provider is created
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services.llm.provider import LLMUnavailable, _reset_llm_provider_cache, get_llm_provider


@pytest.fixture(autouse=True)
def reset_provider_cache():
    """Reset the cached provider before and after each test."""
    _reset_llm_provider_cache()
    yield
    _reset_llm_provider_cache()


# ── get_llm_provider factory ──────────────────────────────────────────────────

def test_get_provider_returns_none_when_disabled(monkeypatch):
    """Default: LLM_ENABLED=false → None."""
    monkeypatch.setenv("LLM_ENABLED", "false")
    from app.core.config import get_settings
    get_settings.cache_clear()
    try:
        result = get_llm_provider()
        assert result is None
    finally:
        get_settings.cache_clear()


def test_get_provider_returns_ollama_when_configured(monkeypatch):
    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("LLM_MODEL", "llama3.2")
    from app.core.config import get_settings
    get_settings.cache_clear()
    try:
        provider = get_llm_provider()
        assert provider is not None
        assert "ollama" in provider.provider_label
    finally:
        get_settings.cache_clear()


def test_get_provider_returns_lmstudio_when_configured(monkeypatch):
    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("LLM_PROVIDER", "lmstudio")
    monkeypatch.setenv("LLM_MODEL", "mistral")
    from app.core.config import get_settings
    get_settings.cache_clear()
    try:
        provider = get_llm_provider()
        assert provider is not None
        assert "lmstudio" in provider.provider_label
    finally:
        get_settings.cache_clear()


def test_get_provider_returns_none_for_unknown_provider(monkeypatch):
    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("LLM_PROVIDER", "some_unknown_vendor")
    from app.core.config import get_settings
    get_settings.cache_clear()
    try:
        result = get_llm_provider()
        assert result is None
    finally:
        get_settings.cache_clear()


# ── OllamaProvider ────────────────────────────────────────────────────────────

class _MockSettings:
    llm_base_url = "http://localhost:11434"
    llm_model = "llama3.2"
    llm_timeout_seconds = 30
    llm_max_tokens = 512
    llm_temperature = 0.3


def _make_ollama():
    from app.services.llm.ollama import OllamaProvider
    return OllamaProvider(_MockSettings())


def test_ollama_complete_success():
    provider = _make_ollama()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"response": "  Hello from Ollama  ", "done": True}
    mock_resp.raise_for_status = MagicMock()

    with patch("httpx.post", return_value=mock_resp):
        result = provider.complete("test prompt")
    assert result == "Hello from Ollama"


def test_ollama_complete_raises_on_connect_error():
    import httpx

    provider = _make_ollama()
    with patch("httpx.post", side_effect=httpx.ConnectError("refused")):
        with pytest.raises(LLMUnavailable, match="not reachable"):
            provider.complete("test")


def test_ollama_complete_raises_on_timeout():
    import httpx

    provider = _make_ollama()
    with patch("httpx.post", side_effect=httpx.TimeoutException("timeout")):
        with pytest.raises(LLMUnavailable, match="timed out"):
            provider.complete("test")


def test_ollama_complete_raises_on_http_error():
    import httpx

    provider = _make_ollama()
    mock_resp = MagicMock()
    mock_resp.status_code = 500
    mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
        "Server Error", request=MagicMock(), response=mock_resp
    )
    mock_resp.text = "Internal Server Error"
    with patch("httpx.post", return_value=mock_resp):
        with pytest.raises(LLMUnavailable, match="HTTP 500"):
            provider.complete("test")


def test_ollama_complete_raises_on_empty_response():
    provider = _make_ollama()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"response": "", "done": True}
    mock_resp.raise_for_status = MagicMock()

    with patch("httpx.post", return_value=mock_resp):
        with pytest.raises(LLMUnavailable, match="empty response"):
            provider.complete("test")


def test_ollama_health_check_true():
    provider = _make_ollama()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    with patch("httpx.get", return_value=mock_resp):
        assert provider.health_check() is True


def test_ollama_health_check_false_on_error():
    import httpx

    provider = _make_ollama()
    with patch("httpx.get", side_effect=httpx.ConnectError("refused")):
        assert provider.health_check() is False


def test_ollama_json_mode_sets_format():
    """json_mode=True should add 'format': 'json' to the payload."""
    provider = _make_ollama()
    captured = {}

    def fake_post(url, json=None, timeout=None):
        captured.update(json or {})
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"response": '{"ok": true}'}
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    with patch("httpx.post", side_effect=fake_post):
        provider.complete("test", json_mode=True)

    assert captured.get("format") == "json"


def test_ollama_system_prompt_included():
    provider = _make_ollama()
    captured = {}

    def fake_post(url, json=None, timeout=None):
        captured.update(json or {})
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"response": "ok"}
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    with patch("httpx.post", side_effect=fake_post):
        provider.complete("test prompt", system="Be helpful")

    assert captured.get("system") == "Be helpful"


# ── LMStudioProvider ──────────────────────────────────────────────────────────

class _MockLMStudioSettings:
    llm_base_url = "http://localhost:1234"
    llm_model = "mistral"
    llm_timeout_seconds = 30
    llm_max_tokens = 512
    llm_temperature = 0.3


def _make_lmstudio():
    from app.services.llm.lmstudio import LMStudioProvider
    return LMStudioProvider(_MockLMStudioSettings())


def test_lmstudio_complete_success():
    provider = _make_lmstudio()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": "  LMStudio reply  "}}]
    }
    mock_resp.raise_for_status = MagicMock()

    with patch("httpx.post", return_value=mock_resp):
        result = provider.complete("hello")
    assert result == "LMStudio reply"


def test_lmstudio_raises_on_connect_error():
    import httpx

    provider = _make_lmstudio()
    with patch("httpx.post", side_effect=httpx.ConnectError("refused")):
        with pytest.raises(LLMUnavailable, match="not reachable"):
            provider.complete("test")


def test_lmstudio_json_mode_sets_response_format():
    provider = _make_lmstudio()
    captured = {}

    def fake_post(url, json=None, timeout=None):
        captured.update(json or {})
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"choices": [{"message": {"content": '{"x":1}'}}]}
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    with patch("httpx.post", side_effect=fake_post):
        provider.complete("test", json_mode=True)

    assert captured.get("response_format") == {"type": "json_object"}


# ── provider_label ────────────────────────────────────────────────────────────

def test_ollama_provider_label():
    provider = _make_ollama()
    assert provider.provider_label == "ollama/llama3.2"


def test_lmstudio_provider_label():
    provider = _make_lmstudio()
    assert provider.provider_label == "lmstudio/mistral"
