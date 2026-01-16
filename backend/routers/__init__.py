from fastapi import APIRouter

from backend.routers import config, simulation

router = APIRouter()
router.include_router(config.router, prefix="/config", tags=["config"])
router.include_router(simulation.router, prefix="/simulation", tags=["simulation"])

