from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.copilot.registry import registry
from app.core.config import get_settings
from app.db.session import get_db
from app.schemas.copilot import (
    CopilotAgentDescriptor,
    CopilotChatResponse,
    CopilotRequest,
    LLMStatusResponse,
)
from app.services.copilot import run_copilot_command
from app.services.llm.provider import get_llm_provider

router = APIRouter(prefix="/copilot", tags=["copilot"])


@router.get("/agents", response_model=list[CopilotAgentDescriptor])
def copilot_agents() -> list[CopilotAgentDescriptor]:
    return [
        CopilotAgentDescriptor(
            key=agent.key,
            name=agent.name,
            description=agent.description,
            mission=agent.mission,
            sample_prompts=agent.sample_prompts,
        )
        for agent in registry.list()
    ]


@router.post("/chat", response_model=CopilotChatResponse)
def copilot_chat(
    payload: CopilotRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> CopilotChatResponse:
    result = run_copilot_command(db, auth.tenant_id, auth.user_id, payload.message)
    return CopilotChatResponse(
        status=result["status"],
        text=result["text"],
        data=result.get("data", {}),
        missing_inputs=result.get("missing_inputs", []),
        trace=result.get("trace", {}),
        ai_narration=result.get("ai_narration"),
    )


@router.get("/llm-status", response_model=LLMStatusResponse)
def copilot_llm_status() -> LLMStatusResponse:
    """Check current LLM provider configuration and live reachability.

    The deterministic copilot continues to work regardless of this status.
    Used by the UI to show/hide AI-assisted indicators.
    """
    settings = get_settings()
    provider = get_llm_provider()

    available = False
    provider_label: str | None = None

    if provider is not None:
        available = provider.health_check()
        provider_label = provider.provider_label

    return LLMStatusResponse(
        llm_enabled=settings.llm_enabled,
        provider=settings.llm_provider if settings.llm_enabled else None,
        model=settings.llm_model if settings.llm_enabled else None,
        available=available,
        provider_label=provider_label,
    )
