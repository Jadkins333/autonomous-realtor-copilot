from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import (
    DisclosureAcknowledgement,
    DisclosureDefinition,
    DisclosureGate,
    DisclosureVersion,
    Parcel,
)
from app.services.audit import record_activity_event
from app.services.public_pages import build_public_page_last_updated

settings = get_settings()

ACK_MODE_CHECKBOX = "checkbox"
ACK_MODE_TYPED = "typed_ack"
ACK_MODE_SIGNATURE = "signature_placeholder"

WORKFLOW_OUTREACH_APPROVAL = "outreach_approval"
WORKFLOW_MARKETING_PUBLISH = "marketing_publish"
WORKFLOW_SHOWING_ACTIVATION = "showing_activation"

REASON_CODES_BY_DISCLOSURE_KEY = {
    "ohio_agency_relationship": {
        "required": "agency_relationship_required",
        "superseded": "agency_relationship_version_superseded",
    },
    "ohio_seller_fair_housing": {
        "required": "seller_fair_housing_required",
        "superseded": "seller_fair_housing_version_superseded",
    },
}

BLOCK_MESSAGE = "This workflow is blocked until the required Ohio disclosure is completed."
BLOCK_GUIDANCE = "Review and acknowledge the applicable disclosure before continuing."


@dataclass
class BlockingDisclosure:
    gate_id: UUID
    gate_key: str
    disclosure_definition_id: UUID
    disclosure_key: str
    disclosure_type: str
    disclosure_version_id: UUID
    title: str
    version: str
    effective_date: date
    acknowledgement_mode: str
    trigger_event: str
    required_before_action: str
    typed_ack_text: str | None
    message: str
    guidance: str
    summary: str
    human_readable_message: str
    reason_code: str

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["gate_id"] = str(self.gate_id)
        payload["disclosure_definition_id"] = str(self.disclosure_definition_id)
        payload["disclosure_version_id"] = str(self.disclosure_version_id)
        payload["effective_date"] = (
            self.effective_date.isoformat()
            if isinstance(self.effective_date, date)
            else str(self.effective_date)
        )
        return payload


@dataclass
class DisclosureGateDecision:
    allowed: bool
    blocking_disclosures: list[BlockingDisclosure] = field(default_factory=list)
    reason_codes: list[str] = field(default_factory=list)
    human_readable_messages: list[str] = field(default_factory=list)
    jurisdiction: str = "unknown"

    def to_dict(self) -> dict:
        return {
            "allowed": self.allowed,
            "blocking_disclosures": [item.to_dict() for item in self.blocking_disclosures],
            "reason_codes": self.reason_codes,
            "human_readable_messages": self.human_readable_messages,
            "jurisdiction": self.jurisdiction,
        }


def _upsert_activity_event(
    db: Session,
    *,
    tenant_id: UUID,
    entity_type: str,
    entity_id: str,
    event_type: str,
    metadata: dict,
    actor_user_id: UUID | None = None,
) -> None:
    record_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        event_type=event_type,
        metadata=metadata,
    )


def _starter_catalog() -> list[dict]:
    retention = {
        "retention_class": "immutable_operational_record",
        "retention_basis": "tenant_policy",
    }
    return [
        {
            "key": "ohio_agency_relationship",
            "jurisdiction": "OH",
            "disclosure_type": "agency_relationship",
            "acknowledgement_mode": ACK_MODE_CHECKBOX,
            "record_retention_metadata_json": retention,
            "version": {
                "version": "2026.03.19",
                "title": "Ohio agency relationship workflow acknowledgement",
                "body_markdown": (
                    "Review the current Ohio agency relationship disclosure for this workflow before continuing.\n\n"
                    "This acknowledgement records operational completion of the current disclosure step. "
                    "It is not legal advice."
                ),
                "effective_date": date(2026, 3, 19),
                "typed_ack_text": None,
                "metadata_json": {
                    "ui_note": "Operational workflow control only. Not legal advice.",
                },
                "record_retention_metadata_json": retention,
            },
            "gates": [
                {
                    "gate_key": "ohio_agency_relationship_outreach",
                    "jurisdiction": "OH",
                    "trigger_event": "agency_relationship_review",
                    "required_before_action": WORKFLOW_OUTREACH_APPROVAL,
                    "scope_entity_type": "contact",
                    "conditions_json": {"starter_rule": True},
                },
                {
                    "gate_key": "ohio_agency_relationship_showing",
                    "jurisdiction": "OH",
                    "trigger_event": "agency_relationship_review",
                    "required_before_action": WORKFLOW_SHOWING_ACTIVATION,
                    "scope_entity_type": "contact",
                    "conditions_json": {"starter_rule": True},
                },
            ],
        },
        {
            "key": "ohio_seller_fair_housing",
            "jurisdiction": "OH",
            "disclosure_type": "seller_fair_housing",
            "acknowledgement_mode": ACK_MODE_TYPED,
            "record_retention_metadata_json": retention,
            "version": {
                "version": "2026.03.19",
                "title": "Ohio seller-side fair housing workflow acknowledgement",
                "body_markdown": (
                    "Review the current fair housing workflow disclosure before marketing or showing activity continues.\n\n"
                    "This acknowledgement records operational completion of the current disclosure step. "
                    "It is not legal advice."
                ),
                "effective_date": date(2026, 3, 19),
                "typed_ack_text": "I acknowledge this disclosure.",
                "metadata_json": {
                    "ui_note": "Operational workflow control only. Not legal advice.",
                },
                "record_retention_metadata_json": retention,
            },
            "gates": [
                {
                    "gate_key": "ohio_seller_fair_housing_marketing",
                    "jurisdiction": "OH",
                    "trigger_event": "seller_side_fair_housing_review",
                    "required_before_action": WORKFLOW_MARKETING_PUBLISH,
                    "scope_entity_type": "parcel",
                    "conditions_json": {"starter_rule": True},
                },
                {
                    "gate_key": "ohio_seller_fair_housing_showing",
                    "jurisdiction": "OH",
                    "trigger_event": "seller_side_fair_housing_review",
                    "required_before_action": WORKFLOW_SHOWING_ACTIVATION,
                    "scope_entity_type": "parcel",
                    "conditions_json": {"starter_rule": True},
                },
            ],
        },
    ]


def ensure_starter_disclosures(
    db: Session,
    *,
    tenant_id: UUID,
    actor_user_id: UUID | None = None,
) -> None:
    for item in _starter_catalog():
        definition = db.execute(
            select(DisclosureDefinition).where(
                DisclosureDefinition.tenant_id == tenant_id,
                DisclosureDefinition.key == item["key"],
            )
        ).scalar_one_or_none()
        if definition is None:
            definition = DisclosureDefinition(tenant_id=tenant_id, **{k: item[k] for k in item if k not in {"version", "gates"}})
            db.add(definition)
            db.flush()
        else:
            definition.jurisdiction = item["jurisdiction"]
            definition.disclosure_type = item["disclosure_type"]
            definition.acknowledgement_mode = item["acknowledgement_mode"]
            definition.record_retention_metadata_json = item["record_retention_metadata_json"]
            definition.updated_at = datetime.now(tz=UTC)

        version_payload = item["version"]
        version = db.execute(
            select(DisclosureVersion).where(
                DisclosureVersion.disclosure_definition_id == definition.id,
                DisclosureVersion.version == version_payload["version"],
            )
        ).scalar_one_or_none()
        version_changed = False
        if version is None:
            version = DisclosureVersion(
                tenant_id=tenant_id,
                disclosure_definition_id=definition.id,
                created_by_user_id=actor_user_id,
                **version_payload,
            )
            db.add(version)
            db.flush()
            version_changed = True
        else:
            fields = [
                "title",
                "body_markdown",
                "effective_date",
                "typed_ack_text",
                "metadata_json",
                "record_retention_metadata_json",
            ]
            for field_name in fields:
                if getattr(version, field_name) != version_payload[field_name]:
                    setattr(version, field_name, version_payload[field_name])
                    version_changed = True

        if version_changed:
            _upsert_activity_event(
                db,
                tenant_id=tenant_id,
                actor_user_id=actor_user_id,
                entity_type="disclosure_version",
                entity_id=str(version.id),
                event_type="disclosure_version_updated",
                metadata={
                    "disclosure_key": definition.key,
                    "version": version.version,
                    "jurisdiction": definition.jurisdiction,
                },
            )

        for gate_payload in item["gates"]:
            gate = db.execute(
                select(DisclosureGate).where(
                    DisclosureGate.tenant_id == tenant_id,
                    DisclosureGate.gate_key == gate_payload["gate_key"],
                )
            ).scalar_one_or_none()
            if gate is None:
                gate = DisclosureGate(
                    tenant_id=tenant_id,
                    disclosure_definition_id=definition.id,
                    is_active=True,
                    **gate_payload,
                )
                db.add(gate)
                continue

            gate.disclosure_definition_id = definition.id
            gate.jurisdiction = gate_payload["jurisdiction"]
            gate.trigger_event = gate_payload["trigger_event"]
            gate.required_before_action = gate_payload["required_before_action"]
            gate.scope_entity_type = gate_payload["scope_entity_type"]
            gate.conditions_json = gate_payload["conditions_json"]
            gate.is_active = True
            gate.updated_at = datetime.now(tz=UTC)


def ensure_disclosure_configuration(
    db: Session,
    tenant_id: UUID,
    jurisdiction: str = "OH",
    actor_user_id: UUID | None = None,
) -> None:
    if jurisdiction.upper() == "OH":
        ensure_starter_disclosures(db, tenant_id=tenant_id, actor_user_id=actor_user_id)


def _default_ohio_jurisdiction() -> str | None:
    locale = settings.default_locale.lower()
    if settings.ohio_market_enabled and locale.endswith("_oh"):
        return "OH"
    return None


def resolve_jurisdiction(
    db: Session,
    tenant_id: UUID,
    *,
    parcel_id: UUID | None = None,
) -> str:
    if parcel_id is not None:
        parcel = db.execute(
            select(Parcel.state).where(Parcel.tenant_id == tenant_id, Parcel.id == parcel_id)
        ).scalar_one_or_none()
        if parcel:
            return str(parcel).upper()

    fallback = _default_ohio_jurisdiction()
    return fallback or "unknown"


def _current_version_for_definition(
    db: Session,
    *,
    tenant_id: UUID,
    definition_id: UUID,
    as_of: date,
) -> DisclosureVersion | None:
    return db.execute(
        select(DisclosureVersion)
        .where(
            DisclosureVersion.tenant_id == tenant_id,
            DisclosureVersion.disclosure_definition_id == definition_id,
            DisclosureVersion.effective_date <= as_of,
        )
        .order_by(DisclosureVersion.effective_date.desc(), DisclosureVersion.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def _ack_exists_for_gate(
    db: Session,
    *,
    tenant_id: UUID,
    user_id: UUID,
    gate: DisclosureGate,
    version_id: UUID,
    contact_id: UUID | None,
    client_id: str | None,
    parcel_id: UUID | None,
    listing_id: str | None,
) -> bool:
    stmt = select(DisclosureAcknowledgement.id).where(
        DisclosureAcknowledgement.tenant_id == tenant_id,
        DisclosureAcknowledgement.disclosure_version_id == version_id,
        or_(
            DisclosureAcknowledgement.user_id == user_id,
            DisclosureAcknowledgement.agent_id == user_id,
        ),
        DisclosureAcknowledgement.workflow_action == gate.required_before_action,
    )

    scope = gate.scope_entity_type
    if scope == "contact":
        if contact_id is None:
            return False
        stmt = stmt.where(DisclosureAcknowledgement.contact_id == contact_id)
    elif scope == "client":
        if not client_id:
            return False
        stmt = stmt.where(DisclosureAcknowledgement.client_id == client_id)
    elif scope == "parcel":
        if parcel_id is None:
            return False
        stmt = stmt.where(DisclosureAcknowledgement.parcel_id == parcel_id)
    elif scope == "listing":
        if not listing_id:
            return False
        stmt = stmt.where(DisclosureAcknowledgement.listing_id == listing_id)

    return db.execute(stmt.limit(1)).first() is not None


def _has_prior_ack_for_definition_scope(
    db: Session,
    *,
    tenant_id: UUID,
    user_id: UUID,
    gate: DisclosureGate,
    definition_id: UUID,
    contact_id: UUID | None,
    client_id: str | None,
    parcel_id: UUID | None,
    listing_id: str | None,
) -> bool:
    stmt = (
        select(DisclosureAcknowledgement.id)
        .join(DisclosureVersion, DisclosureVersion.id == DisclosureAcknowledgement.disclosure_version_id)
        .where(
            DisclosureAcknowledgement.tenant_id == tenant_id,
            DisclosureVersion.disclosure_definition_id == definition_id,
            or_(
                DisclosureAcknowledgement.user_id == user_id,
                DisclosureAcknowledgement.agent_id == user_id,
            ),
            DisclosureAcknowledgement.workflow_action == gate.required_before_action,
        )
    )

    scope = gate.scope_entity_type
    if scope == "contact":
        if contact_id is None:
            return False
        stmt = stmt.where(DisclosureAcknowledgement.contact_id == contact_id)
    elif scope == "client":
        if not client_id:
            return False
        stmt = stmt.where(DisclosureAcknowledgement.client_id == client_id)
    elif scope == "parcel":
        if parcel_id is None:
            return False
        stmt = stmt.where(DisclosureAcknowledgement.parcel_id == parcel_id)
    elif scope == "listing":
        if not listing_id:
            return False
        stmt = stmt.where(DisclosureAcknowledgement.listing_id == listing_id)

    return db.execute(stmt.limit(1)).first() is not None


def evaluate_workflow_gate(
    db: Session,
    *,
    tenant_id: UUID,
    user_id: UUID | None,
    workflow_action: str,
    contact_id: UUID | None = None,
    client_id: str | None = None,
    parcel_id: UUID | None = None,
    listing_id: str | None = None,
    now: datetime | None = None,
) -> DisclosureGateDecision:
    if user_id is None:
        return DisclosureGateDecision(allowed=True, jurisdiction="unknown")
    jurisdiction = resolve_jurisdiction(db, tenant_id, parcel_id=parcel_id)
    if jurisdiction != "OH":
        return DisclosureGateDecision(allowed=True, jurisdiction=jurisdiction)

    as_of = (now or datetime.now(tz=UTC)).date()
    gates = list(
        db.execute(
            select(DisclosureGate, DisclosureDefinition)
            .join(DisclosureDefinition, DisclosureDefinition.id == DisclosureGate.disclosure_definition_id)
            .where(
                DisclosureGate.tenant_id == tenant_id,
                DisclosureGate.jurisdiction == jurisdiction,
                DisclosureGate.required_before_action == workflow_action,
                DisclosureGate.is_active.is_(True),
            )
            .order_by(DisclosureGate.gate_key.asc())
        ).all()
    )
    if not gates:
        ensure_starter_disclosures(db, tenant_id=tenant_id, actor_user_id=user_id)
        db.flush()
        gates = list(
            db.execute(
                select(DisclosureGate, DisclosureDefinition)
                .join(DisclosureDefinition, DisclosureDefinition.id == DisclosureGate.disclosure_definition_id)
                .where(
                    DisclosureGate.tenant_id == tenant_id,
                    DisclosureGate.jurisdiction == jurisdiction,
                    DisclosureGate.required_before_action == workflow_action,
                    DisclosureGate.is_active.is_(True),
                )
                .order_by(DisclosureGate.gate_key.asc())
            ).all()
        )
    if not gates:
        return DisclosureGateDecision(allowed=True, jurisdiction=jurisdiction)

    blocking: list[BlockingDisclosure] = []
    reason_codes: list[str] = []
    messages: list[str] = []

    for gate, definition in gates:
        version = _current_version_for_definition(
            db,
            tenant_id=tenant_id,
            definition_id=definition.id,
            as_of=as_of,
        )
        if version is None:
            continue

        if _ack_exists_for_gate(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            gate=gate,
            version_id=version.id,
            contact_id=contact_id,
            client_id=client_id,
            parcel_id=parcel_id,
            listing_id=listing_id,
        ):
            continue

        reason_key = REASON_CODES_BY_DISCLOSURE_KEY.get(definition.key, {})
        reason_code = str(reason_key.get("required") or "disclosure_required")
        if _has_prior_ack_for_definition_scope(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            gate=gate,
            definition_id=definition.id,
            contact_id=contact_id,
            client_id=client_id,
            parcel_id=parcel_id,
            listing_id=listing_id,
        ):
            reason_code = str(reason_key.get("superseded") or reason_code)
        reason_codes.append(reason_code)
        messages.extend([BLOCK_MESSAGE, BLOCK_GUIDANCE])
        blocking.append(
            BlockingDisclosure(
                gate_id=gate.id,
                gate_key=gate.gate_key,
                disclosure_definition_id=definition.id,
                disclosure_key=definition.key,
                disclosure_type=definition.disclosure_type,
                disclosure_version_id=version.id,
                title=version.title,
                version=version.version,
                effective_date=version.effective_date,
                acknowledgement_mode=definition.acknowledgement_mode,
                trigger_event=gate.trigger_event,
                required_before_action=gate.required_before_action,
                typed_ack_text=version.typed_ack_text,
                message=BLOCK_MESSAGE,
                guidance=BLOCK_GUIDANCE,
                summary=BLOCK_GUIDANCE,
                human_readable_message=BLOCK_MESSAGE,
                reason_code=reason_code,
            )
        )

    return DisclosureGateDecision(
        allowed=not blocking,
        blocking_disclosures=blocking,
        reason_codes=list(dict.fromkeys(reason_codes)),
        human_readable_messages=list(dict.fromkeys(messages)),
        jurisdiction=jurisdiction,
    )


def get_disclosure_version(
    db: Session,
    *,
    tenant_id: UUID,
    version_id: UUID | str,
    actor_user_id: UUID | None = None,
    workflow_action: str | None = None,
    contact_id: UUID | None = None,
    parcel_id: UUID | None = None,
    source: str = "unknown",
) -> DisclosureVersion:
    resolved_version_id = UUID(str(version_id))
    version = db.execute(
        select(DisclosureVersion, DisclosureDefinition)
        .join(DisclosureDefinition, DisclosureDefinition.id == DisclosureVersion.disclosure_definition_id)
        .where(
            DisclosureVersion.tenant_id == tenant_id,
            DisclosureVersion.id == resolved_version_id,
        )
    ).first()
    if version is None:
        raise ValueError("Disclosure version not found")

    version_row, definition = version
    _upsert_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        entity_type="disclosure_version",
        entity_id=str(version_row.id),
        event_type="disclosure_presented",
        metadata={
            "workflow_action": workflow_action,
            "contact_id": str(contact_id) if contact_id else None,
            "parcel_id": str(parcel_id) if parcel_id else None,
            "source": source,
            "disclosure_key": definition.key,
        },
    )
    return version_row


def _validate_acknowledgement_payload(
    *,
    version: DisclosureVersion,
    definition: DisclosureDefinition,
    acknowledgement_mode: str,
    acknowledgement_artifact: dict,
    signature_payload: dict,
) -> None:
    if acknowledgement_mode != definition.acknowledgement_mode:
        raise ValueError("Acknowledgement mode does not match the required disclosure mode")

    if acknowledgement_mode == ACK_MODE_CHECKBOX:
        if acknowledgement_artifact.get("checked") is not True:
            raise ValueError("Checkbox acknowledgement must be explicitly confirmed")
        return

    if acknowledgement_mode == ACK_MODE_TYPED:
        typed_value = str(acknowledgement_artifact.get("typed_ack_text") or "").strip()
        required_text = str(version.typed_ack_text or "").strip()
        if not typed_value or typed_value != required_text:
            raise ValueError("Typed acknowledgement must match the required statement")
        return

    if acknowledgement_mode == ACK_MODE_SIGNATURE:
        if not signature_payload and acknowledgement_artifact.get("signature_placeholder") is not True:
            raise ValueError("Signature placeholder acknowledgement requires a placeholder payload")
        return

    raise ValueError("Unsupported acknowledgement mode")


def record_disclosure_acknowledgement(
    db: Session,
    *,
    tenant_id: UUID,
    user_id: UUID,
    disclosure_version_id: UUID,
    workflow_action: str,
    contact_id: UUID | None = None,
    client_id: str | None = None,
    parcel_id: UUID | None = None,
    listing_id: str | None = None,
    acknowledgement_mode: str,
    acknowledgement_artifact: dict,
    signature_payload: dict,
    device_metadata: dict,
    actor_source: dict,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> DisclosureAcknowledgement:
    row = db.execute(
        select(DisclosureVersion, DisclosureDefinition)
        .join(DisclosureDefinition, DisclosureDefinition.id == DisclosureVersion.disclosure_definition_id)
        .where(
            DisclosureVersion.tenant_id == tenant_id,
            DisclosureVersion.id == disclosure_version_id,
        )
    ).first()
    if row is None:
        raise ValueError("Disclosure version not found")

    version, definition = row
    _validate_acknowledgement_payload(
        version=version,
        definition=definition,
        acknowledgement_mode=acknowledgement_mode,
        acknowledgement_artifact=acknowledgement_artifact,
        signature_payload=signature_payload,
    )

    acknowledgement = DisclosureAcknowledgement(
        tenant_id=tenant_id,
        user_id=user_id,
        agent_id=user_id,
        contact_id=contact_id,
        client_id=client_id,
        parcel_id=parcel_id,
        listing_id=listing_id,
        disclosure_version_id=disclosure_version_id,
        workflow_action=workflow_action,
        acknowledgement_mode=acknowledgement_mode,
        acknowledgement_artifact_json=acknowledgement_artifact,
        signature_payload_json=signature_payload,
        device_metadata_json=device_metadata,
        actor_source_json=actor_source,
        record_retention_metadata_json=version.record_retention_metadata_json or definition.record_retention_metadata_json,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(acknowledgement)
    db.flush()

    _upsert_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        entity_type="disclosure_acknowledgement",
        entity_id=str(acknowledgement.id),
        event_type="disclosure_acknowledged",
        metadata={
            "disclosure_version_id": str(disclosure_version_id),
            "workflow_action": workflow_action,
            "contact_id": str(contact_id) if contact_id else None,
            "parcel_id": str(parcel_id) if parcel_id else None,
            "listing_id": listing_id,
            "client_id": client_id,
        },
    )
    return acknowledgement


def record_blocked_workflow_event(
    db: Session,
    *,
    tenant_id: UUID,
    user_id: UUID | None,
    workflow_action: str,
    entity_type: str,
    entity_id: str,
    disclosure_gate: DisclosureGateDecision,
) -> None:
    _upsert_activity_event(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        event_type="disclosure_blocked_workflow",
        metadata={
            "workflow_action": workflow_action,
            "jurisdiction": disclosure_gate.jurisdiction,
            "reason_codes": disclosure_gate.reason_codes,
            "blocking_disclosures": [item.to_dict() for item in disclosure_gate.blocking_disclosures],
        },
    )


ACTION_TO_WORKFLOW = {
    "outreach_approve": WORKFLOW_OUTREACH_APPROVAL,
    "property_marketing_action": WORKFLOW_MARKETING_PUBLISH,
    "marketing_package_score": WORKFLOW_MARKETING_PUBLISH,
    "opportunity_activate": WORKFLOW_SHOWING_ACTIVATION,
    "showing_activation": WORKFLOW_SHOWING_ACTIVATION,
}


def evaluate_disclosure_gate(
    db: Session,
    *,
    tenant_id: UUID,
    user_id: UUID | None,
    action: str,
    contact_id: UUID | None = None,
    client_id: str | None = None,
    property_id: UUID | None = None,
    listing_id: str | None = None,
    jurisdiction: str | None = None,
    log_presentation: bool = False,
) -> dict:
    workflow_action = ACTION_TO_WORKFLOW.get(action, action)
    decision = evaluate_workflow_gate(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        workflow_action=workflow_action,
        contact_id=contact_id,
        client_id=client_id,
        parcel_id=property_id,
        listing_id=listing_id,
    )
    if jurisdiction and decision.jurisdiction == "unknown":
        decision.jurisdiction = jurisdiction
    return decision.to_dict()


def record_blocked_disclosure_workflow(
    db: Session,
    *,
    tenant_id: UUID,
    user_id: UUID | None,
    action: str,
    subject_type: str,
    subject_id: str,
    decision: dict,
) -> None:
    blocking_rows = []
    for row in decision.get("blocking_disclosures") or []:
        effective_date = row.get("effective_date") or date(1970, 1, 1)
        if isinstance(effective_date, str):
            effective_date = date.fromisoformat(effective_date)
        blocking_rows.append(
            BlockingDisclosure(
                gate_id=UUID(str(row.get("gate_id") or "00000000-0000-0000-0000-000000000000")),
                gate_key=str(row.get("gate_key") or "compat_blocking_disclosure"),
                disclosure_definition_id=UUID(
                    str(row.get("disclosure_definition_id") or "00000000-0000-0000-0000-000000000000")
                ),
                disclosure_key=str(row.get("disclosure_key") or "unknown_disclosure"),
                disclosure_type=str(row.get("disclosure_type") or "unknown"),
                disclosure_version_id=UUID(str(row.get("disclosure_version_id"))),
                title=str(row.get("title") or "Required disclosure"),
                version=str(row.get("version") or "unknown"),
                effective_date=effective_date,
                acknowledgement_mode=str(row.get("acknowledgement_mode") or ACK_MODE_CHECKBOX),
                trigger_event=str(row.get("trigger_event") or ACTION_TO_WORKFLOW.get(action, action)),
                required_before_action=str(row.get("required_before_action") or ACTION_TO_WORKFLOW.get(action, action)),
                typed_ack_text=row.get("typed_ack_text"),
                message=str(row.get("message") or row.get("human_readable_message") or BLOCK_MESSAGE),
                guidance=str(row.get("guidance") or row.get("summary") or BLOCK_GUIDANCE),
                summary=str(row.get("summary") or row.get("guidance") or BLOCK_GUIDANCE),
                human_readable_message=str(row.get("human_readable_message") or row.get("message") or BLOCK_MESSAGE),
                reason_code=str(row.get("reason_code") or "disclosure_required"),
            )
        )
    gate_decision = DisclosureGateDecision(
        allowed=bool(decision.get("allowed")),
        blocking_disclosures=blocking_rows,
        reason_codes=list(decision.get("reason_codes") or []),
        human_readable_messages=list(decision.get("human_readable_messages") or []),
        jurisdiction=str(decision.get("jurisdiction") or "unknown"),
    )
    record_blocked_workflow_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        workflow_action=ACTION_TO_WORKFLOW.get(action, action),
        entity_type=subject_type,
        entity_id=subject_id,
        disclosure_gate=gate_decision,
    )


def build_public_page_compliance(*, jurisdiction: str, freshness: dict | None) -> dict:
    payload = build_public_page_last_updated(freshness, jurisdiction=jurisdiction)
    status = "ok" if payload["status"] == "current" else "warning"
    return {
        "jurisdiction": payload["jurisdiction"],
        "last_updated_at": payload["last_updated_at"],
        "status": status,
        "message": payload["warning_message"]
        or "Last updated date is available for this page.",
        "update_window_days": settings.ohio_website_update_window_days if jurisdiction == "OH" else None,
    }


def acknowledge_disclosure(
    db: Session,
    *,
    tenant_id: UUID,
    user_id: UUID,
    action: str,
    disclosure_version_id: UUID,
    contact_id: UUID | None = None,
    property_id: UUID | None = None,
    source: str = "ui",
    checkbox_acknowledged: bool = False,
    typed_acknowledgement: str | None = None,
) -> dict:
    mode = ACK_MODE_CHECKBOX if checkbox_acknowledged else ACK_MODE_TYPED
    acknowledgement = record_disclosure_acknowledgement(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        disclosure_version_id=disclosure_version_id,
        workflow_action=ACTION_TO_WORKFLOW.get(action, action),
        contact_id=contact_id,
        parcel_id=property_id,
        acknowledgement_mode=mode,
        acknowledgement_artifact={"checked": True} if checkbox_acknowledged else {"typed_ack_text": typed_acknowledgement or ""},
        signature_payload={},
        device_metadata={"surface": source},
        actor_source={"source": source},
    )
    decision = evaluate_disclosure_gate(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        contact_id=contact_id,
        property_id=property_id,
    )
    return {
        "acknowledgement": {
            "id": str(acknowledgement.id),
            "acknowledged_at": acknowledgement.acknowledged_at.isoformat(),
        },
        "disclosure_status": decision,
    }
