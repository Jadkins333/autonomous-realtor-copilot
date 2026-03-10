from __future__ import annotations

import asyncio

from app.services import providers


class _FakeResponse:
    def __init__(self, *, is_success: bool, payload: dict | None = None, text: str = "") -> None:
        self.is_success = is_success
        self._payload = payload or {}
        self.text = text

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    def __init__(self, *, response: _FakeResponse, capture: dict, auth=None, timeout=None) -> None:
        capture["auth"] = auth
        capture["timeout"] = timeout
        self._response = response
        self._capture = capture

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, data=None):
        self._capture["url"] = url
        self._capture["data"] = data
        return self._response


def test_twilio_voice_provider_initiates_call_with_signed_callback_urls(monkeypatch) -> None:
    capture: dict = {}
    response = _FakeResponse(
        is_success=True,
        payload={"sid": "CA123", "status": "queued"},
    )

    monkeypatch.setattr(
        providers.httpx,
        "AsyncClient",
        lambda **kwargs: _FakeAsyncClient(response=response, capture=capture, **kwargs),
    )
    monkeypatch.setattr(providers.settings, "twilio_account_sid", "AC123", raising=False)
    monkeypatch.setattr(providers.settings, "twilio_auth_token", "auth-secret", raising=False)
    monkeypatch.setattr(providers.settings, "twilio_from_number", "+16145550000", raising=False)
    monkeypatch.setattr(providers.settings, "twilio_voice_from_number", "+16145559999", raising=False)

    provider = providers.TwilioVoiceProvider()
    result = asyncio.run(
        provider.call(
            "+16145550123",
            "https://staging.example.com/api/webhooks/twilio/voice/twiml/msg-1",
            "https://staging.example.com/api/webhooks/twilio/voice/status",
        )
    )

    assert result.ok is True
    assert result.provider_message_id == "CA123"
    assert result.provider_status == "queued"
    assert capture["url"] == "https://api.twilio.com/2010-04-01/Accounts/AC123/Calls.json"
    assert capture["auth"] == ("AC123", "auth-secret")
    assert ("From", "+16145559999") in capture["data"]
    assert ("Url", "https://staging.example.com/api/webhooks/twilio/voice/twiml/msg-1") in capture["data"]
    assert ("StatusCallback", "https://staging.example.com/api/webhooks/twilio/voice/status") in capture["data"]
    assert capture["data"].count(("StatusCallbackEvent", "initiated")) == 1
    assert capture["data"].count(("StatusCallbackEvent", "completed")) == 1


def test_twilio_voice_provider_returns_error_text_on_failure(monkeypatch) -> None:
    capture: dict = {}
    response = _FakeResponse(is_success=False, text="Twilio request failed")

    monkeypatch.setattr(
        providers.httpx,
        "AsyncClient",
        lambda **kwargs: _FakeAsyncClient(response=response, capture=capture, **kwargs),
    )
    monkeypatch.setattr(providers.settings, "twilio_account_sid", "AC123", raising=False)
    monkeypatch.setattr(providers.settings, "twilio_auth_token", "auth-secret", raising=False)
    monkeypatch.setattr(providers.settings, "twilio_from_number", "+16145550000", raising=False)
    monkeypatch.setattr(providers.settings, "twilio_voice_from_number", "", raising=False)

    provider = providers.TwilioVoiceProvider()
    result = asyncio.run(
        provider.call(
            "+16145550123",
            "https://staging.example.com/api/webhooks/twilio/voice/twiml/msg-2",
            "https://staging.example.com/api/webhooks/twilio/voice/status",
        )
    )

    assert result.ok is False
    assert result.error == "Twilio request failed"
    assert ("From", "+16145550000") in capture["data"]
