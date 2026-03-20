"""add audited outreach send attempts and richer consent evidence

Revision ID: 0005_outreach_audit_policy
Revises: 0004_draft_pack_truth
Create Date: 2026-03-19 15:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0005_outreach_audit_policy"
down_revision = "0004_draft_pack_truth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contacts", sa.Column("timezone", sa.String(length=64), nullable=True))

    op.add_column("consent_events", sa.Column("capture_method", sa.String(length=255), nullable=True))
    op.add_column("consent_events", sa.Column("policy_text_version", sa.String(length=128), nullable=True))
    op.add_column("consent_events", sa.Column("proof_artifact_ref", sa.String(length=1024), nullable=True))
    op.add_column(
        "consent_events",
        sa.Column(
            "jurisdiction_assumptions_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.add_column("consent_events", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("consent_events", sa.Column("revoked_reason", sa.String(length=255), nullable=True))
    op.alter_column("consent_events", "jurisdiction_assumptions_json", server_default=None)

    op.create_table(
        "outreach_send_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("sandbox", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("provider_selected", sa.String(length=255), nullable=True),
        sa.Column("provider_request_payload_hash", sa.String(length=64), nullable=True),
        sa.Column(
            "provider_response_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "normalized_result_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "policy_snapshot_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("final_status", sa.String(length=64), nullable=False),
        sa.Column("error_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_outreach_send_attempts_idempotency_key"),
    )
    op.alter_column("outreach_send_attempts", "sandbox", server_default=None)
    op.alter_column("outreach_send_attempts", "provider_response_json", server_default=None)
    op.alter_column("outreach_send_attempts", "normalized_result_json", server_default=None)
    op.alter_column("outreach_send_attempts", "policy_snapshot_json", server_default=None)

    op.create_table(
        "activity_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("entity_type", sa.String(length=128), nullable=False),
        sa.Column("entity_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column(
            "metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.alter_column("activity_events", "metadata_json", server_default=None)


def downgrade() -> None:
    op.drop_table("activity_events")
    op.drop_table("outreach_send_attempts")

    op.drop_column("consent_events", "revoked_reason")
    op.drop_column("consent_events", "revoked_at")
    op.drop_column("consent_events", "jurisdiction_assumptions_json")
    op.drop_column("consent_events", "proof_artifact_ref")
    op.drop_column("consent_events", "policy_text_version")
    op.drop_column("consent_events", "capture_method")

    op.drop_column("contacts", "timezone")
