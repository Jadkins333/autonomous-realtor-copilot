"""add property source-origin classification and vow access scaffolding

Revision ID: 0006_property_source_origin_policy
Revises: 0005_outreach_audit_policy
Create Date: 2026-03-19 17:10:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import ProgrammingError


revision = "0006_property_origin"
down_revision = "0005_outreach_audit_policy"
branch_labels = None
depends_on = None


source_origin = sa.Enum(
    "public_record",
    "broker_owned",
    "idx",
    "vow",
    "licensed_feed_other",
    "unknown_restricted",
    name="source_origin",
)

vow_verification_state = sa.Enum(
    "not_started",
    "pending",
    "verified",
    "rejected",
    name="vow_verification_state",
)


def upgrade() -> None:
    bind = op.get_bind()
    source_origin.create(bind, checkfirst=True)

    op.add_column(
        "parcels",
        sa.Column(
            "source_origin",
            source_origin,
            nullable=False,
            server_default="public_record",
        ),
    )
    op.add_column(
        "parcels",
        sa.Column(
            "source_origin_details_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.alter_column("parcels", "source_origin", server_default=None)
    op.alter_column("parcels", "source_origin_details_json", server_default=None)

    op.execute(
        """
        UPDATE parcels
        SET source_origin_details_json = jsonb_build_object(
            'field_origin_mode', 'record_level',
            'rules_configured', true
        )
        WHERE source_origin_details_json = '{}'::jsonb
        """
    )

    op.create_table(
        "vow_access_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("market", sa.String(length=128), nullable=False),
        sa.Column("source_name", sa.String(length=255), nullable=False),
        sa.Column("registrant_name", sa.String(length=255), nullable=True),
        sa.Column("registrant_email", sa.String(length=255), nullable=True),
        sa.Column("valid_email", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("terms_of_use_acknowledged", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("verification_state", vow_verification_state, nullable=False, server_default="not_started"),
        sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "acceptance_record_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "user_id",
            "market",
            "source_name",
            name="uq_vow_access_profiles_scope",
        ),
    )
    op.alter_column("vow_access_profiles", "valid_email", server_default=None)
    op.alter_column("vow_access_profiles", "terms_of_use_acknowledged", server_default=None)
    op.alter_column("vow_access_profiles", "verification_state", server_default=None)
    op.alter_column("vow_access_profiles", "acceptance_record_json", server_default=None)


def downgrade() -> None:
    op.drop_table("vow_access_profiles")
    op.drop_column("parcels", "source_origin_details_json")
    op.drop_column("parcels", "source_origin")
    bind = op.get_bind()
    vow_verification_state.drop(bind, checkfirst=True)
    source_origin.drop(bind, checkfirst=True)
