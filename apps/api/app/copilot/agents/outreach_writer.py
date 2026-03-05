from __future__ import annotations

from sqlalchemy import select

from app.copilot.agents.base import AgentContext, AgentMatch, AgentResult, CopilotAgent
from app.models.entities import Contact, Message
from app.models.enums import Channel, MessageDirection, MessageStatus


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

        draft = {
            "contact_id": str(contact.id),
            "channel": "email",
            "subject": f"Quick Columbus opportunity snapshot for {contact.name}",
            "body": (
                f"Hi {contact.name},\n\n"
                "I prepared a Columbus public-data snapshot with permit momentum, transit proximity, and amenity coverage "
                "around your target areas. If you want, I can send a property-specific profile next.\n\n"
                "Reply STOP to opt out of SMS updates."
            ),
            "sandbox_default": True,
            "compliance_notes": [
                "SMS/voice sends require explicit opt-in.",
                "Quiet hours and frequency caps are enforced server-side.",
            ],
        }

        message = Message(
            tenant_id=context.tenant_id,
            contact_id=contact.id,
            channel=Channel.email,
            direction=MessageDirection.outbound,
            status=MessageStatus.draft,
            subject=draft["subject"],
            body=draft["body"],
            meta_json={
                "created_by": "copilot",
                "source_agent": self.key,
                "sandbox_default": True,
            },
        )
        context.db.add(message)
        context.db.flush()
        context.db.commit()
        draft["message_id"] = str(message.id)

        return AgentResult(
            text="Draft created in sandbox mode, saved to outreach drafts, and ready for approval.",
            data=draft,
            tools_used=["contacts.search", "messages.create_draft", "compliance.policy"],
        )
