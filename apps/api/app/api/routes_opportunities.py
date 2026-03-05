from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.services.opportunities import list_opportunities

router = APIRouter(prefix="/opportunities", tags=["opportunities"])


@router.get("")
def opportunities(
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    return list_opportunities(db, auth.tenant_id)
