from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_admin_auth_context, get_auth_context
from app.db.session import get_db
from app.services.dashboard_digest import build_dashboard_digest
from app.services.system_diag import get_system_diagnostics

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/dashboard-digest")
def dashboard_digest(
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    return build_dashboard_digest(db, auth.tenant_id)


@router.get("/diagnostics")
def system_diagnostics(
    auth: AuthContext = Depends(get_admin_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    _ = auth
    return get_system_diagnostics(db)
