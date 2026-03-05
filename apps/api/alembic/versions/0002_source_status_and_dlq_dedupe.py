"""add source status and dlq dedupe

Revision ID: 0002_src_status_dlq
Revises: 0001_initial
Create Date: 2026-03-05 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0002_src_status_dlq"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


source_mode_enum = postgresql.ENUM("live", "fixture", name="source_mode", create_type=False)
source_state_enum = postgresql.ENUM("ok", "partial", "failed", "paused", name="source_state", create_type=False)


def upgrade() -> None:
    source_mode_enum.create(op.get_bind(), checkfirst=True)
    source_state_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "source_status",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_name", sa.String(length=255), nullable=False),
        sa.Column("mode", source_mode_enum, nullable=False),
        sa.Column("state", source_state_enum, nullable=False),
        sa.Column("last_run_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("drift_detected", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("drift_reason", sa.String(length=512), nullable=True),
        sa.Column("dlq_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("paused_reason", sa.String(length=512), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_name", name="uq_source_status_source_name"),
    )

    op.add_column("schema_drift_dlq", sa.Column("external_id", sa.String(length=255), nullable=True))
    op.add_column(
        "schema_drift_dlq",
        sa.Column("event_type", sa.String(length=128), nullable=False, server_default="schema_validation_error"),
    )
    op.add_column(
        "schema_drift_dlq",
        sa.Column("payload_version", sa.String(length=64), nullable=False, server_default="v1"),
    )
    op.add_column("schema_drift_dlq", sa.Column("dedupe_key", sa.String(length=64), nullable=True))
    op.add_column(
        "schema_drift_dlq",
        sa.Column("replay_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("schema_drift_dlq", sa.Column("last_replayed_at", sa.DateTime(timezone=True), nullable=True))

    op.execute(
        """
        UPDATE schema_drift_dlq
        SET dedupe_key = md5(COALESCE(source_id::text, '') || COALESCE(raw_url, '') || COALESCE(error_text, ''))
        WHERE dedupe_key IS NULL
        """
    )

    op.alter_column("schema_drift_dlq", "dedupe_key", nullable=False)
    op.create_unique_constraint("uq_schema_drift_dlq_dedupe_key", "schema_drift_dlq", ["dedupe_key"])

    op.alter_column("source_status", "drift_detected", server_default=None)
    op.alter_column("source_status", "dlq_count", server_default=None)
    op.alter_column("schema_drift_dlq", "event_type", server_default=None)
    op.alter_column("schema_drift_dlq", "payload_version", server_default=None)
    op.alter_column("schema_drift_dlq", "replay_count", server_default=None)


def downgrade() -> None:
    op.drop_constraint("uq_schema_drift_dlq_dedupe_key", "schema_drift_dlq", type_="unique")
    op.drop_column("schema_drift_dlq", "last_replayed_at")
    op.drop_column("schema_drift_dlq", "replay_count")
    op.drop_column("schema_drift_dlq", "dedupe_key")
    op.drop_column("schema_drift_dlq", "payload_version")
    op.drop_column("schema_drift_dlq", "event_type")
    op.drop_column("schema_drift_dlq", "external_id")

    op.drop_table("source_status")
    source_state_enum.drop(op.get_bind(), checkfirst=True)
    source_mode_enum.drop(op.get_bind(), checkfirst=True)
