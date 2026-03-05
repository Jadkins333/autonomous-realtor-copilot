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
        self.added = []
        self.flush_called = 0
        self.commit_called = 0

    def execute(self, _stmt):
        return _ScalarResult(self._contact)

    def add(self, obj) -> None:
        if getattr(obj, "id", None) is None:
            obj.id = uuid4()
        self.added.append(obj)

    def flush(self) -> None:
        self.flush_called += 1

    def commit(self) -> None:
        self.commit_called += 1


def test_outreach_writer_persists_draft_message() -> None:
    contact = SimpleNamespace(id=uuid4(), name="Ava Thompson", email="ava@example.com")
    db = FakeDB(contact)
    agent = OutreachWriterAgent()

    result = agent.run(
        AgentContext(
            db=db,
            tenant_id=uuid4(),
            message="draft outreach to Ava",
        )
    )

    assert result.status == "ok"
    assert "message_id" in result.data
    assert db.flush_called == 1
    assert db.commit_called == 1
    assert any(getattr(item, "subject", "").startswith("Quick Columbus opportunity snapshot") for item in db.added)
