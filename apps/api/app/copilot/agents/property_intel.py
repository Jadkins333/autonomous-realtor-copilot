from __future__ import annotations

from sqlalchemy import select

from app.copilot.agents.base import AgentContext, AgentMatch, AgentResult, CopilotAgent
from app.models.entities import Parcel
from app.services.parcels import get_parcel_detail


class PropertyIntelAgent(CopilotAgent):
    key = "property_intel"
    name = "Property Intel"
    description = "Build parcel-level profile with permits, flood, transit, and insight cards."
    mission = "Use verifiable parcel and insight records only; return insufficient_data when parcel is missing."
    sample_prompts = ["property profile for 145 N High St", "property profile for 010-123456"]

    def match(self, message: str) -> AgentMatch:
        normalized = message.lower().strip()
        if normalized.startswith("property profile for"):
            return AgentMatch(matched=True, reason="Matched explicit property profile command")
        return AgentMatch(matched=False, reason="No property profile command detected")

    def run(self, context: AgentContext) -> AgentResult:
        target = context.message.split("for", 1)[1].strip() if "for" in context.message else ""
        if not target:
            return AgentResult(
                text="Provide an address or parcel number after 'property profile for'.",
                status="insufficient_data",
                missing_inputs=["address_or_parcel"],
                tools_used=["parcels.search"],
            )

        parcel = context.db.execute(
            select(Parcel).where(
                Parcel.tenant_id == context.tenant_id,
                (Parcel.address.ilike(f"%{target}%")) | (Parcel.parcel_number.ilike(f"%{target}%")),
            )
        ).scalar_one_or_none()

        if not parcel:
            return AgentResult(
                text=f"No parcel found for '{target}'.",
                status="insufficient_data",
                missing_inputs=["parcel_match"],
                tools_used=["parcels.search"],
            )

        detail = get_parcel_detail(context.db, context.tenant_id, parcel.id)
        prov = detail.get("provenance", {})
        freshness = prov.get("freshness", {}) if isinstance(prov, dict) else {}

        return AgentResult(
            text=f"Property profile for {detail.get('address', parcel.address)} is ready.",
            data=detail,
            tools_used=["parcels.search", "parcels.detail", "insights.parcel"],
            trace_refs={
                "provenance_record_ids": [str(prov.get("provenance_record_id"))]
                if prov.get("provenance_record_id")
                else [],
                "freshness": [freshness] if freshness else [],
            },
        )
