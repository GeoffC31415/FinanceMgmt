from __future__ import annotations

import sqlite3

import pytest

from backend.database import build_async_engine, init_db


@pytest.mark.asyncio
async def test_init_db_applies_latest_schema_to_fresh_sqlite(tmp_path):
    import backend.models  # noqa: F401

    db_path = tmp_path / "fresh.db"
    engine = build_async_engine(sqlite_path=str(db_path))

    try:
        await init_db(engine=engine)
    finally:
        await engine.dispose()

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()

        cur.execute("SELECT version_num FROM alembic_version")
        assert cur.fetchone() == ("9f3f8b6a2d41",)

        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='properties'")
        assert cur.fetchone() == ("properties",)

        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='mortgages'")
        assert cur.fetchone() is None

        cur.execute("PRAGMA table_info(properties)")
        property_columns = {row[1] for row in cur.fetchall()}
        assert {"mortgage_ltv", "mortgage_rate", "mortgage_term_years"}.issubset(property_columns)

        cur.execute("PRAGMA table_info(assets)")
        asset_columns = {row[1] for row in cur.fetchall()}
        assert "bond_allocation" in asset_columns
    finally:
        conn.close()
