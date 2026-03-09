from __future__ import annotations

from app.copilot.agents.base import AgentContext, AgentMatch, AgentResult, CopilotAgent
from app.services.compliance import evaluate_fair_housing_text


class ComplianceCheckerAgent(CopilotAgent):
    key = "compliance_checker"
    name = "Compliance Checker"
    description = "Checks outreach/marketing text for fair-housing and channel policy issues."
    mission = "Prevent risky language and explain enforcement outcomes with compliance references."
    sample_prompts = [
        "compliance check: ideal for families and perfect for singles",
        "check compliance for this message: ...",
    ]

    def match(self, message: str) -> AgentMatch:
        normalized = message.lower().strip()
        if normalized.startswith("compliance check") or normalized.startswith("check compliance"):
            return AgentMatch(matched=True, reason="Matched explicit compliance command")
        return AgentMatch(matched=False, reason="No compliance command detected")

    def run(self, context: AgentContext) -> AgentResult:
        text = context.message
        if ":" in text:
            text = text.split(":", 1)[1].strip()
        if not text:
            return AgentResult(
                text="Provide text to review, e.g. 'compliance check: <message>'.",
                status="insufficient_data",
                missing_inputs=["message_text"],
                tools_used=["compliance.fair_housing"],
            )

        flagged_terms = evaluate_fair_housing_text(text)
        result = {
            "flagged_terms": flagged_terms,
            "risk_level": "high" if flagged_terms else "low",
            "docs": {
                "fair_housing": "/docs/compliance/fair_housing_advertising.md",
                "tcpa": "/docs/compliance/tcpa.md",
                "can_spam": "/docs/compliance/can_spam.md",
            },
        }

        message = "Compliance scan complete: no flagged terms found."
        if flagged_terms:
            message = "Compliance scan complete: flagged fair-housing terms detected."

        return AgentResult(
            text=message,
            data=result,
            tools_used=["compliance.fair_housing"],
            trace_refs={
                "freshness": [
                    {
                        "fetched_at": None,
                        "ttl_seconds": 31536000,
                        "staleness": "fresh",
                        "is_stale": False,
                    }
                ]
            },
        )
