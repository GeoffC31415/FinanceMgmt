"""Tests for bond sweep cancellation and progress tracking.

Covers:
- BondSweepService.run_async (async sweep with cancellation support)
- BondSweepService.cancel (cancel endpoint)
- BondSweepService.progress (progress polling)
- BondSweepService.run (synchronous path for backwards compat)
- Router-level bond sweep, progress, and cancel endpoints
"""
from __future__ import annotations

import asyncio
import time

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from backend.main import create_app
from backend.models.base import Base


@pytest_asyncio.fixture
async def app():
    """Create an app instance with a fresh in-memory database."""
    application = create_app()

    engine: AsyncEngine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", echo=False, future=True
    )
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    import backend.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    application.state.engine = engine
    application.state.sessionmaker = sessionmaker

    yield application

    await engine.dispose()


@pytest_asyncio.fixture
async def client(app):
    """Async HTTP client for the test app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


def _scenario_payload_with_bootstrap(name: str = "Test Scenario") -> dict:
    """Create a scenario payload with historical_bootstrap return model."""
    return {
        "name": name,
        "assumptions": {
            "inflation_rate": 0.02,
            "start_year": 2024,
            "end_year": 2030,
            "return_model": "historical_bootstrap",
        },
        "people": [
            {
                "label": "Alice",
                "birth_date": "1990-01-15",
                "planned_retirement_age": 65,
                "state_pension_age": 67,
            }
        ],
        "incomes": [
            {
                "kind": "salary",
                "gross_annual": 50000.0,
                "annual_growth_rate": 0.02,
                "employee_pension_pct": 0.05,
                "employer_pension_pct": 0.03,
            }
        ],
        "assets": [
            {
                "name": "ISA",
                "balance": 10000.0,
                "annual_contribution": 5000.0,
                "growth_rate_mean": 0.05,
                "growth_rate_std": 0.10,
                "contributions_end_at_retirement": False,
                "asset_type": "ISA",
                "withdrawal_priority": 50,
            },
            {
                "name": "GIA",
                "balance": 50000.0,
                "annual_contribution": 0.0,
                "growth_rate_mean": 0.06,
                "growth_rate_std": 0.15,
                "contributions_end_at_retirement": False,
                "asset_type": "GIA",
                "withdrawal_priority": 40,
            },
            {
                "name": "Pension",
                "balance": 100000.0,
                "annual_contribution": 0.0,
                "growth_rate_mean": 0.05,
                "growth_rate_std": 0.10,
                "contributions_end_at_retirement": False,
                "asset_type": "PENSION",
                "withdrawal_priority": 100,
            },
        ],
        "properties": [],
        "expenses": [],
    }


# ──────────────────────── BondSweepService.sync ────────────────────────


class TestBondSweepServiceSync:
    """Test the synchronous BondSweepService.run path."""

    @pytest.mark.asyncio
    async def test_run_returns_response(self, client: AsyncClient):
        """BondSweepService.run returns a valid BondSweepResponse."""
        # Create scenario and init simulation
        create_resp = await client.post("/api/config/scenarios", json=_scenario_payload_with_bootstrap())
        scenario_id = create_resp.json()["id"]

        init_resp = await client.post("/api/simulation/init", json={
            "scenario_id": scenario_id,
            "iterations": 20,
            "seed": 42,
        })
        assert init_resp.status_code == 200
        session_id = init_resp.json()["session_id"]

        from backend.simulation.bond_sweep import BondSweepService
        from backend.schemas.simulation import BondSweepRequest

        payload = BondSweepRequest(
            session_id=session_id,
            retirement_age_offset=0,
            risk_threshold=5.0,
            max_spend=100000.0,
            max_combos=20,
        )
        response = BondSweepService.run(payload)

        assert response.optimal is not None
        assert response.asset_classes == ["ISA", "GIA", "PENSION"]
        assert response.total_combos_tested > 0
        assert len(response.top_combos) > 0


# ──────────────────────── BondSweepService.async ────────────────────────


class TestBondSweepServiceAsync:
    """Test the async BondSweepService.run_async path."""

    @pytest.mark.asyncio
    async def test_run_async_returns_response(self, client: AsyncClient):
        """BondSweepService.run_async returns a valid response."""
        create_resp = await client.post("/api/config/scenarios", json=_scenario_payload_with_bootstrap())
        scenario_id = create_resp.json()["id"]

        init_resp = await client.post("/api/simulation/init", json={
            "scenario_id": scenario_id,
            "iterations": 20,
            "seed": 42,
        })
        session_id = init_resp.json()["session_id"]

        from backend.simulation.bond_sweep import BondSweepService
        from backend.schemas.simulation import BondSweepRequest

        payload = BondSweepRequest(
            session_id=session_id,
            retirement_age_offset=0,
            risk_threshold=5.0,
            max_spend=100000.0,
            max_combos=20,
        )
        response = await BondSweepService.run_async(payload)

        assert response.optimal is not None
        assert response.total_combos_tested > 0

    @pytest.mark.asyncio
    async def test_progress_tracking(self, client: AsyncClient):
        """Progress is updated during the sweep."""
        create_resp = await client.post("/api/config/scenarios", json=_scenario_payload_with_bootstrap())
        scenario_id = create_resp.json()["id"]

        init_resp = await client.post("/api/simulation/init", json={
            "scenario_id": scenario_id,
            "iterations": 20,
            "seed": 42,
        })
        session_id = init_resp.json()["session_id"]

        from backend.simulation.bond_sweep import BondSweepService, _SWEEP_PROGRESS
        from backend.schemas.simulation import BondSweepRequest

        payload = BondSweepRequest(
            session_id=session_id,
            retirement_age_offset=0,
            risk_threshold=5.0,
            max_spend=100000.0,
            max_combos=20,
        )

        # Start the sweep in a task
        sweep_task = asyncio.create_task(BondSweepService.run_async(payload))

        # Give it a moment to initialize progress
        await asyncio.sleep(0.05)

        # Progress should be initialized even if sweep finishes fast
        progress = await BondSweepService.progress(session_id)
        assert "completed" in progress
        assert "total" in progress
        assert "phase" in progress
        assert "running" in progress

        # Wait for sweep to finish
        await sweep_task

        # After completion, progress should show completed
        progress = await BondSweepService.progress(session_id)
        assert progress["running"] is False


# ──────────────────────── Cancel ────────────────────────


class TestBondSweepCancel:
    """Test bond sweep cancellation."""

    @pytest.mark.asyncio
    async def test_cancel_marks_sweep_as_cancelled(self):
        """Calling cancel marks the sweep as cancelled."""
        from backend.simulation.bond_sweep import BondSweepService, _SWEEP_PROGRESS, _SWEEP_TASKS

        # Simulate a running sweep
        session_id = "test-cancel-session"
        _SWEEP_PROGRESS[session_id] = {
            "completed": 10,
            "total": 100,
            "phase": "Coarse scan (25% steps)",
        }
        # No actual task to cancel, but the flag should be set
        result = await BondSweepService.cancel(session_id)

        assert result["status"] == "cancelled"
        assert result["session_id"] == session_id
        # The cancelled flag should be set
        assert _SWEEP_PROGRESS[session_id].get("cancelled") is True

    @pytest.mark.asyncio
    async def test_cancel_nonexistent_session(self):
        """Cancelling a non-existent session is safe."""
        from backend.simulation.bond_sweep import BondSweepService

        result = await BondSweepService.cancel("nonexistent-session-id")
        assert result["status"] == "cancelled"
        assert result["session_id"] == "nonexistent-session-id"


# ──────────────────────── Router endpoints ────────────────────────


class TestBondSweepRouter:
    """Test bond sweep router endpoints."""

    @pytest.mark.asyncio
    async def test_progress_endpoint(self, client: AsyncClient):
        """GET /bond-sweep/progress returns progress data."""
        progress = await client.get("/api/simulation/bond-sweep/progress", params={
            "session_id": "nonexistent",
        })
        assert progress.status_code == 200
        data = progress.json()
        assert data["running"] is False
        assert data["completed"] == 0
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_cancel_endpoint(self, client: AsyncClient):
        """POST /bond-sweep/cancel returns success."""
        result = await client.post("/api/simulation/bond-sweep/cancel", params={
            "session_id": "test-session-id",
        })
        assert result.status_code == 200
        data = result.json()
        assert data["status"] == "cancelled"
        assert data["session_id"] == "test-session-id"

    @pytest.mark.asyncio
    async def test_bond_sweep_endpoint(self, client: AsyncClient):
        """POST /bond-sweep runs and returns results."""
        create_resp = await client.post("/api/config/scenarios", json=_scenario_payload_with_bootstrap())
        scenario_id = create_resp.json()["id"]

        init_resp = await client.post("/api/simulation/init", json={
            "scenario_id": scenario_id,
            "iterations": 20,
            "seed": 42,
        })
        session_id = init_resp.json()["session_id"]

        sweep_resp = await client.post("/api/simulation/bond-sweep", json={
            "session_id": session_id,
            "retirement_age_offset": 0,
            "risk_threshold": 5.0,
            "max_spend": 100000.0,
            "max_combos": 20,
        })
        assert sweep_resp.status_code == 200
        data = sweep_resp.json()
        assert "optimal" in data
        assert "top_combos" in data
        assert "marginals" in data
        assert "asset_classes" in data
        assert data["total_combos_tested"] > 0

    @pytest.mark.asyncio
    async def test_bond_sweep_requires_bootstrap(self, client: AsyncClient):
        """Bond sweep returns 400 for parametric return model."""
        create_resp = await client.post("/api/config/scenarios", json=_minimal_scenario_payload())
        scenario_id = create_resp.json()["id"]

        init_resp = await client.post("/api/simulation/init", json={
            "scenario_id": scenario_id,
            "iterations": 20,
            "seed": 42,
        })
        session_id = init_resp.json()["session_id"]

        sweep_resp = await client.post("/api/simulation/bond-sweep", json={
            "session_id": session_id,
            "retirement_age_offset": 0,
            "risk_threshold": 5.0,
            "max_spend": 100000.0,
        })
        # The parametric model should fail
        assert sweep_resp.status_code == 400

    @pytest.mark.asyncio
    async def test_bond_sweep_expired_session(self, client: AsyncClient):
        """Bond sweep returns 404 for expired session."""
        sweep_resp = await client.post("/api/simulation/bond-sweep", json={
            "session_id": "expired-session-id",
            "retirement_age_offset": 0,
            "risk_threshold": 5.0,
            "max_spend": 100000.0,
        })
        assert sweep_resp.status_code == 404


# ──────────────────────── Timeout middleware ────────────────────────


class TestTimeoutMiddleware:
    """Test the request timeout middleware."""

    @pytest.mark.asyncio
    async def test_timeout_configured(self):
        """REQUEST_TIMEOUT is set to a reasonable default."""
        from backend.main import REQUEST_TIMEOUT
        assert REQUEST_TIMEOUT == 3600  # 1 hour

    @pytest.mark.asyncio
    async def test_normal_request_completes(self, client: AsyncClient):
        """Normal requests complete within timeout."""
        create_resp = await client.post("/api/config/scenarios", json=_minimal_scenario_payload())
        scenario_id = create_resp.json()["id"]

        init_resp = await client.post("/api/simulation/init", json={
            "scenario_id": scenario_id,
            "iterations": 20,
            "seed": 42,
        })
        assert init_resp.status_code == 200


# ──────────────────────── Helpers ────────────────────────


def _minimal_scenario_payload(name: str = "Test Scenario") -> dict:
    """Minimal scenario for non-bond-sweep tests."""
    return {
        "name": name,
        "assumptions": {"inflation_rate": 0.02, "start_year": 2024, "end_year": 2030},
        "people": [
            {
                "label": "Alice",
                "birth_date": "1990-01-15",
                "planned_retirement_age": 65,
                "state_pension_age": 67,
            }
        ],
        "incomes": [
            {
                "kind": "salary",
                "gross_annual": 50000.0,
                "annual_growth_rate": 0.02,
                "employee_pension_pct": 0.05,
                "employer_pension_pct": 0.03,
            }
        ],
        "assets": [
            {
                "name": "ISA",
                "balance": 10000.0,
                "annual_contribution": 5000.0,
                "growth_rate_mean": 0.05,
                "growth_rate_std": 0.10,
                "contributions_end_at_retirement": False,
                "asset_type": "ISA",
                "withdrawal_priority": 50,
            },
            {
                "name": "Pension",
                "balance": 50000.0,
                "annual_contribution": 0.0,
                "growth_rate_mean": 0.05,
                "growth_rate_std": 0.10,
                "contributions_end_at_retirement": False,
                "asset_type": "PENSION",
                "withdrawal_priority": 100,
            },
        ],
        "properties": [
            {
                "name": "Flat",
                "value": 250000.0,
                "appreciation_rate_mean": 0.03,
                "appreciation_rate_std": 0.08,
                "monthly_rental_income": 1500.0,
                "rental_growth_rate": 0.02,
                "occupancy_rate": 0.95,
                "mortgage_ltv": 0.8,
                "mortgage_term_remaining": 25,
                "mortgage_rate": 0.04,
                "mortgage_repaid_at_death": True,
            }
        ],
        "expenses": [],
    }
