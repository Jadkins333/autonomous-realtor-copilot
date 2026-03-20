from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.deps import AuthContext, get_auth_context
from app.copilot import router as copilot_router
from app.copilot.agents.base import AgentContext, AgentMatch, AgentResult
from app.copilot.router import route_message
from app.db.session import get_db
from app.main import app


class DummyDB:
    pass


class DummyAgent:
    key = "dummy_agent"
    name = "Dummy Agent"
    description = "test"
    mission = "test"
    sample_prompts = ["ping"]

    def match(self, _message: str) -> AgentMatch:
        return AgentMatch(matched=True, reason="Matched for contract test")

    def run(self, _context: AgentContext) -> AgentResult:
        return AgentResult(
            text="ok",
            data={"demo": True},
            tools_used=["dummy.tool"],
            trace_refs={
                "provenance_record_ids": ["prov-1"],
                "source_run_ids": ["run-1"],
                "freshness": [{"staleness": "fresh"}],
            },
        )


def test_route_message_trace_contract(monkeypatch) -> None:
    monkeypatch.setattr(copilot_router.registry, "list", lambda: [DummyAgent()])

    payload = route_message(AgentContext(db=DummyDB(), tenant_id=uuid4(), message="ping"))

    assert payload["status"] == "ok"
    assert payload["trace"]["selected_agent"] == "dummy_agent"
    assert payload["trace"]["tools_used"] == ["dummy.tool"]
    assert payload["trace"]["provenance"]["provenance_record_ids"] == ["prov-1"]
    assert "summary" in payload["trace"]["freshness"]


def test_copilot_chat_route_trace_shape(monkeypatch) -> None:
    app.dependency_overrides[get_db] = lambda: DummyDB()
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(user_id=uuid4(), tenant_id=uuid4(), role="agent")

    monkeypatch.setattr(
        "app.api.routes_copilot.run_copilot_command",
        lambda *_args, **_kwargs: {
            "status": "ok",
            "text": "hello",
            "data": {},
            "missing_inputs": [],
            "trace": {
                "selected_agent": "market_analyst",
                "decisions": ["matched market intent"],
                "tools_used": ["insights.city.columbus"],
                "provenance": {"provenance_record_ids": []},
                "freshness": {"summary": {"is_any_stale": False}, "sources": []},
            },
        },
    )

    try:
        with TestClient(app) as client:
            response = client.post("/copilot/chat", json={"message": "columbus market snapshot"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["trace"]["selected_agent"] == "market_analyst"
        assert isinstance(payload["trace"]["tools_used"], list)
        assert payload["trace"]["tools_used"]
    finally:
        app.dependency_overrides.clear()
