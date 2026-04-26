from fastapi import APIRouter

from backend.routers import admin, config, simulation

__all__ = [
    "admin",
    "config",
    "simulation",
    "router",
]

router = APIRouter()
router.include_router(config.router, prefix="/config", tags=["config"])
router.include_router(simulation.router, prefix="/simulation", tags=["simulation"])
router.include_router(admin.router, prefix="/admin", tags=["admin"])

