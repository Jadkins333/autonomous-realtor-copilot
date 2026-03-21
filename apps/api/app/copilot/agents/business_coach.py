from __future__ import annotations

from app.copilot.agents.base import AgentContext, AgentMatch, AgentResult, CopilotAgent
from app.services.business_context import build_business_snapshot


def _today_text(snapshot: dict) -> str:
    today = snapshot["today"]
    summary = today["summary"]
    lines = [
        f"Today: {summary['overdue_tasks']} overdue tasks, {summary['due_today']} due today, {summary['deals_at_risk']} deals at risk, and {summary['follow_ups_due']} follow-ups due."
    ]
    if today.get("urgent_tasks"):
        top = today["urgent_tasks"][0]
        lines.append(f'First fire: {top["title"]} ({top.get("contact_name") or top.get("deal_title") or "unassigned context"}).')
    if today.get("follow_ups"):
        top = today["follow_ups"][0]
        lines.append(f'Best follow-up: {top["name"]} in {top["stage"].replace("_", " ")}.')
    if today.get("coach_alerts"):
        top = today["coach_alerts"][0]
        lines.append(f'Coach alert: {top["detail"]}')
    return " ".join(lines)


def _buyers_text(snapshot: dict) -> str:
    buyers = snapshot.get("hot_buyers", [])
    if not buyers:
        return "No high-signal buyers are surfaced yet. Add buyer-stage contacts or next-step due dates to make this useful."
    parts = []
    for buyer in buyers[:3]:
        reason = ", ".join(buyer.get("reasons", [])[:2]) or "priority-ranked"
        parts.append(f'{buyer["name"]} ({buyer["stage"].replace("_", " ")}, {buyer["priority"]}) - {reason}')
    return "Hottest buyers right now: " + "; ".join(parts) + "."


def _listings_text(snapshot: dict) -> str:
    listings = snapshot.get("active_listings", [])
    if not listings:
        return "No active listings are in the pipeline yet."
    parts = []
    for listing in listings[:3]:
        parts.append(
            f'{listing["title"]} ({listing["stage"].replace("_", " ")}, {listing["open_task_count"]} open tasks, {listing["overdue_task_count"]} overdue)'
        )
    return "Active listings: " + "; ".join(parts) + "."


class BusinessCoachAgent(CopilotAgent):
    key = "business_coach"
    name = "Business Coach"
    description = "Answers pipeline, follow-up, listing, and buyer questions using the agent's own workspace data."
    mission = "Reflect the agent's real business state back with concrete next actions."
    sample_prompts = [
        "what should I do today",
        "who are my hottest buyers right now",
        "what's the status of my active listings",
    ]

    def match(self, message: str) -> AgentMatch:
        normalized = message.lower().strip()
        if any(
            phrase in normalized
            for phrase in {
                "what should i do today",
                "my pipeline",
                "deals at risk",
                "active listings",
                "status of my active listings",
                "hottest buyers",
                "hot buyers",
                "follow ups",
                "follow-ups",
            }
        ):
            return AgentMatch(matched=True, reason="Matched business-state workflow intent")
        return AgentMatch(matched=False, reason="No business-state workflow intent detected")

    def run(self, context: AgentContext) -> AgentResult:
        snapshot = build_business_snapshot(context.db, context.tenant_id)
        normalized = context.message.lower().strip()

        if "buyer" in normalized:
            text = _buyers_text(snapshot)
        elif "listing" in normalized:
            text = _listings_text(snapshot)
        elif "risk" in normalized or "follow" in normalized or "today" in normalized:
            text = _today_text(snapshot)
        else:
            summary = snapshot["summary"]
            text = (
                f'Pipeline summary: {summary["open_deals"]} open deals, {summary["open_tasks"]} open tasks, '
                f'{summary["active_listings"]} active listings, and {summary["hot_buyers"]} hot buyers surfaced.'
            )

        return AgentResult(
            text=text,
            data=snapshot,
            tools_used=["workspace.today", "deals.list", "contacts.list", "tasks.list"],
        )
