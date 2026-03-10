"""LLM-backed outreach draft generation and rewriting.

Flow:
  1. Build context from contact + parcel + objective (all deterministic data)
  2. LLM generates draft body (and optionally subject) for the requested channel/tone
  3. Deterministic compliance engine checks the generated text for fair-housing violations
  4. If compliance fails, the draft is rejected and caller receives flagged_terms list
  5. Caller decides whether to save, retry, or discard

The LLM never bypasses compliance. Compliance is enforced AFTER generation.
The LLM is told in its system prompt to avoid prohibited language — this is defence-in-depth,
not a replacement for the compliance check.

Returns None on LLMUnavailable — callers fall back to the existing template-based drafting.
"""
from __future__ import annotations

import logging

from app.services.compliance import evaluate_fair_housing_text
from app.services.llm.provider import LLMProvider, LLMUnavailable

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a compliance-aware outreach writer for a licensed real estate team.

Critical rules — violations will cause the draft to be rejected:
1. NEVER use protected-class language (familial status, race, religion, national origin,
   disability, sex, color, age, marital status). This is a fair housing requirement.
2. NEVER describe a neighborhood using demographic characteristics.
3. NEVER fabricate property statistics, prices, or facts not explicitly provided in the context.
4. SMS messages MUST be under 160 characters total and MUST include "Reply STOP to opt out."
5. Email subject lines MUST be under 60 characters.
6. Match the requested tone exactly: professional | casual | urgent | empathetic.
7. Return ONLY the requested field (subject line OR message body). No labels, headers, or commentary.
"""

# Intent → channel → tone mapping
_TONE_HINTS: dict[str, str] = {
    "professional": "formal, clear, and respectful",
    "casual": "friendly and conversational",
    "urgent": "concise and action-oriented",
    "empathetic": "warm and understanding",
}


def generate_outreach_draft(
    provider: LLMProvider,
    *,
    contact_name: str,
    contact_email: str | None,
    contact_phone: str | None,
    channel: str,
    objective: str,
    tone: str = "professional",
    parcel_address: str | None = None,
    parcel_highlights: str | None = None,
    existing_body: str | None = None,
    rewrite_notes: str | None = None,
) -> dict | None:
    """
    Generate or rewrite an outreach message.

    Returns:
        {
            "subject": str | None,          # email only
            "body": str,
            "compliance_flags": list[str],   # empty = passed
            "ai_generated": True,
            "provider_label": str,
        }
    or None if LLM is unavailable.

    Raises nothing — all LLM errors produce None.
    """
    channel_lower = channel.lower()
    tone_description = _TONE_HINTS.get(tone, tone)

    # Build context block (only from provided facts — LLM must not invent)
    context_parts = [f"Contact name: {contact_name}"]
    if contact_email:
        context_parts.append(f"Email: {contact_email}")
    if contact_phone:
        context_parts.append(f"Phone: {contact_phone}")
    if parcel_address:
        context_parts.append(f"Property address: {parcel_address}")
    if parcel_highlights:
        context_parts.append(f"Property highlights: {parcel_highlights}")
    context_parts.append(f"Objective: {objective}")
    context_block = "\n".join(context_parts)

    is_rewrite = bool(existing_body)
    action = "Rewrite" if is_rewrite else "Draft"

    if channel_lower == "email":
        subject_prompt = (
            f"Context:\n{context_block}\n\n"
            f"{action} an email SUBJECT LINE for the above context.\n"
            f"Tone: {tone_description}.\n"
            f"Requirement: under 60 characters. Return ONLY the subject line, no quotes."
        )
        if is_rewrite:
            subject_prompt += f"\nOriginal subject to improve: {existing_body[:80]}"
        if rewrite_notes:
            subject_prompt += f"\nNotes: {rewrite_notes}"

        body_prompt = (
            f"Context:\n{context_block}\n\n"
            f"{action} an email BODY for the above context.\n"
            f"Tone: {tone_description}.\n"
            "Include a clear call-to-action. End with a brief closing. No HTML.\n"
            "Return ONLY the email body text."
        )
        if is_rewrite and existing_body:
            body_prompt += f"\nOriginal body to improve:\n{existing_body}"
        if rewrite_notes:
            body_prompt += f"\nNotes: {rewrite_notes}"

        try:
            subject = provider.complete(subject_prompt, system=_SYSTEM_PROMPT).strip()
            body = provider.complete(body_prompt, system=_SYSTEM_PROMPT).strip()
        except LLMUnavailable as exc:
            logger.debug("llm_outreach_draft_unavailable channel=email reason=%s", exc)
            return None

    elif channel_lower == "sms":
        body_prompt = (
            f"Context:\n{context_block}\n\n"
            f"{action} an SMS message for the above context.\n"
            f"Tone: {tone_description}.\n"
            "Hard limits: under 160 characters TOTAL. Must include 'Reply STOP to opt out.' at the end.\n"
            "Return ONLY the SMS text."
        )
        if is_rewrite and existing_body:
            body_prompt += f"\nOriginal SMS to improve: {existing_body}"
        if rewrite_notes:
            body_prompt += f"\nNotes: {rewrite_notes}"

        try:
            body = provider.complete(body_prompt, system=_SYSTEM_PROMPT).strip()
            subject = None
        except LLMUnavailable as exc:
            logger.debug("llm_outreach_draft_unavailable channel=sms reason=%s", exc)
            return None

    else:
        # Voice / other: generate a voicemail outline
        body_prompt = (
            f"Context:\n{context_block}\n\n"
            f"{action} a voicemail outline for the above context.\n"
            f"Tone: {tone_description}.\n"
            "Include: greeting, purpose, call-to-action, opt-out mention.\n"
            "Return ONLY the voicemail outline."
        )
        if is_rewrite and existing_body:
            body_prompt += f"\nOriginal outline to improve:\n{existing_body}"
        if rewrite_notes:
            body_prompt += f"\nNotes: {rewrite_notes}"

        try:
            body = provider.complete(body_prompt, system=_SYSTEM_PROMPT).strip()
            subject = None
        except LLMUnavailable as exc:
            logger.debug("llm_outreach_draft_unavailable channel=%s reason=%s", channel, exc)
            return None

    # Deterministic compliance check — always runs after LLM generation
    compliance_flags = evaluate_fair_housing_text(body)
    if subject:
        compliance_flags += evaluate_fair_housing_text(subject)

    return {
        "subject": subject,
        "body": body,
        "compliance_flags": compliance_flags,
        "ai_generated": True,
        "provider_label": provider.provider_label,
    }
