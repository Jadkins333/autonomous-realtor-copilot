from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.models.entities import DisclosureDefinition
from app.schemas.disclosures import (
    DisclosureAcknowledgeCompatIn,
    DisclosureAcknowledgementIn,
    DisclosureAcknowledgementOut,
    DisclosureEvaluateIn,
    DisclosureGateDecisionOut,
    DisclosureVersionOut,
)
from app.services.disclosures import (
    ACTION_TO_WORKFLOW,
    evaluate_disclosure_gate,
    evaluate_workflow_gate,
    get_disclosure_version,
    record_disclosure_acknowledgement,
)

router = APIRouter(prefix="/disclosures", tags=["disclosures"])


@router.post("/evaluate", response_model=DisclosureGateDecisionOut)
def disclosure_evaluate(
    payload: DisclosureEvaluateIn,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DisclosureGateDecisionOut:
    decision = evaluate_disclosure_gate(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        action=payload.action,
        contact_id=payload.contact_id,
        property_id=payload.property_id,
        log_presentation=False,
    )
    if payload.log_presentation:
        for item in decision.get("blocking_disclosures") or []:
            get_disclosure_version(
                db,
                tenant_id=auth.tenant_id,
                version_id=item["disclosure_version_id"],
                actor_user_id=auth.user_id,
                workflow_action=ACTION_TO_WORKFLOW.get(payload.action, payload.action),
                contact_id=payload.contact_id,
                parcel_id=payload.property_id,
                source=payload.source,
            )
        db.commit()
    return DisclosureGateDecisionOut.model_validate(decision)


@router.get("/workflows/{workflow_action}", response_model=DisclosureGateDecisionOut)
def disclosure_workflow_status(
    workflow_action: str,
    contact_id: UUID | None = Query(default=None),
    client_id: str | None = Query(default=None),
    parcel_id: UUID | None = Query(default=None),
    listing_id: str | None = Query(default=None),
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DisclosureGateDecisionOut:
    decision = evaluate_workflow_gate(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        workflow_action=workflow_action,
        contact_id=contact_id,
        client_id=client_id,
        parcel_id=parcel_id,
        listing_id=listing_id,
    )
    return DisclosureGateDecisionOut.model_validate(decision.to_dict())


@router.get("/versions/{version_id}", response_model=DisclosureVersionOut)
def disclosure_version_detail(
    version_id: UUID,
    workflow_action: str = Query(default=""),
    contact_id: UUID | None = Query(default=None),
    parcel_id: UUID | None = Query(default=None),
    source: str = Query(default="ui"),
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DisclosureVersionOut:
    try:
        version = get_disclosure_version(
            db,
            tenant_id=auth.tenant_id,
            version_id=version_id,
            actor_user_id=auth.user_id,
            workflow_action=workflow_action or None,
            contact_id=contact_id,
            parcel_id=parcel_id,
            source=source,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    definition = db.execute(
        select(DisclosureDefinition).where(DisclosureDefinition.id == version.disclosure_definition_id)
    ).scalar_one()
    db.commit()
    return DisclosureVersionOut(
        id=version.id,
        disclosure_definition_id=version.disclosure_definition_id,
        disclosure_key=definition.key,
        disclosure_type=definition.disclosure_type,
        jurisdiction=definition.jurisdiction,
        version=version.version,
        title=version.title,
        body_markdown=version.body_markdown,
        effective_date=version.effective_date,
        acknowledgement_mode=definition.acknowledgement_mode,
        typed_ack_text=version.typed_ack_text,
    )


@router.post("/acknowledgements", response_model=DisclosureAcknowledgementOut)
def disclosure_acknowledge(
    payload: DisclosureAcknowledgementIn,
    request: Request,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> DisclosureAcknowledgementOut:
    try:
        acknowledgement = record_disclosure_acknowledgement(
            db,
            tenant_id=auth.tenant_id,
            user_id=auth.user_id,
            disclosure_version_id=payload.disclosure_version_id,
            workflow_action=payload.workflow_action,
            contact_id=payload.contact_id,
            client_id=payload.client_id,
            parcel_id=payload.parcel_id,
            listing_id=payload.listing_id,
            acknowledgement_mode=payload.acknowledgement_mode,
            acknowledgement_artifact=payload.acknowledgement_artifact,
            signature_payload=payload.signature_payload,
            device_metadata=payload.device_metadata,
            actor_source=payload.actor_source,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        decision = evaluate_workflow_gate(
            db,
            tenant_id=auth.tenant_id,
            user_id=auth.user_id,
            workflow_action=payload.workflow_action,
            contact_id=payload.contact_id,
            client_id=payload.client_id,
            parcel_id=payload.parcel_id,
            listing_id=payload.listing_id,
        )
        db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return DisclosureAcknowledgementOut(
        acknowledgement_id=acknowledgement.id,
        acknowledged_at=acknowledgement.acknowledged_at,
        disclosure_gate=DisclosureGateDecisionOut.model_validate(decision.to_dict()),
    )


@router.post("/acknowledge")
def disclosure_acknowledge_compat(
    payload: DisclosureAcknowledgeCompatIn,
    request: Request,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    try:
        acknowledgement_artifact = (
            {"checked": True}
            if payload.checkbox_acknowledged
            else {"typed_ack_text": str(payload.typed_acknowledgement or "").strip()}
        )
        workflow_action = ACTION_TO_WORKFLOW.get(payload.action, payload.action)
        mode = "checkbox" if payload.checkbox_acknowledged else "typed_ack"
        record_disclosure_acknowledgement(
            db,
            tenant_id=auth.tenant_id,
            user_id=auth.user_id,
            disclosure_version_id=payload.disclosure_version_id,
            workflow_action=workflow_action,
            contact_id=payload.contact_id,
            parcel_id=payload.property_id,
            acknowledgement_mode=mode,
            acknowledgement_artifact=acknowledgement_artifact,
            signature_payload={},
            device_metadata={"surface": payload.source},
            actor_source={"source": payload.source},
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        decision = evaluate_disclosure_gate(
            db,
            tenant_id=auth.tenant_id,
            user_id=auth.user_id,
            action=payload.action,
            contact_id=payload.contact_id,
            property_id=payload.property_id,
        )
        db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"disclosure_status": decision}
