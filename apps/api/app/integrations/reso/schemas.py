from pydantic import BaseModel, Field


class ResoTenantSettings(BaseModel):
    tenant_id: str
    enable_sync: bool = False
    base_url: str | None = None
    resources: list[str] = Field(default_factory=lambda: ["Property", "Member", "Office"])
    auth_mode: str = "oauth2_client_credentials"


class ResoTenantSettingsStore(BaseModel):
    settings: list[ResoTenantSettings] = Field(default_factory=list)
