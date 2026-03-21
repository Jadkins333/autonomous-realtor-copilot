from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Parcel, ProvenanceRecord
from app.services.insights import compute_parcel_insights, parcel_detail_metrics
from app.services.provenance import build_provenance


def search_parcels(db: Session, tenant_id: UUID, query: str) -> list[Parcel]:
    return list(
        db.execute(
            select(Parcel)
            .where(
                Parcel.tenant_id == tenant_id,
                (Parcel.address.ilike(f"%{query}%")) | (Parcel.parcel_number.ilike(f"%{query}%")),
            )
            .order_by(Parcel.updated_at.desc())
            .limit(50)
        ).scalars()
    )


def get_parcel_detail(db: Session, tenant_id: UUID, parcel_id: UUID) -> dict:
    parcel = db.execute(
        select(Parcel).where(Parcel.tenant_id == tenant_id, Parcel.id == parcel_id)
    ).scalar_one_or_none()
    if not parcel:
        raise ValueError("Parcel not found")

    provenance = None
    if parcel.provenance_id:
        provenance = db.execute(
            select(ProvenanceRecord).where(ProvenanceRecord.id == parcel.provenance_id)
        ).scalar_one_or_none()

    details = parcel_detail_metrics(db, tenant_id, parcel.id)
    insights = compute_parcel_insights(db, tenant_id, parcel.id)
    return {
        "id": str(parcel.id),
        "parcel_number": parcel.parcel_number,
        "address": parcel.address,
        "city": parcel.city,
        "state": parcel.state,
        "zip": parcel.zip,
        "attributes_json": parcel.attributes_json,
        "provenance": build_provenance(
            provenance.source_id if provenance else None,
            provenance.raw_url if provenance else "seed://parcels",
            provenance.external_id if provenance else parcel.parcel_number,
            provenance,
        ),
        **details,
        "insights": insights,
    }
