from __future__ import annotations

from app.copilot.agents.base import AgentContext, AgentResult
from app.copilot.registry import registry


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


def route_message(context: AgentContext) -> dict:
    decisions: list[str] = []
    selected = None

    for agent in registry.list():
        match = agent.match(context.message)
        decisions.append(f"{agent.key}: {match.reason}")
        if match.matched:
            selected = agent
            break

    if selected is None:
        selected = next((a for a in registry.list() if a.key == "market_analyst"), registry.list()[0])
        decisions.append("fallback: routed to market_analyst")

    result: AgentResult = selected.run(context)

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
    }

    return {
        "status": result.status,
        "text": result.text,
        "data": result.data,
        "missing_inputs": result.missing_inputs,
        "trace": trace,
    }
