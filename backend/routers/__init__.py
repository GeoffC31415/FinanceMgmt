from fastapi import APIRouter

from backend.routers import config, simulation

__all__ = [
    "config",
    "simulation",
    "router",
]

router = APIRouter()
router.include_router(config.router, prefix="/config", tags=["config"])
router.include_router(simulation.router, prefix="/simulation", tags=["simulation"])

