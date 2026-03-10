"""Copilot router: routes a user message to the appropriate deterministic agent,
then optionally generates an LLM narration of the result.

Routing logic (in order):
  1. If LLM enabled + available: classify intent with LLM → synthesise canonical command
  2. Keyword matching over agents (unchanged original logic; always runs)
  3. If keyword match fails on LLM-synthesised command, retry on original message
  4. Deterministic agent runs (authoritative result)
  5. If LLM available: generate ai_narration of the result
  6. Return both deterministic `text` and optional `ai_narration`

Invariant: ai_narration is always optional. Deterministic `text` is the source of truth.
"""
from __future__ import annotations

import logging

from app.copilot.agents.base import AgentContext, AgentResult
from app.copilot.registry import registry
from app.services.llm.provider import get_llm_provider

logger = logging.getLogger(__name__)

# Maps LLM intent classification → canonical command prefix expected by each agent
_INTENT_TO_COMMAND: dict[str, str] = {
    "market_snapshot": "columbus market snapshot",
    "property_profile": "property profile for",
    "draft_outreach": "draft outreach to",
    "compliance_check": "compliance check:",
    "explain_provenance": "explain provenance for market snapshot",
}


def _freshness_summary(freshness_entries: list[dict]) -> dict:
    if not freshness_entries:
        return {
            "total_sources": 0,
            "fresh_count": 0,
            "stale_count": 0,
            "unknown_count": 0,
            "is_any_stale": False,
        }

    fresh = 0
    stale = 0
    unknown = 0
    for entry in freshness_entries:
        state = str(entry.get("staleness", "unknown"))
        if state == "fresh":
            fresh += 1
        elif state == "stale":
            stale += 1
        else:
            unknown += 1

    return {
        "total_sources": len(freshness_entries),
        "fresh_count": fresh,
        "stale_count": stale,
        "unknown_count": unknown,
        "is_any_stale": stale > 0,
    }


def _synthesise_command(intent: str, target: str, original: str) -> str:
    """Reconstruct a canonical command from LLM-classified intent + target."""
    prefix = _INTENT_TO_COMMAND.get(intent)
    if not prefix:
        return original
    if intent in ("market_snapshot", "explain_provenance"):
        return prefix  # no target needed
    if target:
        return f"{prefix} {target}"
    return original  # no target: keep original so agents can parse it themselves


def route_message(context: AgentContext) -> dict:
    """Route a message to an agent and return a structured copilot response dict."""
    decisions: list[str] = []
    selected = None
    llm_used = False
    llm_provider_label: str | None = None
    ai_narration: str | None = None

    # ── Step 1: Optional LLM intent classification ─────────────────────────
    provider = get_llm_provider()
    routed_message = context.message

    if provider is not None:
        from app.services.llm_features.narrator import classify_intent

        intent_result = classify_intent(provider, context.message)
        if intent_result and intent_result.get("intent") not in (None, "unknown"):
            intent = intent_result["intent"]
            target = intent_result.get("target", "")
            reason = intent_result.get("reason", "")
            synthesised = _synthesise_command(intent, target, context.message)
            decisions.append(f"llm_intent: intent={intent} target={target!r} reason={reason!r}")
            if synthesised != context.message:
                decisions.append(f"llm_synthesised_command: {synthesised!r}")
                routed_message = synthesised

    # ── Step 2: Keyword matching (always runs) ─────────────────────────────
    for agent in registry.list():
        match = agent.match(routed_message)
        decisions.append(f"{agent.key}: {match.reason}")
        if match.matched:
            selected = agent
            break

    # Step 2b: If LLM synthesised a command but it didn't match, retry original
    if selected is None and routed_message != context.message:
        decisions.append("llm_command_no_match: retrying on original message")
        for agent in registry.list():
            match = agent.match(context.message)
            if match.matched:
                selected = agent
                routed_message = context.message  # restore
                decisions.append(f"original_message_match: {agent.key}")
                break

    if selected is None:
        selected = next((a for a in registry.list() if a.key == "market_analyst"), registry.list()[0])
        decisions.append("fallback: routed to market_analyst")

    # ── Step 3: Run the deterministic agent (always, always authoritative) ──
    run_context = AgentContext(
        db=context.db,
        tenant_id=context.tenant_id,
        message=routed_message,
        user_id=context.user_id,
    )
    result: AgentResult = selected.run(run_context)

    # ── Step 4: Optional LLM narration of deterministic result ─────────────
    if provider is not None:
        from app.services.llm_features.narrator import narrate_agent_result

        ai_narration = narrate_agent_result(
            provider,
            user_message=context.message,
            result=result,
            agent_name=selected.name,
        )
        if ai_narration:
            llm_used = True
            llm_provider_label = provider.provider_label

    trace = {
        "selected_agent": selected.key,
        "decisions": decisions,
        "tools_used": result.tools_used,
        "provenance": {
            "provenance_record_ids": result.trace_refs.provenance_record_ids,
            "source_run_ids": result.trace_refs.source_run_ids,
        },
        "freshness": {
            "sources": result.trace_refs.freshness,
            "summary": _freshness_summary(result.trace_refs.freshness),
        },
        "llm_used": llm_used,
        "llm_provider": llm_provider_label,
    }

    return {
        "status": result.status,
        "text": result.text,
        "data": result.data,
        "missing_inputs": result.missing_inputs,
        "ai_narration": ai_narration,
        "trace": trace,
    }
