from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from backend.models.base import Base

logger = logging.getLogger(__name__)


def build_async_engine(*, sqlite_path: str) -> AsyncEngine:
    return create_async_engine(
        f"sqlite+aiosqlite:///{sqlite_path}",
        echo=False,
        future=True,
    )


def build_sessionmaker(*, engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


def _run_alembic_upgrade(*, sqlite_path: str) -> None:
    """Run Alembic migrations synchronously at startup."""
    from alembic.config import Config
    from alembic import command
    import os

    alembic_ini = Path(__file__).parent / "alembic.ini"
    if not alembic_ini.exists():
        logger.warning("alembic.ini not found at %s, skipping migrations", alembic_ini)
        return

    alembic_cfg = Config(str(alembic_ini))
    # Override the SQLite URL to match the running app's database
    alembic_cfg.set_main_option("sqlalchemy.url", f"sqlite:///{sqlite_path}")

    try:
        command.upgrade(alembic_cfg, "head")
        logger.info("Alembic migrations applied successfully")
    except Exception as exc:
        logger.warning("Alembic migration failed (falling back to create_all): %s", exc)


async def init_db(*, engine: AsyncEngine) -> None:
    """Initialize database: run Alembic migrations, then create any new tables."""
    # Extract the SQLite path from the engine URL
    url_str = str(engine.url)
    # URL is like "sqlite+aiosqlite:///path/to/db" — extract the path
    if ":///" in url_str:
        sqlite_path = url_str.split(":///", 1)[1]
    else:
        sqlite_path = "finances.db"

    # Try Alembic migrations first (handles schema evolution)
    try:
        _run_alembic_upgrade(sqlite_path=sqlite_path)
    except Exception as exc:
        logger.warning("Alembic not available, using create_all: %s", exc)

    # Fallback: create any tables that don't exist yet
    # (safe to call even after Alembic — it's a no-op for existing tables)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def provide_session(*, sessionmaker: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    async with sessionmaker() as session:
        yield session
