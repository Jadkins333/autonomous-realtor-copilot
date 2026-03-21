"""add disclosure framework and immutable acknowledgements

Revision ID: 0006_disclosure_framework
Revises: 0005_outreach_audit_policy
Create Date: 2026-03-19 20:10:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0006_disclosure_framework"
down_revision = "0005_outreach_audit_policy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "disclosure_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("jurisdiction", sa.String(length=16), nullable=False),
        sa.Column("disclosure_type", sa.String(length=128), nullable=False),
        sa.Column("acknowledgement_mode", sa.String(length=64), nullable=False),
        sa.Column(
            "record_retention_metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "key", name="uq_disclosure_definitions_tenant_key"),
    )
    op.alter_column("disclosure_definitions", "record_retention_metadata_json", server_default=None)

    op.create_table(
        "disclosure_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("disclosure_definition_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body_markdown", sa.Text(), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("typed_ack_text", sa.String(length=255), nullable=True),
        sa.Column(
            "metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "record_retention_metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["disclosure_definition_id"], ["disclosure_definitions.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "disclosure_definition_id",
            "version",
            name="uq_disclosure_versions_definition_version",
        ),
    )
    op.alter_column("disclosure_versions", "metadata_json", server_default=None)
    op.alter_column("disclosure_versions", "record_retention_metadata_json", server_default=None)

    op.create_table(
        "disclosure_gates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("disclosure_definition_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("gate_key", sa.String(length=128), nullable=False),
        sa.Column("jurisdiction", sa.String(length=16), nullable=False),
        sa.Column("trigger_event", sa.String(length=128), nullable=False),
        sa.Column("required_before_action", sa.String(length=128), nullable=False),
        sa.Column("scope_entity_type", sa.String(length=64), nullable=False),
        sa.Column(
            "conditions_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["disclosure_definition_id"], ["disclosure_definitions.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "gate_key", name="uq_disclosure_gates_tenant_gate_key"),
    )
    op.alter_column("disclosure_gates", "conditions_json", server_default=None)
    op.alter_column("disclosure_gates", "is_active", server_default=None)

    op.create_table(
        "disclosure_acknowledgements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("client_id", sa.String(length=255), nullable=True),
        sa.Column("parcel_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("listing_id", sa.String(length=255), nullable=True),
        sa.Column("disclosure_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workflow_action", sa.String(length=128), nullable=False),
        sa.Column("acknowledgement_mode", sa.String(length=64), nullable=False),
        sa.Column(
            "acknowledgement_artifact_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "signature_payload_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "device_metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "actor_source_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "record_retention_metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"]),
        sa.ForeignKeyConstraint(["disclosure_version_id"], ["disclosure_versions.id"]),
        sa.ForeignKeyConstraint(["parcel_id"], ["parcels.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.alter_column("disclosure_acknowledgements", "acknowledgement_artifact_json", server_default=None)
    op.alter_column("disclosure_acknowledgements", "signature_payload_json", server_default=None)
    op.alter_column("disclosure_acknowledgements", "device_metadata_json", server_default=None)
    op.alter_column("disclosure_acknowledgements", "actor_source_json", server_default=None)
    op.alter_column("disclosure_acknowledgements", "record_retention_metadata_json", server_default=None)


def downgrade() -> None:
    op.drop_table("disclosure_acknowledgements")
    op.drop_table("disclosure_gates")
    op.drop_table("disclosure_versions")
    op.drop_table("disclosure_definitions")
