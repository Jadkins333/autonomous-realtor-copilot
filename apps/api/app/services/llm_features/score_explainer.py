"""LLM-backed score explanation service.

The deterministic engine computes scores via formulas (not AI).
This module uses the LLM to translate those formulas and computed values
into plain-English explanations for real estate agents.

Critical invariant: the LLM receives the actual computed score value and formula.
It must explain what was computed, not recompute or estimate.

Returns None on LLMUnavailable.
"""
from __future__ import annotations

import json
import logging
from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.entities import MetricDefinition, MetricValue, Parcel
from app.services.llm.provider import LLMProvider, LLMUnavailable

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are an AI assistant explaining a deterministic analytics score to a real estate agent.

Critical rules:
1. This score was computed by a formula, NOT by AI. State this in your explanation.
2. Only cite the actual computed inputs provided — never invent or estimate values.
3. Identify the biggest contributing factors from the formula weights shown.
4. Suggest 2-3 realistic next actions appropriate to the score level.
5. Never claim the score is higher or lower than the actual value shown.
6. Keep the explanation to 3-4 sentences + bullet-pointed suggestions.
7. Do not use jargon. Write for a working real estate agent, not a data scientist.
"""

_SCORE_CONTEXT = {
    "micro_market_nowcast_v1": {
        "display_name": "Columbus Market Nowcast",
        "range": "0–100 (higher = stronger market activity)",
        "weights": "50% permit activity, 30% amenity density, 20% mortgage rate trend",
        "action_guidance": {
            "high": "Score ≥ 70: strong momentum — good time to accelerate outreach",
            "medium": "Score 40–69: moderate activity — standard cadence appropriate",
            "low": "Score < 40: weak signals — consider researching specific sub-markets",
        },
    },
    "negotiation_motivation_v1": {
        "display_name": "Negotiation Motivation",
        "range": "0–100 (higher = seller may be more motivated)",
        "weights": "25 pts open violations (≥3), 15 pts open violations (1–2), "
                   "20 pts recent permits (≥2), 10 pts recent permit (1), "
                   "25 pts long ownership (10+ yrs), 15 pts medium ownership (5–9 yrs)",
        "action_guidance": {
            "high": "Score ≥ 60: multiple motivation signals present — stronger negotiating position",
            "medium": "Score 30–59: some motivation signals — worth pursuing with standard offer",
            "low": "Score < 30: few signals — seller may not be highly motivated",
        },
    },
}


def _extract_score_payload(metric_key: str, value_json: dict) -> tuple[float | None, dict]:
    computed_score = value_json.get("score")
    components = value_json.get("components") or {}

    if metric_key == "negotiation_motivation_v1":
        if computed_score is None:
            computed_score = value_json.get("motivation_score")
        if not components and value_json.get("signals_used"):
            components = {"signals_used": value_json["signals_used"]}

    return computed_score, components


def explain_score(
    provider: LLMProvider,
    db: Session,
    tenant_id: UUID,
    parcel_id: UUID | None,
    metric_key: str,
) -> dict | None:
    """
    Explain a computed score in plain English.

    Returns:
        {
            "explanation": str,            # 3-4 sentence explanation
            "key_drivers": list[str],      # bullet points of biggest factors
            "suggested_actions": list[str], # 2-3 next steps
            "computed_score": float | None,
            "metric_key": str,
            "ai_generated": True,
            "provider_label": str,
        }
    or None if score not found or LLM unavailable.
    """
    # Fetch the latest metric value from DB
    query = (
        select(MetricValue, MetricDefinition)
        .join(MetricDefinition, MetricDefinition.id == MetricValue.metric_definition_id)
        .where(
            MetricValue.tenant_id == tenant_id,
            MetricDefinition.key == metric_key,
        )
    )
    if parcel_id:
        query = query.where(MetricValue.subject_id == str(parcel_id))
    query = query.order_by(desc(MetricValue.computed_at)).limit(1)

    row = db.execute(query).first()
    if not row:
        return None

    metric_value, metric_def = row
    value_json = metric_value.value_json or {}
    inputs_json = metric_value.inputs_json or {}

    computed_score, components = _extract_score_payload(metric_key, value_json)

    # Get parcel address if available
    parcel_address = None
    if parcel_id:
        parcel = db.execute(
            select(Parcel).where(Parcel.id == parcel_id, Parcel.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if parcel:
            parcel_address = parcel.address

    # Build score context for the LLM
    ctx = _SCORE_CONTEXT.get(metric_key, {
        "display_name": metric_def.name,
        "range": "0–100",
        "weights": metric_def.formula_markdown or "see formula",
        "action_guidance": {},
    })

    score_level = "medium"
    if computed_score is not None:
        if computed_score >= 60:
            score_level = "high"
        elif computed_score < 30:
            score_level = "low"

    prompt_parts = [
        f"Score name: {ctx['display_name']}",
        f"Computed score: {computed_score} (scale: {ctx['range']})",
        f"Formula weights: {ctx['weights']}",
    ]
    if parcel_address:
        prompt_parts.append(f"Property: {parcel_address}")
    if components:
        prompt_parts.append(f"Score components: {json.dumps(components)}")
    if inputs_json:
        prompt_parts.append(f"Input values: {json.dumps(inputs_json)}")
    prompt_parts.append(f"Guidance for this level: {ctx['action_guidance'].get(score_level, '')}")
    prompt_parts.append(f"Formula: {metric_def.formula_markdown}")

    prompt = (
        "\n".join(prompt_parts) + "\n\n"
        "Write:\n"
        "1. A 3-4 sentence plain-English explanation of this score.\n"
        "2. Key drivers (2-3 bullets starting with '• ').\n"
        "3. Suggested next actions (2-3 bullets starting with '→ ').\n"
        "Do not repeat the numbers from above verbatim — interpret them."
    )

    try:
        raw = provider.complete(prompt, system=_SYSTEM_PROMPT).strip()
    except LLMUnavailable as exc:
        logger.debug("llm_score_explain_unavailable metric=%s reason=%s", metric_key, exc)
        return None
    except Exception as exc:
        logger.warning("llm_score_explain_unexpected metric=%s error=%s", metric_key, exc)
        return None

    # Parse structured sections from response
    lines = raw.splitlines()
    explanation_lines, key_drivers, suggested_actions = [], [], []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("•"):
            key_drivers.append(stripped)
        elif stripped.startswith("→"):
            suggested_actions.append(stripped)
        elif stripped:
            explanation_lines.append(stripped)

    explanation = " ".join(explanation_lines) if explanation_lines else raw

    return {
        "explanation": explanation,
        "key_drivers": key_drivers[:5],
        "suggested_actions": suggested_actions[:4],
        "computed_score": computed_score,
        "metric_key": metric_key,
        "ai_generated": True,
        "provider_label": provider.provider_label,
    }
