"""Ollama local provider.

API: POST /api/generate (non-streaming)
Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
Default base URL: http://localhost:11434
"""
from __future__ import annotations

import logging

import httpx

from app.services.llm.provider import LLMProvider, LLMUnavailable

logger = logging.getLogger(__name__)


class OllamaProvider(LLMProvider):
    """Calls a locally-running Ollama server (non-streaming /api/generate)."""

    def __init__(self, settings) -> None:
        self._base_url = settings.llm_base_url.rstrip("/")
        self._model = settings.llm_model
        self._timeout = float(settings.llm_timeout_seconds)
        self._max_tokens = int(settings.llm_max_tokens)
        self._temperature = float(settings.llm_temperature)

    @property
    def provider_label(self) -> str:
        return f"ollama/{self._model}"

    def complete(
        self,
        prompt: str,
        *,
        system: str = "",
        json_mode: bool = False,
    ) -> str:
        payload: dict = {
            "model": self._model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": self._temperature,
                "num_predict": self._max_tokens,
            },
        }
        if system:
            payload["system"] = system
        if json_mode:
            # Ollama JSON mode: instructs model to return valid JSON
            payload["format"] = "json"

        try:
            resp = httpx.post(
                f"{self._base_url}/api/generate",
                json=payload,
                timeout=self._timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            text = data.get("response", "").strip()
            if not text:
                raise LLMUnavailable("Ollama returned an empty response")
            return text
        except LLMUnavailable:
            raise
        except httpx.ConnectError as exc:
            raise LLMUnavailable(f"Ollama not reachable at {self._base_url}: {exc}") from exc
        except httpx.TimeoutException as exc:
            raise LLMUnavailable(f"Ollama request timed out after {self._timeout}s") from exc
        except httpx.HTTPStatusError as exc:
            raise LLMUnavailable(f"Ollama HTTP {exc.response.status_code}: {exc.response.text[:200]}") from exc
        except Exception as exc:
            raise LLMUnavailable(f"Ollama unexpected error: {exc}") from exc

    def health_check(self) -> bool:
        try:
            resp = httpx.get(f"{self._base_url}/api/tags", timeout=3.0)
            return resp.status_code == 200
        except Exception:
            return False
