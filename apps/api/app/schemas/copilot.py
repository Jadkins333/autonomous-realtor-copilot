from pydantic import BaseModel, Field


class CopilotRequest(BaseModel):
    message: str


class CopilotAgentDescriptor(BaseModel):
    key: str
    name: str
    description: str
    mission: str
    sample_prompts: list[str] = Field(default_factory=list)


class CopilotChatResponse(BaseModel):
    status: str
    text: str
    data: dict = Field(default_factory=dict)
    missing_inputs: list[str] = Field(default_factory=list)
    trace: dict = Field(default_factory=dict)
