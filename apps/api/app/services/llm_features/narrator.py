"""Copilot narrator: translates a deterministic AgentResult into plain English.

The LLM receives:
  - the user's original question
  - the agent that answered it
  - the deterministic text result
  - a summarised snapshot of key data (to avoid token bloat)

The LLM must NOT invent facts, scores, or numbers not present in the data snapshot.
If the deterministic result is 'insufficient_data', the LLM acknowledges the gap.

Returns None on LLMUnavailable — callers use the deterministic `text` as fallback.
"""
from __future__ import annotations

import json
import logging

from app.copilot.agents.base import AgentResult
from app.services.llm.provider import LLMProvider, LLMUnavailable

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are an AI assistant for a real estate intelligence platform.
Your role: translate structured analytics results into clear, concise explanations for real estate agents.

Critical rules:
1. Only reference facts explicitly present in the DETERMINISTIC DATA provided.
2. Never invent scores, statistics, addresses, or details not in the data.
3. If the status is "insufficient_data" or data fields are missing, acknowledge this plainly.
4. Keep responses to 2-4 sentences.
5. Do not claim to have computed the numbers — you are explaining a computation done by formulas.
6. Use plain English. Avoid jargon unless the data itself uses it.
7. Do not add disclaimers, preambles, or sign-offs. Just the explanation.
"""


def _summarise_data(data: dict, max_keys: int = 12) -> dict:
    """Return a truncated snapshot of AgentResult.data to limit token usage."""
    if not data:
        return {}
    # Flatten top-level scalar values + one level of nested dicts
    out: dict = {}
    for k, v in data.items():
        if len(out) >= max_keys:
            break
        if isinstance(v, (str, int, float, bool)) or v is None:
            out[k] = v
        elif isinstance(v, dict):
            # Include nested numeric/string values
            nested = {nk: nv for nk, nv in v.items() if isinstance(nv, (str, int, float, bool))}
            if nested:
                out[k] = nested
        elif isinstance(v, list) and len(v) <= 5:
            out[k] = v
    return out


def narrate_agent_result(
    provider: LLMProvider,
    user_message: str,
    result: AgentResult,
    agent_name: str,
) -> str | None:
    """
    Generate a plain-English narration of a deterministic agent result.

    Returns the narration string, or None if the LLM is unavailable.
    Never raises — all LLM errors are caught and logged.
    """
    data_snapshot = _summarise_data(result.data)
    prompt = (
        f"The user asked: \"{user_message}\"\n\n"
        f"The {agent_name} agent responded with status={result.status!r}.\n"
        f"Deterministic result text: {result.text!r}\n"
        f"Key data: {json.dumps(data_snapshot, default=str)}\n"
        f"Missing inputs: {result.missing_inputs or 'none'}\n\n"
        "Explain this result to the agent in 2-4 plain-English sentences."
    )

    try:
        narration = provider.complete(prompt, system=_SYSTEM_PROMPT)
        return narration.strip() or None
    except LLMUnavailable as exc:
        logger.debug("llm_narration_unavailable agent=%s reason=%s", agent_name, exc)
        return None
    except Exception as exc:
        logger.warning("llm_narration_unexpected_error agent=%s error=%s", agent_name, exc)
        return None


def classify_intent(
    provider: LLMProvider,
    user_message: str,
) -> dict | None:
    """
    Classify a free-form user message into a known copilot intent.

    Returns a dict with keys: intent, target, reason
    or None if LLM is unavailable or returns invalid JSON.

    Valid intents:
      market_snapshot, property_profile, draft_outreach,
      compliance_check, explain_provenance, unknown
    """
    _INTENT_SYSTEM = """\
You are an intent classifier for a real estate intelligence platform.
Given a user message, return ONLY a JSON object with these keys:
  "intent": one of: market_snapshot | property_profile | draft_outreach | compliance_check | explain_provenance | unknown
  "target": the subject (name, address, parcel number, or text being checked) — empty string if none
  "reason": one sentence explaining your classification

Return ONLY the JSON object. No markdown fences. No extra text.
"""
    prompt = f'Classify this message: "{user_message}"'

    try:
        raw = provider.complete(prompt, system=_INTENT_SYSTEM, json_mode=True)
        # Strip markdown fences if model added them anyway
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(raw)

        valid_intents = {
            "market_snapshot", "property_profile", "draft_outreach",
            "compliance_check", "explain_provenance", "unknown",
        }
        intent = parsed.get("intent", "unknown")
        if intent not in valid_intents:
            intent = "unknown"

        return {
            "intent": intent,
            "target": str(parsed.get("target", "")),
            "reason": str(parsed.get("reason", "")),
        }
    except LLMUnavailable as exc:
        logger.debug("llm_intent_classification_unavailable reason=%s", exc)
        return None
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        logger.debug("llm_intent_classification_parse_error raw=%r error=%s", exc)
        return None
    except Exception as exc:
        logger.warning("llm_intent_classification_unexpected error=%s", exc)
        return None
