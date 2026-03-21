from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.schemas.insights import MarketingPackageInput
from app.services.insights import (
    compute_micro_market_nowcast,
    compute_parcel_insights,
    score_marketing_package,
)

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/city/columbus")
def city_columbus(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> dict:
    return compute_micro_market_nowcast(db, auth.tenant_id)


@router.get("/parcels/{parcel_id}")
def parcel_insights(
    parcel_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return compute_parcel_insights(db, auth.tenant_id, parcel_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/marketing-package/score")
def marketing_score(
    payload: MarketingPackageInput,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return score_marketing_package(db, auth.tenant_id, payload.model_dump(), user_id=auth.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
