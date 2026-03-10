"""LM Studio local provider (OpenAI-compatible chat completions API).

API: POST /v1/chat/completions
Default base URL: http://localhost:1234
"""
from __future__ import annotations

import logging

import httpx

from app.services.llm.provider import LLMProvider, LLMUnavailable

logger = logging.getLogger(__name__)


class LMStudioProvider(LLMProvider):
    """Calls a locally-running LM Studio server via its OpenAI-compatible API."""

    def __init__(self, settings) -> None:
        self._base_url = settings.llm_base_url.rstrip("/")
        self._model = settings.llm_model
        self._timeout = float(settings.llm_timeout_seconds)
        self._max_tokens = int(settings.llm_max_tokens)
        self._temperature = float(settings.llm_temperature)

    @property
    def provider_label(self) -> str:
        return f"lmstudio/{self._model}"

    def complete(
        self,
        prompt: str,
        *,
        system: str = "",
        json_mode: bool = False,
    ) -> str:
        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload: dict = {
            "model": self._model,
            "messages": messages,
            "temperature": self._temperature,
            "max_tokens": self._max_tokens,
            "stream": False,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        try:
            resp = httpx.post(
                f"{self._base_url}/v1/chat/completions",
                json=payload,
                timeout=self._timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            choices = data.get("choices") or []
            if not choices:
                raise LLMUnavailable("LM Studio returned no choices")
            text = (choices[0].get("message") or {}).get("content", "").strip()
            if not text:
                raise LLMUnavailable("LM Studio returned empty content")
            return text
        except LLMUnavailable:
            raise
        except httpx.ConnectError as exc:
            raise LLMUnavailable(f"LM Studio not reachable at {self._base_url}: {exc}") from exc
        except httpx.TimeoutException as exc:
            raise LLMUnavailable(f"LM Studio request timed out after {self._timeout}s") from exc
        except httpx.HTTPStatusError as exc:
            raise LLMUnavailable(f"LM Studio HTTP {exc.response.status_code}: {exc.response.text[:200]}") from exc
        except Exception as exc:
            raise LLMUnavailable(f"LM Studio unexpected error: {exc}") from exc

    def health_check(self) -> bool:
        try:
            resp = httpx.get(f"{self._base_url}/v1/models", timeout=3.0)
            return resp.status_code == 200
        except Exception:
            return False
