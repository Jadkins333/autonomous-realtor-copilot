from __future__ import annotations

from sqlalchemy import select

from app.copilot.agents.base import AgentContext, AgentMatch, AgentResult, CopilotAgent
from app.models.entities import Contact
from app.services.outreach import create_draft_pack
from app.services.providers import get_voice_provider_status


class OutreachWriterAgent(CopilotAgent):
    key = "outreach_writer"
    name = "Outreach Writer"
    description = "Draft compliance-aware outreach copy in sandbox mode."
    mission = "Draft clear outreach while preserving consent and sandbox requirements."
    sample_prompts = ["draft outreach to Ava", "draft outreach to noah@example.com"]

    def match(self, message: str) -> AgentMatch:
        normalized = message.lower().strip()
        if normalized.startswith("draft outreach to"):
            return AgentMatch(matched=True, reason="Matched explicit outreach draft command")
        return AgentMatch(matched=False, reason="No outreach draft command detected")

    def run(self, context: AgentContext) -> AgentResult:
        target = context.message.split("to", 1)[1].strip() if "to" in context.message else ""
        if not target:
            return AgentResult(
                text="Provide a contact name or email after 'draft outreach to'.",
                status="insufficient_data",
                missing_inputs=["contact_identifier"],
                tools_used=["contacts.search"],
            )

        contact = context.db.execute(
            select(Contact).where(
                Contact.tenant_id == context.tenant_id,
                (Contact.name.ilike(f"%{target}%")) | (Contact.email.ilike(f"%{target}%")),
            )
        ).scalar_one_or_none()

        if not contact:
            return AgentResult(
                text=f"No contact found for '{target}'.",
                status="insufficient_data",
                missing_inputs=["contact_match"],
                tools_used=["contacts.search"],
            )

        objective = (
            "I prepared a Columbus public-data snapshot with permit momentum, transit proximity, and amenity coverage "
            "for your target areas. I can send the property-specific profile next."
        )
        voice_status = get_voice_provider_status()
        channels = ["sms", "email"]
        if voice_status.available:
            channels.append("voice")
        pack = create_draft_pack(
            context.db,
            tenant_id=context.tenant_id,
            user_id=context.user_id or context.tenant_id,
            contact_id=contact.id,
            parcel_id=None,
            objective=objective,
            channels=channels,
            sandbox=True,
        )

        summary = "Draft pack created in sandbox mode with SMS and email drafts."
        if voice_status.available:
            summary = "Draft pack created in sandbox mode with SMS, email, and voice call drafts."
        elif voice_status.reason:
            summary += f" Voice call drafting is available only after voice is configured: {voice_status.reason}"

        return AgentResult(
            text=f"{summary} Submit and approve each draft before send.",
            data={
                "pack_id": str(pack["id"]),
                "contact_id": str(contact.id),
                "channels": [
                    draft.channel.value if hasattr(draft.channel, "value") else str(draft.channel)
                    for draft in pack["drafts"]
                ],
                "draft_ids": [str(draft.id) for draft in pack["drafts"]],
                "sandbox_default": True,
                "compliance_notes": [
                    "SMS sends require explicit opt-in.",
                    "Voice calls require explicit voice consent and signed Twilio callbacks.",
                    "Quiet hours and frequency caps are enforced server-side.",
                ],
            },
            tools_used=["contacts.search", "outreach.create_draft_pack", "compliance.policy"],
        )
