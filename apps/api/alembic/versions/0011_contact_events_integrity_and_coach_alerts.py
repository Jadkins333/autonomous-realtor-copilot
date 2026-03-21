"""harden contact events integrity and indexing

Revision ID: 0011_contact_events_integrity
Revises: 0010_merge_heads
Create Date: 2026-03-20 23:05:00
"""

from alembic import op


revision = "0011_contact_events_integrity"
down_revision = "0010_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("contact_events_contact_id_fkey", "contact_events", type_="foreignkey")
    op.drop_constraint("contact_events_deal_id_fkey", "contact_events", type_="foreignkey")
    op.drop_constraint("contact_events_tenant_id_fkey", "contact_events", type_="foreignkey")

    op.create_foreign_key(
        "fk_contact_events_contact_id_contacts",
        "contact_events",
        "contacts",
        ["contact_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_contact_events_deal_id_deals",
        "contact_events",
        "deals",
        ["deal_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_contact_events_tenant_id_tenants",
        "contact_events",
        "tenants",
        ["tenant_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_contact_events_contact_created_at",
        "contact_events",
        ["contact_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_contact_events_contact_created_at", table_name="contact_events")

    op.drop_constraint("fk_contact_events_tenant_id_tenants", "contact_events", type_="foreignkey")
    op.drop_constraint("fk_contact_events_deal_id_deals", "contact_events", type_="foreignkey")
    op.drop_constraint("fk_contact_events_contact_id_contacts", "contact_events", type_="foreignkey")

    op.create_foreign_key("contact_events_tenant_id_fkey", "contact_events", "tenants", ["tenant_id"], ["id"])
    op.create_foreign_key("contact_events_deal_id_fkey", "contact_events", "deals", ["deal_id"], ["id"])
    op.create_foreign_key("contact_events_contact_id_fkey", "contact_events", "contacts", ["contact_id"], ["id"])
