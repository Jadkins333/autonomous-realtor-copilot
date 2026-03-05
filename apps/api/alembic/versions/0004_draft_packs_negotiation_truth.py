"""add draft packs, opportunity state, and metric required inputs

Revision ID: 0004_draft_pack_truth
Revises: 0003_opportunity_events
Create Date: 2026-03-05 02:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0004_draft_pack_truth"
down_revision = "0003_opportunity_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "metric_definitions",
        sa.Column("required_inputs_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
    )
    op.alter_column("metric_definitions", "required_inputs_json", server_default=None)

    op.create_table(
        "outreach_draft_packs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parcel_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("sandbox", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("objective", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["parcel_id"], ["parcels.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.alter_column("outreach_draft_packs", "sandbox", server_default=None)

    op.add_column("messages", sa.Column("pack_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_messages_pack_id", "messages", "outreach_draft_packs", ["pack_id"], ["id"])
    op.create_index("ix_messages_pack_id", "messages", ["pack_id"])

    op.create_table(
        "opportunity_states",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parcel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["parcel_id"], ["parcels.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "parcel_id", name="uq_opportunity_states_tenant_parcel"),
    )


def downgrade() -> None:
    op.drop_table("opportunity_states")

    op.drop_index("ix_messages_pack_id", table_name="messages")
    op.drop_constraint("fk_messages_pack_id", "messages", type_="foreignkey")
    op.drop_column("messages", "pack_id")

    op.drop_table("outreach_draft_packs")

    op.drop_column("metric_definitions", "required_inputs_json")
