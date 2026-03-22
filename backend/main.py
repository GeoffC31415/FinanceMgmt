from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from backend.database import build_async_engine, build_sessionmaker, init_db
from backend.routers import router as api_router
from backend.settings import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    engine: AsyncEngine = build_async_engine(sqlite_path=settings.sqlite_path)
    sessionmaker: async_sessionmaker[AsyncSession] = build_sessionmaker(engine=engine)

    # Important: import models so SQLAlchemy registers all tables before create_all.
    import backend.models  # noqa: F401

    # Setup logging
    import logging
    logger = logging.getLogger(__name__)

    app.state.engine = engine
    app.state.sessionmaker = sessionmaker

    try:
        await init_db(engine=engine)
        logger.info("Database initialized successfully")
        yield
    except Exception:
        logger.exception("Database initialization failed; aborting startup")
        raise
    finally:
        await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(title="Finances Simulator", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready")
    async def ready(request: Request) -> JSONResponse:
        engine = getattr(request.app.state, "engine", None)
        if engine is None:
            return JSONResponse(
                status_code=503,
                content={"status": "error", "database": "not_initialized"},
            )

        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception:
            return JSONResponse(
                status_code=503,
                content={"status": "error", "database": "unavailable"},
            )

        return JSONResponse(content={"status": "ok", "database": "ok"})

    app.include_router(api_router, prefix="/api")
    return app


app = create_app()

