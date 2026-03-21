"""merge disclosure and property source-origin heads

Revision ID: 0007_merge_disclosure_and_source_origin_heads
Revises: 0006_disclosure_framework, 0006_property_source_origin_policy
Create Date: 2026-03-19 16:25:00
"""

from alembic import op


revision = "0007_merge_heads"
down_revision = ("0006_disclosure_framework", "0006_property_origin")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
