"""Tests for LLM feature services.

Tests cover:
  - narrate_agent_result: returns text on success, None on LLMUnavailable
  - classify_intent: parses valid JSON, handles LLMUnavailable, handles bad JSON
  - generate_outreach_draft: returns draft with compliance check applied
  - generate_outreach_draft: returns None on LLMUnavailable
  - generate_outreach_draft: compliance flags present in result when violations found
  - Copilot router fallback: ai_narration is None when no provider (existing behavior preserved)
  - Copilot router with LLM: ai_narration populated when provider returns narration
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import UUID

import pytest

from app.copilot.agents.base import AgentContext, AgentResult, AgentTraceRefs
from app.services.llm.provider import LLMUnavailable


# ── Mock provider helpers ─────────────────────────────────────────────────────

def _mock_provider(response: str = "narrated result") -> MagicMock:
    p = MagicMock()
    p.complete.return_value = response
    p.provider_label = "test/mock-model"
    return p


def _unavailable_provider() -> MagicMock:
    p = MagicMock()
    p.complete.side_effect = LLMUnavailable("test: server offline")
    p.provider_label = "test/unavailable"
    return p


# ── narrator.narrate_agent_result ─────────────────────────────────────────────

class TestNarrateAgentResult:
    def _make_result(self, text="Score ready.", status="ok", data=None, missing=None) -> AgentResult:
        return AgentResult(
            text=text,
            data=data or {"score": 72.5},
            status=status,
            missing_inputs=missing or [],
            trace_refs=AgentTraceRefs(),
        )

    def test_returns_narration_on_success(self):
        from app.services.llm_features.narrator import narrate_agent_result

        provider = _mock_provider("The market score is strong at 72.5.")
        result = self._make_result()
        narration = narrate_agent_result(provider, "What's the market doing?", result, "Market Analyst")
        assert narration == "The market score is strong at 72.5."
        provider.complete.assert_called_once()

    def test_returns_none_on_llm_unavailable(self):
        from app.services.llm_features.narrator import narrate_agent_result

        provider = _unavailable_provider()
        result = self._make_result()
        narration = narrate_agent_result(provider, "market?", result, "Market Analyst")
        assert narration is None

    def test_returns_none_on_empty_response(self):
        from app.services.llm_features.narrator import narrate_agent_result

        provider = _mock_provider("")  # Empty response
        result = self._make_result()
        narration = narrate_agent_result(provider, "market?", result, "Market Analyst")
        assert narration is None

    def test_deterministic_text_not_modified(self):
        """narrate_agent_result must not alter the AgentResult."""
        from app.services.llm_features.narrator import narrate_agent_result

        provider = _mock_provider("LLM says something different.")
        result = self._make_result(text="Deterministic answer.")
        narrate_agent_result(provider, "q", result, "Agent")
        # Original text unchanged
        assert result.text == "Deterministic answer."

    def test_insufficient_data_status_passed_to_llm(self):
        """LLM should receive the insufficient_data status so it can acknowledge gaps."""
        from app.services.llm_features.narrator import narrate_agent_result

        provider = _mock_provider("Data is missing.")
        result = self._make_result(text="Partial.", status="insufficient_data", missing=["permits"])
        narrate_agent_result(provider, "q", result, "Analyst")
        call_prompt = provider.complete.call_args[0][0]
        assert "insufficient_data" in call_prompt


# ── narrator.classify_intent ──────────────────────────────────────────────────

class TestClassifyIntent:
    def test_parses_valid_json(self):
        from app.services.llm_features.narrator import classify_intent

        provider = _mock_provider('{"intent": "market_snapshot", "target": "", "reason": "user asked about market"}')
        result = classify_intent(provider, "What's the Columbus market doing?")
        assert result is not None
        assert result["intent"] == "market_snapshot"

    def test_returns_none_on_llm_unavailable(self):
        from app.services.llm_features.narrator import classify_intent

        provider = _unavailable_provider()
        result = classify_intent(provider, "anything")
        assert result is None

    def test_returns_none_on_malformed_json(self):
        from app.services.llm_features.narrator import classify_intent

        provider = _mock_provider("This is not JSON at all.")
        result = classify_intent(provider, "anything")
        assert result is None

    def test_strips_markdown_fences(self):
        from app.services.llm_features.narrator import classify_intent

        provider = _mock_provider('```json\n{"intent": "property_profile", "target": "145 N High", "reason": "address"}\n```')
        result = classify_intent(provider, "Tell me about 145 N High")
        assert result is not None
        assert result["intent"] == "property_profile"
        assert result["target"] == "145 N High"

    def test_unknown_intent_normalized(self):
        from app.services.llm_features.narrator import classify_intent

        provider = _mock_provider('{"intent": "invented_intent_xyz", "target": "", "reason": ""}')
        result = classify_intent(provider, "gibberish")
        assert result is not None
        assert result["intent"] == "unknown"


# ── outreach_drafter.generate_outreach_draft ──────────────────────────────────

class TestGenerateOutreachDraft:
    def test_email_draft_returned(self):
        from app.services.llm_features.outreach_drafter import generate_outreach_draft

        provider = _mock_provider("Great opportunity in Columbus!")
        with patch("app.services.llm_features.outreach_drafter.evaluate_fair_housing_text", return_value=[]):
            result = generate_outreach_draft(
                provider,
                contact_name="Ava Test",
                contact_email="ava@test.com",
                contact_phone=None,
                channel="email",
                objective="Share property data",
                tone="professional",
            )
        assert result is not None
        assert result["body"] == "Great opportunity in Columbus!"
        assert result["ai_generated"] is True
        assert result["compliance_flags"] == []

    def test_sms_draft_subject_is_none(self):
        from app.services.llm_features.outreach_drafter import generate_outreach_draft

        provider = _mock_provider("Hi Ava, great property data available. Reply STOP to opt out.")
        with patch("app.services.llm_features.outreach_drafter.evaluate_fair_housing_text", return_value=[]):
            result = generate_outreach_draft(
                provider,
                contact_name="Ava",
                contact_email=None,
                contact_phone="+16145551234",
                channel="sms",
                objective="Share data",
            )
        assert result is not None
        assert result["subject"] is None
        assert result["body"] is not None

    def test_voice_draft_subject_is_none(self):
        from app.services.llm_features.outreach_drafter import generate_outreach_draft

        provider = _mock_provider(
            "Hi Ava, this is a quick call about the property data update we prepared for your area. Please call us back when you have a moment."
        )
        with patch("app.services.llm_features.outreach_drafter.evaluate_fair_housing_text", return_value=[]):
            result = generate_outreach_draft(
                provider,
                contact_name="Ava",
                contact_email=None,
                contact_phone="+16145551234",
                channel="voice",
                objective="Share data",
            )
        assert result is not None
        assert result["subject"] is None
        assert "call us back" in result["body"].lower()

    def test_returns_none_on_llm_unavailable(self):
        from app.services.llm_features.outreach_drafter import generate_outreach_draft

        provider = _unavailable_provider()
        result = generate_outreach_draft(
            provider,
            contact_name="Bob",
            contact_email="bob@test.com",
            contact_phone=None,
            channel="email",
            objective="Test",
        )
        assert result is None

    def test_compliance_flags_populated_when_violations(self):
        """Compliance check runs AFTER LLM generation and populates flags."""
        from app.services.llm_features.outreach_drafter import generate_outreach_draft

        provider = _mock_provider("Great for families looking for the ideal neighborhood!")
        with patch(
            "app.services.llm_features.outreach_drafter.evaluate_fair_housing_text",
            return_value=["families", "ideal"],
        ):
            result = generate_outreach_draft(
                provider,
                contact_name="Test",
                contact_email="t@t.com",
                contact_phone=None,
                channel="email",
                objective="test",
            )
        assert result is not None
        assert "families" in result["compliance_flags"] or "ideal" in result["compliance_flags"]

    def test_provider_label_included(self):
        from app.services.llm_features.outreach_drafter import generate_outreach_draft

        provider = _mock_provider("Body text")
        provider.provider_label = "ollama/llama3.2"
        with patch("app.services.llm_features.outreach_drafter.evaluate_fair_housing_text", return_value=[]):
            result = generate_outreach_draft(
                provider,
                contact_name="Test",
                contact_email=None,
                contact_phone=None,
                channel="sms",
                objective="test",
            )
        assert result is not None
        assert result["provider_label"] == "ollama/llama3.2"


# ── score_explainer.explain_score ─────────────────────────────────────────────

class TestExplainScore:
    def test_negotiation_metric_uses_motivation_score_shape(self):
        from app.services.llm_features.score_explainer import explain_score

        provider = _mock_provider(
            "This score comes from a deterministic formula.\n"
            "• Long ownership is the strongest signal.\n"
            "→ Ask the seller about timing flexibility."
        )
        metric_value = SimpleNamespace(
            value_json={
                "motivation_score": 65.0,
                "signals_used": [
                    {
                        "signal": "days_since_last_sale",
                        "raw_value": 4200,
                        "rule_hits": ["+25 days_since_last_sale >= 3650"],
                    }
                ],
            },
            inputs_json={"days_since_last_sale": {"value": 4200}},
        )
        metric_def = SimpleNamespace(
            name="Negotiation Motivation",
            formula_markdown="score = deterministic formula",
        )
        parcel = SimpleNamespace(address="123 Test St")

        metric_row = MagicMock()
        metric_row.first.return_value = (metric_value, metric_def)
        parcel_row = MagicMock()
        parcel_row.scalar_one_or_none.return_value = parcel

        db = MagicMock()
        db.execute.side_effect = [metric_row, parcel_row]

        result = explain_score(
            provider,
            db,
            tenant_id=UUID("00000000-0000-0000-0000-000000000001"),
            parcel_id=UUID("00000000-0000-0000-0000-000000000101"),
            metric_key="negotiation_motivation_v1",
        )

        assert result is not None
        assert result["computed_score"] == 65.0
        assert result["key_drivers"] == ["• Long ownership is the strongest signal."]
        assert result["suggested_actions"] == ["→ Ask the seller about timing flexibility."]

        prompt = provider.complete.call_args[0][0]
        assert "Computed score: 65.0" in prompt
        assert "signals_used" in prompt


# ── Copilot router integration ────────────────────────────────────────────────

class TestCopilotRouterLLMIntegration:
    def _make_db_context(self):
        """Build a minimal AgentContext with mocked DB."""
        db = MagicMock()
        return AgentContext(
            db=db,
            tenant_id=UUID("00000000-0000-0000-0000-000000000001"),
            message="columbus market snapshot",
            user_id=None,
        )

    def test_ai_narration_none_when_no_provider(self):
        """When LLM disabled, ai_narration must be None, text must still be present."""
        from app.copilot.router import route_message
        from app.services.llm.provider import _reset_llm_provider_cache

        _reset_llm_provider_cache()
        with patch("app.copilot.router.get_llm_provider", return_value=None):
            with patch("app.copilot.router.registry") as mock_registry:
                mock_agent = MagicMock()
                mock_agent.key = "market_analyst"
                mock_agent.name = "Market Analyst"
                mock_agent.match.return_value = MagicMock(matched=True, reason="matched")
                mock_agent.run.return_value = AgentResult(
                    text="Deterministic market data.",
                    data={"score": 65.0},
                    status="ok",
                    trace_refs=AgentTraceRefs(),
                )
                mock_registry.list.return_value = [mock_agent]

                ctx = self._make_db_context()
                result = route_message(ctx)

        assert result["text"] == "Deterministic market data."
        assert result["ai_narration"] is None
        assert result["trace"]["llm_used"] is False

    def test_ai_narration_populated_when_provider_available(self):
        """When LLM available, ai_narration supplements (not replaces) deterministic text."""
        from app.copilot.router import route_message

        provider = _mock_provider()

        with patch("app.copilot.router.get_llm_provider", return_value=provider):
            with patch("app.copilot.router.registry") as mock_registry:
                mock_agent = MagicMock()
                mock_agent.key = "market_analyst"
                mock_agent.name = "Market Analyst"
                mock_agent.match.return_value = MagicMock(matched=True, reason="matched")
                mock_agent.run.return_value = AgentResult(
                    text="Score is 65.",
                    data={"score": 65.0},
                    status="ok",
                    trace_refs=AgentTraceRefs(),
                )
                mock_registry.list.return_value = [mock_agent]

                # Patch at the module where narrate_agent_result is defined (lazy import)
                with patch(
                    "app.services.llm_features.narrator.narrate_agent_result",
                    return_value="The market score of 65 indicates moderate activity.",
                ):
                    ctx = self._make_db_context()
                    result = route_message(ctx)

        # Deterministic result unchanged
        assert result["text"] == "Score is 65."
        assert result["data"] == {"score": 65.0}
        # LLM narration added
        assert result["ai_narration"] == "The market score of 65 indicates moderate activity."
        assert result["trace"]["llm_used"] is True
        assert result["trace"]["llm_provider"] == "test/mock-model"

    def test_deterministic_result_returned_when_llm_narration_fails(self):
        """If LLM narration fails, deterministic result must still be returned intact."""
        from app.copilot.router import route_message

        provider = _unavailable_provider()

        with patch("app.copilot.router.get_llm_provider", return_value=provider):
            with patch("app.copilot.router.registry") as mock_registry:
                mock_agent = MagicMock()
                mock_agent.key = "market_analyst"
                mock_agent.name = "Market Analyst"
                mock_agent.match.return_value = MagicMock(matched=True, reason="matched")
                mock_agent.run.return_value = AgentResult(
                    text="Deterministic fallback.",
                    data={},
                    status="ok",
                    trace_refs=AgentTraceRefs(),
                )
                mock_registry.list.return_value = [mock_agent]

                # LLM narration returns None (graceful failure)
                with patch(
                    "app.services.llm_features.narrator.narrate_agent_result",
                    return_value=None,
                ):
                    ctx = self._make_db_context()
                    result = route_message(ctx)

        assert result["text"] == "Deterministic fallback."
        assert result["ai_narration"] is None
        assert result["trace"]["llm_used"] is False
