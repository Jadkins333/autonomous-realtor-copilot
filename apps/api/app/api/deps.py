from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status

from app.utils.security import decode_token


@dataclass
class AuthContext:
    user_id: UUID
    tenant_id: UUID
    role: str


def get_auth_context(authorization: str = Header(default="")) -> AuthContext:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token = authorization.replace("Bearer ", "", 1)
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    try:
        return AuthContext(
            user_id=UUID(payload["sub"]),
            tenant_id=UUID(payload["tenant_id"]),
            role=payload.get("role", "agent"),
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload") from exc


def get_optional_auth_context(
    authorization: str = Header(default=""),
) -> AuthContext | None:
    if not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "", 1)
    payload = decode_token(token)
    if not payload:
        return None
    return AuthContext(user_id=UUID(payload["sub"]), tenant_id=UUID(payload["tenant_id"]), role=payload.get("role", "agent"))


def get_admin_auth_context(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
    if auth.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return auth
