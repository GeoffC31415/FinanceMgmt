from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from backend.database import build_async_engine, build_sessionmaker, init_db
from backend.routers import router as api_router
from backend.settings import get_settings
from backend.simulation.session_cache import create_session_cache
from backend.simulation.returns_cache import initialize_cache
from backend.simulation.bond_sweep import initialize_sweep_progress

logger = logging.getLogger(__name__)
SLOW_REQUEST_THRESHOLD = 1.0  # seconds
REQUEST_TIMEOUT = 3600  # seconds (1 hour for long-running requests like bond sweep)


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

    # Initialize persistent session cache (P0.1)
    cache_dir = settings.session_cache_dir if hasattr(settings, "session_cache_dir") else ".session_cache"
    session_cache = await create_session_cache(cache_dir=cache_dir, use_file_backed=True)
    app.state.session_cache = session_cache
    initialize_cache(session_cache)
    logger.info("Session cache initialized at %s", cache_dir)

    # Initialize persistent sweep progress store (P0.1)
    sweep_file = str(Path(cache_dir) / "sweep_progress.json")
    initialize_sweep_progress(sweep_file)
    logger.info("Sweep progress store initialized")

    try:
        await init_db(engine=engine)
        logger.info("Database initialized successfully")
        yield
    except Exception:
        logger.exception("Database initialization failed; aborting startup")
        raise
    finally:
        # Clean up session cache background tasks
        cache = getattr(app.state, "session_cache", None)
        if cache is not None:
            await cache.close()
        await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Finances Simulator",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_timeout(request: Request, call_next):
        """Cancel requests that exceed the timeout threshold.

        This is a safety net for long-running endpoints (e.g., bond sweep).
        Individual endpoints may implement their own timeout logic.
        """
        if REQUEST_TIMEOUT <= 0:
            return await call_next(request)

        async def _cancel_after_timeout():
            """Coroutine that raises TimeoutError after REQUEST_TIMEOUT seconds."""
            await asyncio.sleep(REQUEST_TIMEOUT)
            raise asyncio.TimeoutError(f"Request timed out after {REQUEST_TIMEOUT}s")

        # Run the request with a timeout
        try:
            timeout_task = asyncio.get_event_loop().create_task(_cancel_after_timeout())
            response = await asyncio.wait_for(call_next(request), timeout=REQUEST_TIMEOUT)
            timeout_task.cancel()
            return response
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=504,
                content={"detail": f"Request timed out after {REQUEST_TIMEOUT}s"},
            )

    @app.middleware("http")
    async def log_slow_requests(request: Request, call_next):
        """Log requests that take longer than the threshold."""
        start = time.perf_counter()
        response = await call_next(request)
        elapsed = time.perf_counter() - start
        if elapsed > SLOW_REQUEST_THRESHOLD:
            logger.warning(
                "Slow request: %s %s took %.2fs",
                request.method,
                request.url.path,
                elapsed,
            )
        return response

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

