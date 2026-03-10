"""add truthful voice lifecycle statuses

Revision ID: 0006_voice_statuses_twilio_voice
Revises: 0005_add_tenant_slug
Create Date: 2026-03-10 18:30:00
"""

from alembic import op


revision = "0006_voice_statuses_twilio_voice"
down_revision = "0005_add_tenant_slug"
branch_labels = None
depends_on = None


VOICE_STATUS_VALUES = (
    "initiated",
    "ringing",
    "in_progress",
    "completed",
    "no_answer",
    "busy",
    "canceled",
)


def upgrade() -> None:
    for value in VOICE_STATUS_VALUES:
        op.execute(f"ALTER TYPE message_status ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    # PostgreSQL enums cannot drop values safely without rebuilding the type.
    pass
