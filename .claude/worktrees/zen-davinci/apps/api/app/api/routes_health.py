from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.metrics import get_metrics_payload

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@router.get("/metrics")
def metrics(db: Session = Depends(get_db)) -> dict:
    return get_metrics_payload(db)
