from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from backend.models.base import Base


def build_async_engine(*, sqlite_path: str) -> AsyncEngine:
    return create_async_engine(
        f"sqlite+aiosqlite:///{sqlite_path}",
        echo=False,
        future=True,
    )


def build_sessionmaker(*, engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def init_db(*, engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def provide_session(*, sessionmaker: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    async with sessionmaker() as session:
        yield session

