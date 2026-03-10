from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from uuid import uuid4

from app.copilot.agents.base import AgentContext
from app.copilot.agents.outreach_writer import OutreachWriterAgent


@dataclass
class _ScalarResult:
    value: object

    def scalar_one_or_none(self):
        return self.value


class FakeDB:
    def __init__(self, contact) -> None:
        self._contact = contact

    def execute(self, _stmt):
        return _ScalarResult(self._contact)


def test_outreach_writer_creates_draft_pack_and_excludes_insurance_terms(monkeypatch) -> None:
    contact = SimpleNamespace(id=uuid4(), name="Ava Thompson", email="ava@example.com")
    db = FakeDB(contact)
    agent = OutreachWriterAgent()

    monkeypatch.setattr(
        "app.copilot.agents.outreach_writer.create_draft_pack",
        lambda *_args, **_kwargs: {
            "id": uuid4(),
            "drafts": [
                SimpleNamespace(id=uuid4(), channel=SimpleNamespace(value="sms")),
                SimpleNamespace(id=uuid4(), channel=SimpleNamespace(value="email")),
            ],
        },
    )

    result = agent.run(
        AgentContext(
            db=db,
            tenant_id=uuid4(),
            user_id=uuid4(),
            message="draft outreach to Ava",
        )
    )

    assert result.status == "ok"
    assert len(result.data.get("draft_ids", [])) == 2
    assert sorted(result.data.get("channels", [])) == ["email", "sms"]
    assert "insurance_pressure" not in str(result.data).lower()
    assert "verify with insurer" not in str(result.data).lower()
    assert "voice" not in result.text.lower()
