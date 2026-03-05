from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_admin_auth_context, get_auth_context
from app.core.config import get_settings
from app.db.session import get_db
from app.schemas.sources import SourceStatusOut
from app.services.ingestion import (
    get_sources_status,
    replay_source_dlq,
    set_source_pause,
    set_source_resume,
)
from app.services.source_ops import set_source_drift_debug

settings = get_settings()

router = APIRouter(prefix="/sources", tags=["sources"])


class PauseSourceRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=512)


class DebugDriftRequest(BaseModel):
    drift_detected: bool
    reason: str | None = Field(default=None, max_length=512)


@router.get("/status", response_model=SourceStatusOut)
def source_status(
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> SourceStatusOut:
    _ = auth
    return SourceStatusOut(items=get_sources_status(db))


@router.post("/{source_name}/pause")
def source_pause(
    source_name: str,
    payload: PauseSourceRequest,
    auth: AuthContext = Depends(get_admin_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    _ = auth
    return set_source_pause(db, source_name=source_name, reason=payload.reason)


@router.post("/{source_name}/resume")
def source_resume(
    source_name: str,
    auth: AuthContext = Depends(get_admin_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    _ = auth
    return set_source_resume(db, source_name=source_name)


@router.post("/{source_name}/dlq/replay")
def source_replay(
    source_name: str,
    auth: AuthContext = Depends(get_admin_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    result = replay_source_dlq(db, tenant_id=auth.tenant_id, source_name=source_name)
    if not result["ok"]:
        raise HTTPException(status_code=409, detail=result)
    return result


@router.post("/{source_name}/debug/drift")
def source_set_debug_drift(
    source_name: str,
    payload: DebugDriftRequest,
    auth: AuthContext = Depends(get_admin_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    _ = auth
    if settings.environment.lower() == "production":
        raise HTTPException(status_code=403, detail="Debug diagnostics are disabled in production")
    if not settings.debug_diag:
        raise HTTPException(status_code=403, detail="Debug diagnostics are disabled")

    row = set_source_drift_debug(
        db,
        source_name=source_name,
        drift_detected=payload.drift_detected,
        reason=payload.reason,
    )
    db.commit()
    return {
        "source_name": row.source_name,
        "state": row.state.value,
        "drift_detected": row.drift_detected,
        "drift_reason": row.drift_reason,
        "paused_reason": row.paused_reason,
    }
