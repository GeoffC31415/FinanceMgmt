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
    await _migrate_people_table(conn=conn)


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


async def _migrate_people_table(*, conn: AsyncConnection) -> None:
    """
    Add child-related columns to people table and make retirement fields nullable:
    - is_child: boolean flag
    - annual_cost: annual cost for children
    - leaves_household_age: age when child leaves household
    - planned_retirement_age: now nullable (for children)
    - state_pension_age: now nullable (for children)
    
    SQLite doesn't support ALTER COLUMN, so we recreate the table.
    """
    columns = await _get_table_columns(conn=conn, table_name="people")

    # Check if migration is needed by testing if planned_retirement_age is nullable
    # We do this by checking if we can insert a NULL value (via a temp check)
    needs_migration = False
    
    if "is_child" not in columns:
        needs_migration = True
    else:
        # Check if planned_retirement_age is nullable by querying table info
        result = await conn.execute(text("PRAGMA table_info(people)"))
        rows = result.fetchall()
        for row in rows:
            # PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
            col_name = str(row[1])
            not_null = int(row[3])
            if col_name == "planned_retirement_age" and not_null == 1:
                needs_migration = True
                break

    if needs_migration:
        # Create new table with updated schema
        await conn.execute(text("""
            CREATE TABLE people_new (
                id VARCHAR(36) NOT NULL PRIMARY KEY,
                scenario_id VARCHAR(36) NOT NULL,
                label VARCHAR(100) NOT NULL,
                birth_date DATE NOT NULL,
                planned_retirement_age INTEGER,
                state_pension_age INTEGER DEFAULT 67,
                is_child BOOLEAN NOT NULL DEFAULT 0,
                annual_cost FLOAT,
                leaves_household_age INTEGER DEFAULT 18,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
            )
        """))
        
        # Copy existing data (all existing people are adults)
        await conn.execute(text("""
            INSERT INTO people_new (id, scenario_id, label, birth_date, planned_retirement_age, state_pension_age, is_child, annual_cost, leaves_household_age, created_at, updated_at)
            SELECT id, scenario_id, label, birth_date, planned_retirement_age, state_pension_age, 0, NULL, 18, created_at, updated_at
            FROM people
        """))
        
        # Drop old table
        await conn.execute(text("DROP TABLE people"))
        
        # Rename new table
        await conn.execute(text("ALTER TABLE people_new RENAME TO people"))
        
        await conn.commit()

