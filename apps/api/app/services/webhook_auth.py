from __future__ import annotations

import base64
import hashlib
import hmac
from typing import Mapping

from fastapi import HTTPException, Request, status

from app.core.config import get_settings


def _constant_time_compare(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


def _request_url_for_signature(request: Request) -> str:
    settings = get_settings()
    public_base = (settings.public_api_base_url or "").rstrip("/")
    if public_base:
        query = f"?{request.url.query}" if request.url.query else ""
        return f"{public_base}{request.url.path}{query}"
    return str(request.url)


def _twilio_signature(url: str, params: Mapping[str, str], token: str) -> str:
    message = url + "".join(f"{key}{value}" for key, value in sorted(params.items()))
    digest = hmac.new(token.encode("utf-8"), message.encode("utf-8"), hashlib.sha1).digest()
    return base64.b64encode(digest).decode("utf-8")


def require_twilio_signature(request: Request, params: Mapping[str, str]) -> None:
    settings = get_settings()
    token = (
        settings.twilio_webhook_auth_token
        or settings.twilio_auth_token
        or ""
    ).strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Twilio webhook verification is not configured.",
        )

    provided = (request.headers.get("X-Twilio-Signature") or "").strip()
    if not provided:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Twilio signature missing or invalid.",
        )

    expected = _twilio_signature(_request_url_for_signature(request), params, token)
    if not _constant_time_compare(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Twilio signature missing or invalid.",
        )


def require_postmark_basic_auth(request: Request) -> None:
    settings = get_settings()
    username = (settings.postmark_webhook_username or "").strip()
    password = (settings.postmark_webhook_password or "").strip()
    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Postmark webhook authentication is not configured.",
        )

    header = (request.headers.get("Authorization") or "").strip()
    if not header.startswith("Basic "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Postmark webhook authentication failed.",
            headers={"WWW-Authenticate": "Basic"},
        )

    try:
        raw = base64.b64decode(header.split(" ", 1)[1]).decode("utf-8")
        provided_username, provided_password = raw.split(":", 1)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Postmark webhook authentication failed.",
            headers={"WWW-Authenticate": "Basic"},
        ) from exc

    if not (
        _constant_time_compare(provided_username, username)
        and _constant_time_compare(provided_password, password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Postmark webhook authentication failed.",
            headers={"WWW-Authenticate": "Basic"},
        )
