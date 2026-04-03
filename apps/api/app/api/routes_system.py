from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_admin_auth_context, get_auth_context
from app.db.session import get_db
from app.services.system_diag import get_system_diagnostics

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/diagnostics")
def system_diagnostics(
    auth: AuthContext = Depends(get_admin_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    _ = auth
    return get_system_diagnostics(db)


@router.get("/metrics")
def system_metrics(
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    from app.models.entities import (
        ActivityEvent,
        Deal,
        OpportunityEvent,
        OutreachDraftPack,
        Parcel,
        Task,
    )

    _ = auth
    return {
        "parcels": db.query(Parcel).count(),
        "opportunities": db.query(OpportunityEvent).count(),
        "deals": db.query(Deal).count(),
        "tasks": db.query(Task).count(),
        "outreach": db.query(OutreachDraftPack).count(),
        "events": db.query(ActivityEvent).count(),
    }
