from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.services.opportunities import list_opportunities, list_opportunity_events

router = APIRouter(prefix="/opportunities", tags=["opportunities"])


@router.get("")
def opportunities(
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    return list_opportunities(db, auth.tenant_id)


@router.get("/events")
def opportunity_events(
    parcel_id: UUID | None = Query(default=None),
    severity: str | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=100, ge=1, le=500),
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    return list_opportunity_events(
        db,
        auth.tenant_id,
        parcel_id=parcel_id,
        severity=severity,
        days=days,
        limit=limit,
    )
