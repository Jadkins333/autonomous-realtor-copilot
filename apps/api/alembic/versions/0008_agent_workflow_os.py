"""add agent workflow operating-system tables and crm memory fields

Revision ID: 0008_agent_workflow_os
Revises: 0007_merge_heads
Create Date: 2026-03-20 09:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0008_agent_workflow_os"
down_revision = "0007_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contacts", sa.Column("stage", sa.String(length=64), nullable=False, server_default="sphere"))
    op.add_column("contacts", sa.Column("lead_source", sa.String(length=128), nullable=True))
    op.add_column("contacts", sa.Column("household_name", sa.String(length=255), nullable=True))
    op.add_column("contacts", sa.Column("birthday", sa.Date(), nullable=True))
    op.add_column("contacts", sa.Column("home_anniversary", sa.Date(), nullable=True))
    op.add_column("contacts", sa.Column("referral_source", sa.String(length=255), nullable=True))
    op.add_column("contacts", sa.Column("preferred_channel", sa.String(length=32), nullable=True))
    op.add_column("contacts", sa.Column("client_summary", sa.Text(), nullable=True))
    op.add_column("contacts", sa.Column("assigned_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("contacts", sa.Column("last_contact_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("contacts", sa.Column("next_step_due_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("contacts", sa.Column("next_step_note", sa.Text(), nullable=True))
    op.add_column("contacts", sa.Column("priority", sa.String(length=32), nullable=False, server_default="normal"))
    op.create_foreign_key("fk_contacts_assigned_user", "contacts", "users", ["assigned_user_id"], ["id"])
    op.alter_column("contacts", "stage", server_default=None)
    op.alter_column("contacts", "priority", server_default=None)

    op.create_table(
        "deals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("deal_type", sa.String(length=64), nullable=False, server_default="seller"),
        sa.Column("stage", sa.String(length=64), nullable=False, server_default="new_lead"),
        sa.Column("priority", sa.String(length=32), nullable=False, server_default="normal"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("parcel_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("primary_agent_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("list_price", sa.Integer(), nullable=True),
        sa.Column("target_price", sa.Integer(), nullable=True),
        sa.Column("target_close_date", sa.Date(), nullable=True),
        sa.Column("next_milestone_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"]),
        sa.ForeignKeyConstraint(["parcel_id"], ["parcels.id"]),
        sa.ForeignKeyConstraint(["primary_agent_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.alter_column("deals", "deal_type", server_default=None)
    op.alter_column("deals", "stage", server_default=None)
    op.alter_column("deals", "priority", server_default=None)
    op.alter_column("deals", "status", server_default=None)

    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("priority", sa.String(length=32), nullable=False, server_default="normal"),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("parcel_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("deal_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("assigned_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["assigned_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"]),
        sa.ForeignKeyConstraint(["parcel_id"], ["parcels.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.alter_column("tasks", "status", server_default=None)
    op.alter_column("tasks", "priority", server_default=None)


def downgrade() -> None:
    op.drop_table("tasks")
    op.drop_table("deals")
    op.drop_constraint("fk_contacts_assigned_user", "contacts", type_="foreignkey")
    op.drop_column("contacts", "priority")
    op.drop_column("contacts", "next_step_note")
    op.drop_column("contacts", "next_step_due_at")
    op.drop_column("contacts", "last_contact_at")
    op.drop_column("contacts", "assigned_user_id")
    op.drop_column("contacts", "client_summary")
    op.drop_column("contacts", "preferred_channel")
    op.drop_column("contacts", "referral_source")
    op.drop_column("contacts", "home_anniversary")
    op.drop_column("contacts", "birthday")
    op.drop_column("contacts", "household_name")
    op.drop_column("contacts", "lead_source")
    op.drop_column("contacts", "stage")
