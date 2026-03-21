from __future__ import annotations

from sqlalchemy import desc, select

from app.copilot.agents.base import AgentContext, AgentMatch, AgentResult, CopilotAgent
from app.models.entities import MetricDefinition, MetricValue


class DataProvenanceExplainerAgent(CopilotAgent):
    key = "data_provenance_explainer"
    name = "Data Provenance Explainer"
    description = "Explains metric formulas, inputs, and freshness from stored Truth Layer records."
    mission = "Help users audit where numbers came from without exposing secrets."
    sample_prompts = ["explain provenance for market snapshot", "show provenance"]

    def match(self, message: str) -> AgentMatch:
        normalized = message.lower().strip()
        if "provenance" in normalized or normalized.startswith("explain data"):
            return AgentMatch(matched=True, reason="Matched provenance explanation intent")
        return AgentMatch(matched=False, reason="No provenance explanation intent detected")

    def run(self, context: AgentContext) -> AgentResult:
        latest = context.db.execute(
            select(MetricValue, MetricDefinition)
            .join(MetricDefinition, MetricDefinition.id == MetricValue.metric_definition_id)
            .where(MetricValue.tenant_id == context.tenant_id)
            .order_by(desc(MetricValue.computed_at))
            .limit(1)
        ).first()

        if not latest:
            return AgentResult(
                text="No metric history is available yet. Run ingestion and insights first.",
                status="insufficient_data",
                missing_inputs=["metric_values"],
                tools_used=["metrics.history"],
            )

        metric_value, metric_def = latest
        payload = {
            "metric_key": metric_def.key,
            "version": metric_def.version,
            "formula_markdown": metric_def.formula_markdown,
            "computed_at": metric_value.computed_at.isoformat(),
            "value": metric_value.value_json,
            "inputs": metric_value.inputs_json,
            "provenance": metric_value.provenance_json,
        }

        sources = []
        prov = metric_value.provenance_json or {}
        if isinstance(prov, dict):
            sources = prov.get("sources", []) if isinstance(prov.get("sources", []), list) else []

        return AgentResult(
            text=f"Provenance summary ready for {metric_def.key} {metric_def.version}.",
            data=payload,
            tools_used=["metrics.history", "provenance.records"],
            trace_refs={
                "provenance_record_ids": [
                    str(s.get("provenance_record_id")) for s in sources if s.get("provenance_record_id")
                ],
                "freshness": [s.get("freshness", {}) for s in sources if s.get("freshness")],
            },
        )
