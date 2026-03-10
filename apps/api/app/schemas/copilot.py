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
    text: str                                    # Deterministic result — always present
    data: dict = Field(default_factory=dict)
    missing_inputs: list[str] = Field(default_factory=list)
    trace: dict = Field(default_factory=dict)
    ai_narration: str | None = None              # LLM explanation; None when offline/disabled


class LLMStatusResponse(BaseModel):
    llm_enabled: bool
    provider: str | None
    model: str | None
    available: bool                              # Live reachability check
    provider_label: str | None


class OutreachRewriteRequest(BaseModel):
    tone: str = "professional"   # professional | casual | urgent | empathetic
    notes: str | None = None


class OutreachRewriteResponse(BaseModel):
    proposed_subject: str | None
    proposed_body: str
    compliance_flags: list[str]                  # empty = passed; non-empty = fair-housing flags
    ai_generated: bool
    provider_label: str | None


class ContactSummaryResponse(BaseModel):
    summary_bullets: list[str]
    raw_summary: str
    ai_generated: bool
    provider_label: str | None
    data_coverage: dict = Field(default_factory=dict)
    unavailable: bool = False                    # True when LLM offline


class ScoreExplanationResponse(BaseModel):
    explanation: str
    key_drivers: list[str]
    suggested_actions: list[str]
    computed_score: float | None
    metric_key: str
    ai_generated: bool
    provider_label: str | None
    unavailable: bool = False
