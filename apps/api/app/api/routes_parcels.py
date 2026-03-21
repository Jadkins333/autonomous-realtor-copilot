from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.schemas.parcels import ParcelDetailResponse, ParcelSearchResult
from app.services.negotiation import compute_negotiation_insight
from app.services.parcels import get_parcel_detail, search_parcels

router = APIRouter(prefix="/parcels", tags=["parcels"])


@router.get("/search", response_model=list[ParcelSearchResult])
def parcels_search(
    q: str | None = Query(default=None, alias="q", min_length=2),
    query: str | None = Query(default=None, min_length=2),
    x_client_surface: str | None = Header(default=None),
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[ParcelSearchResult]:
    search_term = (query or q or "").strip()
    if len(search_term) < 2:
        raise HTTPException(status_code=422, detail="Search query must be at least 2 characters")
    return search_parcels(
        db,
        auth.tenant_id,
        search_term,
        user_id=auth.user_id,
        surface=x_client_surface or "authenticated_api",
    )


@router.get("/{parcel_id}", response_model=ParcelDetailResponse)
def parcel_detail(
    parcel_id: UUID,
    response: Response,
    x_client_surface: str | None = Header(default=None),
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ParcelDetailResponse:
    try:
        payload = get_parcel_detail(
            db,
            auth.tenant_id,
            parcel_id,
            user_id=auth.user_id,
            surface=x_client_surface or "authenticated_api",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    response.headers["x-source-origin"] = str(payload["source_origin"])
    response.headers["x-offline-cache-allowed"] = str(payload["display_policy"]["can_cache_offline"]).lower()
    response.headers["x-restricted-actions"] = ",".join(payload["restricted_actions"])
    return payload


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
