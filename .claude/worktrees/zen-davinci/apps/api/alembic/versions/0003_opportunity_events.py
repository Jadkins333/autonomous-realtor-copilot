"""add opportunity events

Revision ID: 0003_opportunity_events
Revises: 0002_src_status_dlq
Create Date: 2026-03-05 00:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_opportunity_events"
down_revision = "0002_src_status_dlq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "opportunity_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parcel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("details_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("dedupe_key", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["parcel_id"], ["parcels.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedupe_key", name="uq_opportunity_events_dedupe_key"),
    )
    op.create_index("ix_opportunity_events_tenant_created", "opportunity_events", ["tenant_id", "created_at"])
    op.create_index("ix_opportunity_events_parcel", "opportunity_events", ["parcel_id"])


def downgrade() -> None:
    op.drop_index("ix_opportunity_events_parcel", table_name="opportunity_events")
    op.drop_index("ix_opportunity_events_tenant_created", table_name="opportunity_events")
    op.drop_table("opportunity_events")
