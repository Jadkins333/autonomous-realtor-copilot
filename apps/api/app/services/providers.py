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
    request_payload: dict | None = None
    response_payload: dict | None = None


class EmailProvider:
    name = "email_provider"

    async def send(self, to_email: str, subject: str, body: str, *, idempotency_key: str) -> ProviderResult:
        raise NotImplementedError


class SmsProvider:
    name = "sms_provider"

    async def send(self, to_phone: str, body: str, *, idempotency_key: str) -> ProviderResult:
        raise NotImplementedError


class ConsoleEmailProvider(EmailProvider):
    name = "console_email"

    async def send(self, to_email: str, subject: str, body: str, *, idempotency_key: str) -> ProviderResult:
        payload = {"to": to_email, "subject": subject, "body": body, "idempotency_key": idempotency_key}
        logger.info(
            "console_email",
            extra={"recipient": to_email, "subject": subject, "body": body[:200], "idempotency_key": idempotency_key},
        )
        return ProviderResult(
            ok=True,
            provider_message_id="console-email",
            request_payload=payload,
            response_payload={"provider": self.name, "accepted": True},
        )


class PostmarkEmailProvider(EmailProvider):
    name = "postmark"

    async def send(self, to_email: str, subject: str, body: str, *, idempotency_key: str) -> ProviderResult:
        headers = {
            "X-Postmark-Server-Token": settings.postmark_server_token,
            "Content-Type": "application/json",
            "X-Autonomous-Realtor-Idempotency-Key": idempotency_key,
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
            body_json = response.json()
            return ProviderResult(
                ok=True,
                provider_message_id=str(body_json.get("MessageID")),
                request_payload=payload,
                response_payload=body_json,
            )
        return ProviderResult(
            ok=False,
            error=response.text,
            request_payload=payload,
            response_payload={"status_code": response.status_code, "text": response.text},
        )


class ConsoleSmsProvider(SmsProvider):
    name = "console_sms"

    async def send(self, to_phone: str, body: str, *, idempotency_key: str) -> ProviderResult:
        payload = {"to": to_phone, "body": body, "idempotency_key": idempotency_key}
        logger.info("console_sms", extra={"recipient": to_phone, "body": body[:200], "idempotency_key": idempotency_key})
        return ProviderResult(
            ok=True,
            provider_message_id="console-sms",
            request_payload=payload,
            response_payload={"provider": self.name, "accepted": True},
        )


class TwilioSmsProvider(SmsProvider):
    name = "twilio"

    async def send(self, to_phone: str, body: str, *, idempotency_key: str) -> ProviderResult:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
        data = {
            "To": to_phone,
            "From": settings.twilio_from_number,
            "Body": body,
        }
        async with httpx.AsyncClient(timeout=20, auth=(settings.twilio_account_sid, settings.twilio_auth_token)) as client:
            response = await client.post(
                url,
                data=data,
                headers={"X-Autonomous-Realtor-Idempotency-Key": idempotency_key},
            )
        if response.is_success:
            body_json = response.json()
            return ProviderResult(
                ok=True,
                provider_message_id=str(body_json.get("sid")),
                request_payload=data,
                response_payload=body_json,
            )
        return ProviderResult(
            ok=False,
            error=response.text,
            request_payload=data,
            response_payload={"status_code": response.status_code, "text": response.text},
        )


def get_email_provider(*, sandbox_mode: bool) -> EmailProvider:
    if sandbox_mode:
        return ConsoleEmailProvider()
    if settings.postmark_server_token and settings.postmark_sender_email:
        return PostmarkEmailProvider()
    raise RuntimeError("Live email sending is not configured")


def get_sms_provider(*, sandbox_mode: bool) -> SmsProvider:
    if sandbox_mode:
        return ConsoleSmsProvider()
    if settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_from_number:
        return TwilioSmsProvider()
    raise RuntimeError("Live SMS sending is not configured")
