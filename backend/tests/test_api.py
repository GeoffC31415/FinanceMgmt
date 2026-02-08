"""
API integration tests for scenario CRUD endpoints and simulation.

Uses FastAPI TestClient with an in-memory SQLite database.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from backend.models.base import Base
from backend.main import create_app


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


def _minimal_scenario_payload(name: str = "Test Scenario") -> dict:
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
        "mortgage": {
            "balance": 200000.0,
            "annual_interest_rate": 0.04,
            "monthly_payment": 1200.0,
        },
        "expenses": [
            {"name": "Living", "monthly_amount": 2000.0, "is_inflation_linked": True}
        ],
    }


# ────────────────────────────── Health Check ──────────────────────────────


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_config_health(client: AsyncClient):
    resp = await client.get("/api/config/health")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_simulation_health(client: AsyncClient):
    resp = await client.get("/api/simulation/health")
    assert resp.status_code == 200


# ────────────────────────────── Scenario CRUD ──────────────────────────────


@pytest.mark.asyncio
async def test_create_scenario(client: AsyncClient):
    payload = _minimal_scenario_payload()
    resp = await client.post("/api/config/scenarios", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Scenario"
    assert "id" in data
    assert len(data["people"]) == 1
    assert len(data["assets"]) == 2
    assert data["mortgage"] is not None
    assert len(data["expenses"]) == 1


@pytest.mark.asyncio
async def test_list_scenarios(client: AsyncClient):
    # Create two scenarios
    await client.post("/api/config/scenarios", json=_minimal_scenario_payload("A"))
    await client.post("/api/config/scenarios", json=_minimal_scenario_payload("B"))

    resp = await client.get("/api/config/scenarios")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    names = {s["name"] for s in data}
    assert "A" in names
    assert "B" in names


@pytest.mark.asyncio
async def test_get_scenario(client: AsyncClient):
    create_resp = await client.post("/api/config/scenarios", json=_minimal_scenario_payload())
    scenario_id = create_resp.json()["id"]

    resp = await client.get(f"/api/config/scenarios/{scenario_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == scenario_id


@pytest.mark.asyncio
async def test_get_scenario_not_found(client: AsyncClient):
    resp = await client.get("/api/config/scenarios/nonexistent-id")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_scenario(client: AsyncClient):
    create_resp = await client.post("/api/config/scenarios", json=_minimal_scenario_payload("Original"))
    scenario_id = create_resp.json()["id"]

    updated_payload = _minimal_scenario_payload("Updated")
    resp = await client.put(f"/api/config/scenarios/{scenario_id}", json=updated_payload)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated"


@pytest.mark.asyncio
async def test_update_nonexistent_scenario(client: AsyncClient):
    resp = await client.put("/api/config/scenarios/bad-id", json=_minimal_scenario_payload())
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_scenario(client: AsyncClient):
    create_resp = await client.post("/api/config/scenarios", json=_minimal_scenario_payload())
    scenario_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/api/config/scenarios/{scenario_id}")
    assert del_resp.status_code == 204

    # Verify it's gone
    get_resp = await client.get(f"/api/config/scenarios/{scenario_id}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_scenario(client: AsyncClient):
    resp = await client.delete("/api/config/scenarios/bad-id")
    assert resp.status_code == 404


# ────────────────────────────── Scenario Validation ──────────────────────────────


@pytest.mark.asyncio
async def test_create_scenario_empty_name_rejected(client: AsyncClient):
    payload = _minimal_scenario_payload()
    payload["name"] = ""
    resp = await client.post("/api/config/scenarios", json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_scenario_negative_balance_rejected(client: AsyncClient):
    payload = _minimal_scenario_payload()
    payload["assets"][0]["balance"] = -100.0
    resp = await client.post("/api/config/scenarios", json=payload)
    assert resp.status_code == 422


# ────────────────────────────── Simulation ──────────────────────────────


@pytest.mark.asyncio
async def test_simulation_init(client: AsyncClient):
    create_resp = await client.post("/api/config/scenarios", json=_minimal_scenario_payload())
    scenario_id = create_resp.json()["id"]

    sim_resp = await client.post("/api/simulation/init", json={
        "scenario_id": scenario_id,
        "iterations": 50,
        "seed": 42,
        "use_fast_engine": False,
    })
    assert sim_resp.status_code == 200
    data = sim_resp.json()
    assert "session_id" in data
    assert len(data["years"]) > 0
    assert len(data["net_worth_median"]) == len(data["years"])


@pytest.mark.asyncio
async def test_simulation_recalc(client: AsyncClient):
    create_resp = await client.post("/api/config/scenarios", json=_minimal_scenario_payload())
    scenario_id = create_resp.json()["id"]

    init_resp = await client.post("/api/simulation/init", json={
        "scenario_id": scenario_id,
        "iterations": 50,
        "seed": 42,
        "use_fast_engine": False,
    })
    session_id = init_resp.json()["session_id"]

    recalc_resp = await client.post("/api/simulation/recalc", json={
        "session_id": session_id,
        "annual_spend_target": 10000.0,
        "retirement_age_offset": -2,
        "percentile": 50,
        "use_fast_engine": False,
    })
    assert recalc_resp.status_code == 200
    data = recalc_resp.json()
    assert len(data["years"]) > 0


@pytest.mark.asyncio
async def test_simulation_not_found(client: AsyncClient):
    resp = await client.post("/api/simulation/init", json={
        "scenario_id": "nonexistent",
        "iterations": 50,
    })
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_simulation_recalc_expired_session(client: AsyncClient):
    resp = await client.post("/api/simulation/recalc", json={
        "session_id": "expired-session",
    })
    assert resp.status_code == 404
