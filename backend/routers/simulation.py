"""FastAPI routes for the simulation engine.

Thin routing layer that delegates to SimulationService and BondSweepService.
Original file was 1,072 lines; extracted to simulation/service.py and
simulation/bond_sweep.py.
"""
from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import zlib
from datetime import date

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.dependencies import get_db_session
from backend.schemas.simulation import (
    BondCombo,
    BondOverrideRequest,
    BondSweepRequest,
    BondSweepResponse,
    MarginalCurve,
    MarginalPoint,
    SafeWithdrawalRequest,
    SafeWithdrawalResponse,
    SensitivityPoint,
    SimulationInitRequest,
    SimulationInitResponse,
    SimulationRecalcRequest,
    SimulationRequest,
    SimulationResponse,
)

from backend.simulation.bond_sweep import BondSweepService
from backend.simulation.service import SimulationService, ScenarioBuilder

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health", summary="Simulation engine health check", description="Returns 200 OK if the simulation engine is running and session cache is accessible.")
async def simulation_health(request: Request) -> dict[str, str]:
    cache = getattr(request.app.state, "session_cache", None)
    if cache is None:
        return {"status": "degraded", "cache": "not_initialized"}
    try:
        size = await cache.size()
        return {"status": "ok", "cache": "file-backed", "active_sessions": size}
    except Exception:
        return {"status": "degraded", "cache": "error"}


@router.get("/historical-returns", summary="Get historical return data", description="Returns aligned S&P 500 + US 10Y Treasury historical return data used for the historical_bootstrap return model.")
async def historical_returns() -> dict:
    from backend.simulation.historical_returns import (
        get_historical_bond_returns,
        get_historical_bond_stats,
        get_historical_bond_years,
        get_historical_returns,
        get_historical_stats,
        get_historical_years,
    )
    years = get_historical_years()
    returns = get_historical_returns()
    stats = get_historical_stats()
    bond_years = get_historical_bond_years()
    bond_returns = get_historical_bond_returns()
    bond_stats = get_historical_bond_stats()
    return {
        "years": years.tolist(),
        "returns": returns.tolist(),
        "stats": stats,
        "bond_years": bond_years.tolist(),
        "bond_returns": bond_returns.tolist(),
        "bond_stats": bond_stats,
    }


@router.post("/run", summary="Run a simulation", response_model=SimulationResponse, description="Run a Monte Carlo retirement simulation on a scenario without caching the results.")
async def run_simulation_endpoint(
    payload: SimulationRequest,
    db: AsyncSession = Depends(get_db_session),
) -> SimulationResponse:
    service = SimulationService(db)
    scenario = await service.scenario_builder.load_scenario(payload.scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if len(scenario.people) == 0:
        raise HTTPException(status_code=400, detail="Scenario must have at least one person")

    sim_scenario = service.scenario_builder.build(
        scenario,
        annual_spend_target_override=payload.annual_spend_target,
        end_year_override=payload.end_year,
    )
    service.scenario_validator.validate(sim_scenario)

    from backend.simulation.returns_cache import generate_returns_matrix
    returns = generate_returns_matrix(scenario=sim_scenario, iterations=payload.iterations, seed=payload.seed)
    formatted = service.run_simulation(sim_scenario, returns)
    return SimulationResponse(**formatted)


@router.post("/init", summary="Initialize and run a simulation", response_model=SimulationInitResponse, description="Initialize a simulation session (caches returns for 30 min) and run the first simulation. Use session_id for subsequent /recalc requests.")
async def init_simulation(
    payload: SimulationInitRequest,
    db: AsyncSession = Depends(get_db_session),
) -> SimulationInitResponse:
    service = SimulationService(db)
    scenario = await service.scenario_builder.load_scenario(payload.scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if len(scenario.people) == 0:
        raise HTTPException(status_code=400, detail="Scenario must have at least one person")

    sim_scenario = service.scenario_builder.build(
        scenario,
        annual_spend_target_override=payload.annual_spend_target,
        end_year_override=payload.end_year,
    )
    service.scenario_validator.validate(sim_scenario)

    from backend.simulation.returns_cache import create_session, get_session
    session_id = await create_session(
        scenario_id=scenario.id,
        base_scenario=sim_scenario,
        iterations=payload.iterations,
        seed=payload.seed,
    )
    cached = await get_session(session_id=session_id)
    if cached is None:
        raise HTTPException(status_code=500, detail="Failed to initialize simulation session")

    formatted = service.run_simulation(sim_scenario, cached.returns)
    return SimulationInitResponse(session_id=session_id, **formatted)


@router.post("/recalc", summary="Recalculate with updated parameters", response_model=SimulationResponse, description="Recalculate using cached returns with updated spend target or retirement age offset. Faster than /init.")
async def recalc_simulation(
    payload: SimulationRecalcRequest,
) -> SimulationResponse:
    from backend.simulation.returns_cache import get_session
    from backend.simulation.service import ScenarioBuilder

    cached = await get_session(session_id=payload.session_id)
    if cached is None:
        raise HTTPException(status_code=404, detail="Simulation session not found (expired?)")

    base = cached.base_scenario
    retirement_age_offset = int(payload.retirement_age_offset or 0)
    spend = float(payload.annual_spend_target) if payload.annual_spend_target is not None else base.annual_spend_target

    sim_scenario = ScenarioBuilder.build_variant(
        base=base,
        annual_spend_target=spend,
        retirement_age_offset=retirement_age_offset,
    )

    service = SimulationService(cached.base_scenario)  # placeholder, only needs formatter
    # Actually we need the db_session for the service, but we don't use it for recalc
    # Let's just use the formatter directly
    from backend.simulation.engine_fast import run_simulation
    from backend.simulation.service import ResponseFormatter

    mats = run_simulation(scenario=sim_scenario, returns=cached.returns)
    pct = payload.percentile if payload.percentile is not None else 50
    formatted = ResponseFormatter.format(
        years=mats.years,
        mats=mats.fields,
        people=sim_scenario.people,
        inflation_rate=sim_scenario.assumptions.inflation_rate,
        start_year=sim_scenario.start_year,
        pct=pct,
    )
    return SimulationResponse(**formatted)


@router.post("/safe-withdrawal", summary="Find maximum safe fun fund", response_model=SafeWithdrawalResponse, description="Run a binary search to find the maximum safe extra retirement spend (fun fund) given a risk threshold.")
async def safe_withdrawal(
    payload: SafeWithdrawalRequest,
) -> SafeWithdrawalResponse:
    from backend.simulation.returns_cache import get_session
    from backend.simulation.engine_fast import run_simulation
    from backend.simulation.service import ScenarioBuilder

    cached = await get_session(session_id=payload.session_id)
    if cached is None:
        raise HTTPException(status_code=404, detail="Simulation session not found (expired?)")

    base = cached.base_scenario
    retirement_age_offset = int(payload.retirement_age_offset)
    risk_threshold = float(payload.risk_threshold)
    max_spend = float(payload.max_spend)
    steps = int(payload.steps)

    step_size = max_spend / steps
    spend_values = [round(i * step_size) for i in range(steps + 1)]

    sensitivity_curve: list[SensitivityPoint] = []
    max_safe_fun_fund = 0.0

    for spend in spend_values:
        sim_scenario = ScenarioBuilder.build_variant(
            base=base,
            annual_spend_target=float(spend),
            retirement_age_offset=retirement_age_offset,
        )
        mats = run_simulation(scenario=sim_scenario, returns=cached.returns)

        nw = mats.fields.get("net_worth")
        is_bankrupt = mats.fields.get("is_bankrupt")
        is_depleted = mats.fields.get("is_depleted")

        if nw is not None and nw.size:
            p10_final = float(np.percentile(nw[:, -1], 10))
        else:
            p10_final = 0.0

        if is_bankrupt is not None and is_bankrupt.size:
            bankruptcy_pct = float(np.mean(is_bankrupt[:, -1]) * 100)
        else:
            bankruptcy_pct = 0.0

        if is_depleted is not None and is_depleted.size:
            depletion_pct = float(np.mean(is_depleted[:, -1]) * 100)
        else:
            depletion_pct = 0.0

        sensitivity_curve.append(SensitivityPoint(
            fun_fund=float(spend),
            bankruptcy_pct=round(bankruptcy_pct, 2),
            depletion_pct=round(depletion_pct, 2),
            p10_final_net_worth=round(p10_final, 2),
        ))

        if bankruptcy_pct <= risk_threshold:
            max_safe_fun_fund = float(spend)

    # Binary search refinement
    if max_safe_fun_fund < max_spend:
        lo = max_safe_fun_fund
        hi = min(max_safe_fun_fund + step_size, max_spend)
        for _ in range(10):
            mid = round((lo + hi) / 2)
            sim_scenario = ScenarioBuilder.build_variant(
                base=base,
                annual_spend_target=float(mid),
                retirement_age_offset=retirement_age_offset,
            )
            mats = run_simulation(scenario=sim_scenario, returns=cached.returns)
            is_bankrupt = mats.fields.get("is_bankrupt")
            if is_bankrupt is not None and is_bankrupt.size:
                bankruptcy_pct = float(np.mean(is_bankrupt[:, -1]) * 100)
            else:
                bankruptcy_pct = 0.0
            if bankruptcy_pct <= risk_threshold:
                lo = mid
            else:
                hi = mid
        max_safe_fun_fund = lo

    return SafeWithdrawalResponse(
        max_safe_fun_fund=round(max_safe_fun_fund, 2),
        risk_threshold=risk_threshold,
        sensitivity_curve=sensitivity_curve,
    )


@router.get("/bond-sweep/progress", summary="Get bond sweep progress", description="Poll the progress of a running bond allocation sweep. Returns completed/total combos and current phase.")
async def bond_sweep_progress(session_id: str) -> dict:
    return await BondSweepService.progress(session_id)


@router.post("/bond-sweep/cancel", summary="Cancel a running bond sweep", description="Cancel a bond allocation sweep that is currently running. Returns immediately.")
async def bond_sweep_cancel(session_id: str) -> dict:
    """Cancel a running bond sweep."""
    return await BondSweepService.cancel(session_id)


@router.post("/bond-sweep", summary="Run bond allocation optimization", response_model=BondSweepResponse, description="Run a multi-round optimization sweep to find the optimal bond allocation across ISA, GIA, and Pension accounts. This runs asynchronously — poll /bond-sweep/progress to track status.")
async def bond_sweep(payload: BondSweepRequest) -> BondSweepResponse:
    """Run bond sweep asynchronously.

    The sweep runs in a background task. Use /bond-sweep/progress to
    poll for status. Use /bond-sweep/cancel to cancel.
    """
    # Run the sweep in a background task
    task = asyncio.create_task(BondSweepService.run_async(payload))

    # Wait for completion (with a generous timeout as a safety net)
    try:
        return await asyncio.wait_for(task, timeout=3600)  # 1 hour max
    except asyncio.TimeoutError:
        task.cancel()
        raise HTTPException(
            status_code=504,
            detail="Bond sweep timed out after 1 hour",
        )
    except asyncio.CancelledError:
        raise HTTPException(
            status_code=499,
            detail="Bond sweep was cancelled",
        )


@router.post("/bond-override", summary="Apply bond allocation override", response_model=SimulationResponse, description="Apply custom bond allocation percentages and re-run the simulation.")
async def bond_override(payload: BondOverrideRequest) -> SimulationResponse:
    from backend.simulation.returns_cache import get_session, generate_returns_matrix_with_bond_override
    from backend.simulation.engine_fast import run_simulation
    from backend.simulation.service import ResponseFormatter, ScenarioBuilder

    cached = await get_session(session_id=payload.session_id)
    if cached is None:
        raise HTTPException(status_code=404, detail="Simulation session not found (expired?)")

    if cached.base_scenario.assumptions.return_model != "historical_bootstrap":
        raise HTTPException(status_code=400, detail="Bond override requires historical_bootstrap return model")

    base = cached.base_scenario
    retirement_age_offset = int(payload.retirement_age_offset or 0)
    annual_spend_target = float(payload.annual_spend_target) if payload.annual_spend_target is not None else base.annual_spend_target

    sim_scenario = ScenarioBuilder.build_variant(
        base=base,
        annual_spend_target=annual_spend_target,
        retirement_age_offset=retirement_age_offset,
    )

    bond_override_dict = {
        "ISA": payload.isa_bond_pct / 100.0,
        "GIA": payload.gia_bond_pct / 100.0,
        "PENSION": payload.pension_bond_pct / 100.0,
    }

    returns = generate_returns_matrix_with_bond_override(
        scenario=sim_scenario,
        iterations=cached.returns.iterations,
        seed=0,
        bond_pct_by_class=bond_override_dict,
    )
    mats = run_simulation(scenario=sim_scenario, returns=returns)

    formatted = ResponseFormatter.format(
        years=mats.years,
        mats=mats.fields,
        people=sim_scenario.people,
        inflation_rate=sim_scenario.assumptions.inflation_rate,
        start_year=sim_scenario.start_year,
        pct=payload.percentile if payload.percentile is not None else 50,
    )
    return SimulationResponse(**formatted)


# Column headers for CSV export in the same order as the engine fields
_CSV_COLUMNS = [
    "net_worth", "salary_gross", "salary_net", "rental_income", "gift_income",
    "pension_income", "state_pension_income", "investment_returns", "total_income",
    "total_expenses", "mortgage_payment", "pension_contributions", "fun_fund",
    "income_tax_paid", "ni_paid", "total_tax", "isa_balance", "pension_balance",
    "cash_balance", "total_assets", "mortgage_balance", "total_liabilities",
    "mortgage_paid_off", "is_depleted", "is_bankrupt", "debt_balance",
    "debt_interest_paid", "isa_returns", "gia_returns", "cash_returns",
    "pension_returns", "isa_contributions", "gia_contributions",
    "pension_contributions_total", "isa_withdrawals", "gia_withdrawals",
    "pension_withdrawals", "gia_balance", "property_value",
    "property_rental_income", "property_maintenance", "property_returns",
    "state_pension_tax_paid",
    # P1.1: Structured tax breakdown
    "salary_income_tax_paid", "rental_income_tax_paid",
    "pension_drawdown_tax_paid", "capital_gains_tax_paid",
]


@router.get("/export", summary="Export simulation results", description="Export simulation results as CSV or JSON. Supports all engine output fields. Use ?compress=true for gzip compression.")
async def export_simulation(
    session_id: str,
    format: str = Query(default="csv", pattern="^(csv|json)$"),
    compress: bool = Query(default=False, description="Enable gzip compression for the response body"),
) -> Response:
    from backend.simulation.returns_cache import get_session
    from backend.simulation.engine_fast import run_simulation

    cached = await get_session(session_id=session_id)
    if cached is None:
        raise HTTPException(status_code=404, detail="Simulation session not found (expired?)")

    sim_scenario = cached.base_scenario
    run_mats = run_simulation(scenario=sim_scenario, returns=cached.returns)

    years = run_mats.years
    fields = run_mats.fields

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["year"] + [str(y) for y in years])
        for col_name in _CSV_COLUMNS:
            values = fields.get(col_name)
            if values is not None and values.size > 0:
                flat = [float(x) for x in values.flatten()]
                writer.writerow([col_name] + [f"{v:.2f}" for v in flat])
            else:
                writer.writerow([col_name] + ["0.00"] * len(years))

        body = output.getvalue()
        media_type = "text/csv"
        ext = "csv"
    else:
        data: dict = {"year": [int(y) for y in years]}
        for col_name in _CSV_COLUMNS:
            values = fields.get(col_name)
            if values is not None and values.size > 0:
                flat = [float(x) for x in values.flatten()]
                data[col_name] = [round(v, 2) for v in flat]
            else:
                data[col_name] = [0.0] * len(years)
        body = json.dumps(data)
        media_type = "application/json"
        ext = "json"

    filename = f"simulation_{session_id[:8]}.{ext}"

    if compress:
        compressed = zlib.compress(body.encode("utf-8"), level=6)
        return Response(
            content=compressed,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Encoding": "gzip",
                "X-Content-Size": str(len(body)),
            },
        )
    else:
        return Response(
            content=body,
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
