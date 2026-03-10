from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.schemas.copilot import ScoreExplanationResponse
from app.schemas.parcels import ParcelSearchResult
from app.services.llm.provider import get_llm_provider
from app.services.llm_features.score_explainer import explain_score
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


@router.get(
    "/{parcel_id}/score-explanation/{metric_key}",
    response_model=ScoreExplanationResponse,
    summary="AI-assisted score explanation",
    description=(
        "Explain a deterministic score in plain English. "
        "Valid metric_key values: negotiation_motivation_v1, micro_market_nowcast_v1. "
        "The score itself was computed by a formula — the AI only explains it. "
        "Returns unavailable=True (not an error) when LLM is offline."
    ),
)
def parcel_score_explanation(
    parcel_id: UUID,
    metric_key: str,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ScoreExplanationResponse:
    valid_keys = {"negotiation_motivation_v1", "micro_market_nowcast_v1"}
    if metric_key not in valid_keys:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown metric_key {metric_key!r}. Valid: {sorted(valid_keys)}",
        )

    provider = get_llm_provider()
    if provider is None:
        return ScoreExplanationResponse(
            explanation="AI score explanation is unavailable. Enable LLM_ENABLED=true to use this feature.",
            key_drivers=[],
            suggested_actions=[],
            computed_score=None,
            metric_key=metric_key,
            ai_generated=False,
            provider_label=None,
            unavailable=True,
        )

    result = explain_score(provider, db, auth.tenant_id, parcel_id, metric_key)
    if result is None:
        return ScoreExplanationResponse(
            explanation="No score data found for this parcel and metric. Run insights first.",
            key_drivers=[],
            suggested_actions=[],
            computed_score=None,
            metric_key=metric_key,
            ai_generated=False,
            provider_label=None,
            unavailable=True,
        )

    return ScoreExplanationResponse(
        explanation=result["explanation"],
        key_drivers=result["key_drivers"],
        suggested_actions=result["suggested_actions"],
        computed_score=result.get("computed_score"),
        metric_key=metric_key,
        ai_generated=result["ai_generated"],
        provider_label=result.get("provider_label"),
        unavailable=False,
    )
