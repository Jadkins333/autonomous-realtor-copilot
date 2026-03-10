from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class ProviderResult:
    ok: bool
    provider_message_id: str | None = None
    error: str | None = None
    provider_status: str | None = None
    provider_payload: dict | None = None


@dataclass
class ProviderAvailability:
    available: bool
    provider_name: str | None = None
    reason: str | None = None


class EmailProvider:
    name = "email_provider"

    async def send(self, to_email: str, subject: str, body: str) -> ProviderResult:
        raise NotImplementedError


class SmsProvider:
    name = "sms_provider"

    async def send(self, to_phone: str, body: str) -> ProviderResult:
        raise NotImplementedError


class VoiceProvider:
    name = "voice_provider"

    async def call(self, to_phone: str, twiml_url: str, status_callback_url: str) -> ProviderResult:
        raise NotImplementedError


class ConsoleEmailProvider(EmailProvider):
    name = "console_email"

    async def send(self, to_email: str, subject: str, body: str) -> ProviderResult:
        logger.info(
            "console_email",
            extra={"recipient": to_email, "subject": subject, "body": body[:200]},
        )
        return ProviderResult(ok=True, provider_message_id="console-email")


class PostmarkEmailProvider(EmailProvider):
    name = "postmark"

    async def send(self, to_email: str, subject: str, body: str) -> ProviderResult:
        headers = {
            "X-Postmark-Server-Token": settings.postmark_server_token,
            "Content-Type": "application/json",
        }
        payload = {
            "From": settings.postmark_sender_email,
            "To": to_email,
            "Subject": subject,
            "TextBody": body,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post("https://api.postmarkapp.com/email", headers=headers, json=payload)
        if response.is_success:
            return ProviderResult(ok=True, provider_message_id=str(response.json().get("MessageID")))
        return ProviderResult(ok=False, error=response.text)


class ConsoleSmsProvider(SmsProvider):
    name = "console_sms"

    async def send(self, to_phone: str, body: str) -> ProviderResult:
        logger.info("console_sms", extra={"recipient": to_phone, "body": body[:200]})
        return ProviderResult(ok=True, provider_message_id="console-sms")


class TwilioSmsProvider(SmsProvider):
    name = "twilio"

    async def send(self, to_phone: str, body: str) -> ProviderResult:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
        data = {
            "To": to_phone,
            "From": settings.twilio_from_number,
            "Body": body,
        }
        callback_base = (settings.public_api_base_url or "").rstrip("/")
        if callback_base:
            data["StatusCallback"] = f"{callback_base}/webhooks/twilio/status"
        async with httpx.AsyncClient(timeout=20, auth=(settings.twilio_account_sid, settings.twilio_auth_token)) as client:
            response = await client.post(url, data=data)
        if response.is_success:
            return ProviderResult(ok=True, provider_message_id=str(response.json().get("sid")))
        return ProviderResult(ok=False, error=response.text)


class TwilioVoiceProvider(VoiceProvider):
    name = "twilio_voice"

    async def call(self, to_phone: str, twiml_url: str, status_callback_url: str) -> ProviderResult:
        voice_from_number = settings.twilio_voice_from_number or settings.twilio_from_number
        url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Calls.json"
        data = [
            ("To", to_phone),
            ("From", voice_from_number),
            ("Url", twiml_url),
            ("Method", "POST"),
            ("StatusCallback", status_callback_url),
            ("StatusCallbackMethod", "POST"),
            ("StatusCallbackEvent", "initiated"),
            ("StatusCallbackEvent", "ringing"),
            ("StatusCallbackEvent", "answered"),
            ("StatusCallbackEvent", "completed"),
        ]
        async with httpx.AsyncClient(timeout=20, auth=(settings.twilio_account_sid, settings.twilio_auth_token)) as client:
            response = await client.post(url, data=data)
        if response.is_success:
            payload = response.json()
            return ProviderResult(
                ok=True,
                provider_message_id=str(payload.get("sid")),
                provider_status=str(payload.get("status") or "queued"),
                provider_payload=payload,
            )
        return ProviderResult(ok=False, error=response.text)


def get_voice_provider_status() -> ProviderAvailability:
    if settings.sandbox_mode:
        return ProviderAvailability(
            available=False,
            provider_name="twilio_voice",
            reason="Server sandbox mode is enabled, so live voice calls are unavailable.",
        )

    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        return ProviderAvailability(
            available=False,
            provider_name="twilio_voice",
            reason="Twilio Voice requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
        )

    if not (settings.twilio_voice_from_number or settings.twilio_from_number):
        return ProviderAvailability(
            available=False,
            provider_name="twilio_voice",
            reason="Twilio Voice requires TWILIO_VOICE_FROM_NUMBER or TWILIO_FROM_NUMBER.",
        )

    if not (settings.public_api_base_url or "").strip():
        return ProviderAvailability(
            available=False,
            provider_name="twilio_voice",
            reason="Voice calls require PUBLIC_API_BASE_URL so Twilio can fetch TwiML and status callbacks.",
        )

    return ProviderAvailability(available=True, provider_name="twilio_voice")


def get_email_provider() -> EmailProvider:
    if not settings.sandbox_mode and settings.postmark_server_token and settings.postmark_sender_email:
        return PostmarkEmailProvider()
    return ConsoleEmailProvider()


def get_sms_provider() -> SmsProvider:
    if not settings.sandbox_mode and settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_from_number:
        return TwilioSmsProvider()
    return ConsoleSmsProvider()


def get_voice_provider() -> VoiceProvider | None:
    status = get_voice_provider_status()
    if status.available:
        return TwilioVoiceProvider()
    return None
