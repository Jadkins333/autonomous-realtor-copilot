from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.schemas.deals import DealCreate, DealOut, DealTaskOut, DealUpdate
from app.schemas.contacts import ContactActivityOut
from app.services.workspace import create_deal, get_deal_detail, list_deals, update_deal

router = APIRouter(prefix="/deals", tags=["deals"])


@router.get("", response_model=list[DealOut])
def deals_list(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[DealOut]:
    return [DealOut.model_validate(item) for item in list_deals(db, auth.tenant_id)]


@router.post("", response_model=DealOut)
def deals_create(
    payload: DealCreate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DealOut:
    return DealOut.model_validate(create_deal(db, auth.tenant_id, auth.user_id, payload.model_dump()))


@router.get("/{deal_id}", response_model=DealOut)
def deals_get(
    deal_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DealOut:
    try:
        detail = get_deal_detail(db, auth.tenant_id, deal_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DealOut.model_validate(detail)


@router.get("/{deal_id}/tasks", response_model=list[DealTaskOut])
def deals_tasks(
    deal_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[DealTaskOut]:
    try:
        detail = get_deal_detail(db, auth.tenant_id, deal_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return [DealTaskOut.model_validate(item) for item in detail["tasks"]]


@router.get("/{deal_id}/activity", response_model=list[ContactActivityOut])
def deals_activity(
    deal_id: UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[ContactActivityOut]:
    try:
        detail = get_deal_detail(db, auth.tenant_id, deal_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return [ContactActivityOut.model_validate(item) for item in detail["activity"]]


@router.put("/{deal_id}", response_model=DealOut)
def deals_update(
    deal_id: UUID,
    payload: DealUpdate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DealOut:
    try:
        item = update_deal(
            db,
            auth.tenant_id,
            deal_id,
            auth.user_id,
            payload.model_dump(exclude_none=True),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DealOut.model_validate(item)
