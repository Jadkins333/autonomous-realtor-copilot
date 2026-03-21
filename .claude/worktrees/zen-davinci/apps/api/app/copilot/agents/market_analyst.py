from __future__ import annotations

from app.copilot.agents.base import AgentContext, AgentMatch, AgentResult, CopilotAgent
from app.services.insights import compute_micro_market_nowcast


class MarketAnalystAgent(CopilotAgent):
    key = "market_analyst"
    name = "Market Analyst"
    description = "Generates Columbus market nowcast from permit/POI/rate inputs with provenance."
    mission = "Compute and explain market snapshot using Truth Layer metrics only."
    sample_prompts = ["columbus market snapshot", "market snapshot"]

    def match(self, message: str) -> AgentMatch:
        normalized = message.lower().strip()
        if "columbus market snapshot" in normalized or normalized == "market snapshot":
            return AgentMatch(matched=True, reason="Matched market snapshot request")
        return AgentMatch(matched=False, reason="No market snapshot intent detected")

    def run(self, context: AgentContext) -> AgentResult:
        metric = compute_micro_market_nowcast(context.db, context.tenant_id)
        status = str(metric.get("status", "ok"))
        missing_inputs = metric.get("missing_inputs", []) if isinstance(metric.get("missing_inputs"), list) else []

        text = "Columbus market snapshot generated."
        if status == "insufficient_data":
            text = "Market snapshot is partial due to missing inputs."

        provenance = metric.get("provenance", {})
        sources = provenance.get("sources", []) if isinstance(provenance, dict) else []

        return AgentResult(
            text=text,
            data=metric,
            status=status,
            missing_inputs=missing_inputs,
            tools_used=["insights.city.columbus", "metrics.micro_market_nowcast_v1"],
            trace_refs={
                "provenance_record_ids": [
                    str(s.get("provenance_record_id")) for s in sources if s.get("provenance_record_id")
                ],
                "freshness": [s.get("freshness", {}) for s in sources if s.get("freshness")],
            },
        )
