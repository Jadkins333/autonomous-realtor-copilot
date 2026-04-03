from pydantic import BaseModel


class LoginRequest(BaseModel):
    tenant_slug: str
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 – OAuth2 token type, not a credential
    user: dict
