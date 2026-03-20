from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.schemas.parcels import ParcelSearchResult
from app.services.negotiation import compute_negotiation_insight
from app.services.parcels import get_parcel_detail, search_parcels

router = APIRouter(prefix="/parcels", tags=["parcels"])


@router.get("/search", response_model=list[ParcelSearchResult])
def parcels_search(
    query: str = Query(..., min_length=2),
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[ParcelSearchResult]:
    return search_parcels(db, auth.tenant_id, query)


@router.get("/{parcel_id}")
def parcel_detail(
    parcel_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return get_parcel_detail(db, auth.tenant_id, parcel_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{parcel_id}/negotiation")
def parcel_negotiation(
    parcel_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return compute_negotiation_insight(db, auth.tenant_id, parcel_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
