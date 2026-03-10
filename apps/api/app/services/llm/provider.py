"""LLM provider abstraction for the Autonomous Realtor Copilot.

Architecture
------------
- LLMProvider: abstract base defining the public interface
- Concrete providers: OllamaProvider, LMStudioProvider (loaded lazily)
- get_llm_provider(): factory cached for process lifetime
- LLMUnavailable: raised when a provider call fails; callers must degrade gracefully

Design rules
------------
- All providers are synchronous (httpx.Client) to stay compatible with sync FastAPI routes.
- Every call has a timeout; never block indefinitely.
- On ANY provider error, raise LLMUnavailable.  Callers must catch it and fall back to
  deterministic-only mode — the LLM layer must never break core workflows.
- Deterministic engine (scoring, compliance, state transitions) is NEVER replaced by LLM.
  The LLM may only narrate, summarize, draft, or explain.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from functools import lru_cache

logger = logging.getLogger(__name__)


class LLMUnavailable(Exception):
    """Raised when the LLM provider is unreachable or returns an error.

    Callers must catch this and degrade gracefully — deterministic features
    must continue to work even when the LLM is offline.
    """


class LLMProvider(ABC):
    """Minimal synchronous interface every provider must implement."""

    @abstractmethod
    def complete(
        self,
        prompt: str,
        *,
        system: str = "",
        json_mode: bool = False,
    ) -> str:
        """Send prompt + optional system message; return response text.

        Args:
            prompt: The user-turn content.
            system: Optional system/instruction preamble.
            json_mode: Request JSON-formatted output (where supported).

        Raises:
            LLMUnavailable: On any connection, timeout, or unexpected error.
        """

    @abstractmethod
    def health_check(self) -> bool:
        """Return True if provider is reachable, False otherwise. Never raises."""

    @property
    @abstractmethod
    def provider_label(self) -> str:
        """Human-readable label e.g. 'ollama/llama3.2'. Used in AI attribution."""


@lru_cache(maxsize=1)
def get_llm_provider() -> LLMProvider | None:
    """Return the configured LLM provider, or None if LLM is disabled/unconfigured.

    Result is cached for the process lifetime.
    In tests, call _reset_llm_provider_cache() to reset.
    """
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.llm_enabled:
        logger.debug("llm_disabled: LLM_ENABLED=false")
        return None

    provider_key = (settings.llm_provider or "").lower().strip()

    if provider_key == "ollama":
        from app.services.llm.ollama import OllamaProvider

        p = OllamaProvider(settings)
        logger.info("llm_provider_loaded provider=ollama model=%s url=%s", settings.llm_model, settings.llm_base_url)
        return p

    if provider_key == "lmstudio":
        from app.services.llm.lmstudio import LMStudioProvider

        p = LMStudioProvider(settings)
        logger.info(
            "llm_provider_loaded provider=lmstudio model=%s url=%s", settings.llm_model, settings.llm_base_url
        )
        return p

    logger.warning("llm_provider_unknown provider=%s; returning None", provider_key)
    return None


def _reset_llm_provider_cache() -> None:
    """For tests only: clear the cached provider so a new one will be created."""
    get_llm_provider.cache_clear()
