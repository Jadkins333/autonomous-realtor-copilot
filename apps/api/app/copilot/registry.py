from __future__ import annotations

from app.copilot.agents.base import CopilotAgent
from app.copilot.agents.business_coach import BusinessCoachAgent
from app.copilot.agents.compliance_checker import ComplianceCheckerAgent
from app.copilot.agents.data_provenance_explainer import DataProvenanceExplainerAgent
from app.copilot.agents.market_analyst import MarketAnalystAgent
from app.copilot.agents.outreach_writer import OutreachWriterAgent
from app.copilot.agents.property_intel import PropertyIntelAgent


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: list[CopilotAgent] = [
            BusinessCoachAgent(),
            PropertyIntelAgent(),
            OutreachWriterAgent(),
            ComplianceCheckerAgent(),
            MarketAnalystAgent(),
            DataProvenanceExplainerAgent(),
        ]

    def list(self) -> list[CopilotAgent]:
        return self._agents


registry = AgentRegistry()
