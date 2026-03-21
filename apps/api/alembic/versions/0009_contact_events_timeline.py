"""add contact events for crm timeline and re-engagement workflow

Revision ID: 0009_contact_events_timeline
Revises: 0008_agent_workflow_os
Create Date: 2026-03-20 12:05:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0009_contact_events_timeline"
down_revision = "0008_agent_workflow_os"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contact_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("deal_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"]),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contact_events_tenant_contact_created_at", "contact_events", ["tenant_id", "contact_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_contact_events_tenant_contact_created_at", table_name="contact_events")
    op.drop_table("contact_events")
