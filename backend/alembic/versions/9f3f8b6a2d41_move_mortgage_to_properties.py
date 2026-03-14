"""move mortgage to properties

Revision ID: 9f3f8b6a2d41
Revises: 62e8a9e7caec
Create Date: 2026-03-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9f3f8b6a2d41"
down_revision: Union[str, Sequence[str], None] = "62e8a9e7caec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "properties",
        sa.Column("mortgage_ltv", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "properties",
        sa.Column("mortgage_rate", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "properties",
        sa.Column("mortgage_term_years", sa.Integer(), nullable=False, server_default="0"),
    )
    op.drop_table("mortgages")


def downgrade() -> None:
    """Downgrade schema."""
    op.create_table(
        "mortgages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("scenario_id", sa.String(length=36), nullable=False),
        sa.Column("balance", sa.Float(), nullable=False),
        sa.Column("annual_interest_rate", sa.Float(), nullable=False),
        sa.Column("monthly_payment", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["scenario_id"], ["scenarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scenario_id"),
    )
    op.drop_column("properties", "mortgage_term_years")
    op.drop_column("properties", "mortgage_rate")
    op.drop_column("properties", "mortgage_ltv")
