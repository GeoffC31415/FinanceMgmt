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

