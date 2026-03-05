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


class EmailProvider:
    name = "email_provider"

    async def send(self, to_email: str, subject: str, body: str) -> ProviderResult:
        raise NotImplementedError


class SmsProvider:
    name = "sms_provider"

    async def send(self, to_phone: str, body: str) -> ProviderResult:
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
        async with httpx.AsyncClient(timeout=20, auth=(settings.twilio_account_sid, settings.twilio_auth_token)) as client:
            response = await client.post(url, data=data)
        if response.is_success:
            return ProviderResult(ok=True, provider_message_id=str(response.json().get("sid")))
        return ProviderResult(ok=False, error=response.text)


def get_email_provider() -> EmailProvider:
    if not settings.sandbox_mode and settings.postmark_server_token and settings.postmark_sender_email:
        return PostmarkEmailProvider()
    return ConsoleEmailProvider()


def get_sms_provider() -> SmsProvider:
    if not settings.sandbox_mode and settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_from_number:
        return TwilioSmsProvider()
    return ConsoleSmsProvider()
