from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.services.ingestion import run_ingestion

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/run")
async def ingest_run(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> dict:
    summary = await run_ingestion(db, auth.tenant_id)
    return {"ok": True, "summary": summary}
