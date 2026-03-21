from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.schemas.workspace import CaptureOpportunityOut, TodayWorkspaceOut
from app.services.workspace import capture_opportunity, get_today_workspace

router = APIRouter(prefix="/workspace", tags=["workspace"])


@router.get("/today", response_model=TodayWorkspaceOut)
def workspace_today(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> TodayWorkspaceOut:
    return TodayWorkspaceOut.model_validate(get_today_workspace(db, auth.tenant_id))


@router.post("/capture/opportunity/{parcel_id}", response_model=CaptureOpportunityOut)
def workspace_capture_opportunity(
    parcel_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> CaptureOpportunityOut:
    try:
        return CaptureOpportunityOut.model_validate(
            capture_opportunity(db, auth.tenant_id, auth.user_id, parcel_id)
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
