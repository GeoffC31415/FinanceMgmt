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


PROPERTY_TABLE_NAME = "properties"
MORTGAGE_TABLE_NAME = "mortgages"
PROPERTY_MORTGAGE_COLUMNS = {
    "mortgage_ltv": sa.Column("mortgage_ltv", sa.Float(), nullable=False, server_default="0"),
    "mortgage_rate": sa.Column("mortgage_rate", sa.Float(), nullable=False, server_default="0"),
    "mortgage_term_years": sa.Column("mortgage_term_years", sa.Integer(), nullable=False, server_default="0"),
}


def _table_names() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def _column_names(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns(table_name)}



def upgrade() -> None:
    """Upgrade schema."""
    table_names = _table_names()

    if PROPERTY_TABLE_NAME not in table_names:
        op.create_table(
            PROPERTY_TABLE_NAME,
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("scenario_id", sa.String(length=36), nullable=False),
            sa.Column("person_id", sa.String(length=36), nullable=True),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("value", sa.Float(), nullable=False, server_default="0"),
            sa.Column("appreciation_rate_mean", sa.Float(), nullable=False, server_default="0"),
            sa.Column("appreciation_rate_std", sa.Float(), nullable=False, server_default="0"),
            sa.Column("monthly_rental_income", sa.Float(), nullable=False, server_default="0"),
            sa.Column("rental_growth_rate", sa.Float(), nullable=False, server_default="0"),
            sa.Column("occupancy_rate", sa.Float(), nullable=False, server_default="1"),
            *PROPERTY_MORTGAGE_COLUMNS.values(),
            sa.Column("annual_maintenance_cost", sa.Float(), nullable=False, server_default="0"),
            sa.Column("maintenance_is_inflation_linked", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("withdrawal_priority", sa.Integer(), nullable=False, server_default="15"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["scenario_id"], ["scenarios.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
    else:
        existing_columns = _column_names(PROPERTY_TABLE_NAME)
        for column_name, column in PROPERTY_MORTGAGE_COLUMNS.items():
            if column_name not in existing_columns:
                op.add_column(PROPERTY_TABLE_NAME, column)

    if MORTGAGE_TABLE_NAME in _table_names():
        op.drop_table(MORTGAGE_TABLE_NAME)



def downgrade() -> None:
    """Downgrade schema."""
    table_names = _table_names()

    if MORTGAGE_TABLE_NAME not in table_names:
        op.create_table(
            MORTGAGE_TABLE_NAME,
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

    if PROPERTY_TABLE_NAME in table_names:
        property_columns = _column_names(PROPERTY_TABLE_NAME)
        non_mortgage_columns = property_columns.difference(PROPERTY_MORTGAGE_COLUMNS)
        if non_mortgage_columns:
            for column_name in reversed(tuple(PROPERTY_MORTGAGE_COLUMNS)):
                if column_name in property_columns:
                    op.drop_column(PROPERTY_TABLE_NAME, column_name)
        else:
            op.drop_table(PROPERTY_TABLE_NAME)
