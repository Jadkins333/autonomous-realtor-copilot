"""add tenant slug

Revision ID: 0005_add_tenant_slug
Revises: 0004_draft_packs_negotiation_truth
Create Date: 2026-03-06 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_add_tenant_slug"
down_revision = "0004_draft_pack_truth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("slug", sa.String(length=128), nullable=True))

    op.execute(
        """
        UPDATE tenants
        SET slug = CASE
            WHEN name = 'Demo Realty Columbus' THEN 'demo-realty'
            ELSE 'tenant-' || substr(replace(id::text, '-', ''), 1, 8)
        END
        WHERE slug IS NULL
        """
    )

    op.alter_column("tenants", "slug", existing_type=sa.String(length=128), nullable=False)
    op.create_unique_constraint("uq_tenants_slug", "tenants", ["slug"])


def downgrade() -> None:
    op.drop_constraint("uq_tenants_slug", "tenants", type_="unique")
    op.drop_column("tenants", "slug")
