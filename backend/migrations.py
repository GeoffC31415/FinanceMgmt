from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


async def run_migrations(*, conn: AsyncConnection) -> None:
    """
    Lightweight SQLite migrations.

    This repo currently uses `Base.metadata.create_all()` and no Alembic. To keep
    existing `finances.db` usable, we apply additive migrations here.
    """
    await _migrate_assets_table(conn=conn)
    await _migrate_mortgages_table(conn=conn)


async def _get_table_columns(*, conn: AsyncConnection, table_name: str) -> set[str]:
    result = await conn.execute(text(f"PRAGMA table_info({table_name})"))
    rows: Sequence[tuple] = result.fetchall()
    # PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
    return {str(row[1]) for row in rows}


async def _migrate_assets_table(*, conn: AsyncConnection) -> None:
    columns = await _get_table_columns(conn=conn, table_name="assets")

    if "asset_type" not in columns:
        await conn.execute(text("ALTER TABLE assets ADD COLUMN asset_type VARCHAR(20) NOT NULL DEFAULT 'GIA'"))

    if "withdrawal_priority" not in columns:
        await conn.execute(text("ALTER TABLE assets ADD COLUMN withdrawal_priority INTEGER NOT NULL DEFAULT 100"))


async def _migrate_mortgages_table(*, conn: AsyncConnection) -> None:
    """
    Remove months_remaining column from mortgages table.
    
    SQLite doesn't support DROP COLUMN directly, so we recreate the table.
    This is safe because mortgages table has no foreign key dependencies pointing to it.
    """
    columns = await _get_table_columns(conn=conn, table_name="mortgages")
    
    if "months_remaining" not in columns:
        # Column already removed or doesn't exist
        return
    
    # SQLite doesn't support DROP COLUMN, so we need to recreate the table
    # Step 1: Create new table without months_remaining
    await conn.execute(text("""
        CREATE TABLE mortgages_new (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            scenario_id VARCHAR(36) NOT NULL UNIQUE,
            balance FLOAT NOT NULL DEFAULT 0.0,
            annual_interest_rate FLOAT NOT NULL DEFAULT 0.0,
            monthly_payment FLOAT NOT NULL DEFAULT 0.0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
        )
    """))
    
    # Step 2: Copy data (excluding months_remaining)
    await conn.execute(text("""
        INSERT INTO mortgages_new (id, scenario_id, balance, annual_interest_rate, monthly_payment, created_at, updated_at)
        SELECT id, scenario_id, balance, annual_interest_rate, monthly_payment, created_at, updated_at
        FROM mortgages
    """))
    
    # Step 3: Drop old table
    await conn.execute(text("DROP TABLE mortgages"))
    
    # Step 4: Rename new table
    await conn.execute(text("ALTER TABLE mortgages_new RENAME TO mortgages"))
    
    await conn.commit()

