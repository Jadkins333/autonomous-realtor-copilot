"""merge tenant slug and contact events migration heads

Revision ID: 0010_merge_heads
Revises: 0005_add_tenant_slug, 0009_contact_events_timeline
Create Date: 2026-03-20 16:35:00
"""

revision = "0010_merge_heads"
down_revision = ("0005_add_tenant_slug", "0009_contact_events_timeline")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
