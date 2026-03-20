from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.copilot.registry import registry
from app.db.session import get_db
from app.schemas.copilot import CopilotAgentDescriptor, CopilotChatResponse, CopilotRequest
from app.services.copilot import run_copilot_command

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


@router.post("/chat")
def copilot_chat(
    payload: CopilotRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> CopilotChatResponse:
    return run_copilot_command(db, auth.tenant_id, auth.user_id, payload.message)
