from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.dependencies import get_db_session
from backend.models import Asset, Expense, Income, Mortgage, Person, Scenario
from backend.schemas.simulation import (
    BondCombo,
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
import numpy as np

from backend.simulation.engine import (
    SimulationAssumptions,
    SimulationScenario,
)
from backend.simulation.engine_fast import run_simulation
from backend.simulation.returns_cache import create_session, get_session, generate_returns_matrix, generate_returns_matrix_with_bond_override
from backend.simulation.entities import ExpenseItem, GiftIncome, MortgageAccount, PensionPot, PersonEntity, RentalIncome, SalaryIncome
from backend.simulation.entities.asset import AssetAccount

router = APIRouter()


@router.get("/health")
async def simulation_health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/historical-returns")
async def historical_returns() -> dict:
    """Return S&P 500 and US 10-Year Treasury historical returns data and summary statistics."""
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


def _scenario_query():
    return (
        select(Scenario)
        .options(selectinload(Scenario.people))
        .options(selectinload(Scenario.incomes))
        .options(selectinload(Scenario.assets))
        .options(selectinload(Scenario.mortgage))
        .options(selectinload(Scenario.expenses))
    )


def _coerce_int(value: object, default: int) -> int:
    try:
        return int(value)  # type: ignore[arg-type]
    except Exception:
        return default


def _coerce_float(value: object, default: float) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except Exception:
        return default


def _build_simulation_scenario(
    *,
    scenario: Scenario,
    annual_spend_target_override: float | None,
    end_year_override: int | None,
) -> SimulationScenario:
    # Assumptions (basic UK defaults, plus user overrides from JSON)
    assumptions_json = scenario.assumptions or {}

    # Resolve tax bands from tax year preset or individual overrides
    from backend.simulation.tax.tax_config import tax_config_from_assumptions
    tax_cfg = tax_config_from_assumptions(assumptions_json)

    return_model = str(assumptions_json.get("return_model", "parametric"))
    if return_model not in ("parametric", "historical_bootstrap"):
        return_model = "parametric"

    assumptions = SimulationAssumptions(
        return_model=return_model,
        inflation_rate=_coerce_float(assumptions_json.get("inflation_rate"), 0.02),
        isa_annual_limit=_coerce_float(assumptions_json.get("isa_annual_limit"), 20_000.0),
        state_pension_annual=_coerce_float(assumptions_json.get("state_pension_annual"), 11_500.0),
        cgt_annual_allowance=_coerce_float(assumptions_json.get("cgt_annual_allowance"), 3_000.0),
        cgt_rate=_coerce_float(assumptions_json.get("cgt_rate"), 0.10),
        emergency_fund_months=_coerce_float(assumptions_json.get("emergency_fund_months"), 6.0),
        pension_access_age=_coerce_int(assumptions_json.get("pension_access_age"), 55),
        debt_interest_rate=_coerce_float(assumptions_json.get("debt_interest_rate"), 0.08),
        bankruptcy_threshold=_coerce_float(assumptions_json.get("bankruptcy_threshold"), -100_000.0),
        # Configurable tax bands
        personal_allowance=tax_cfg.personal_allowance,
        basic_rate_limit=tax_cfg.basic_rate_limit,
        higher_rate_limit=tax_cfg.higher_rate_limit,
        basic_rate=tax_cfg.basic_rate,
        higher_rate=tax_cfg.higher_rate,
        additional_rate=tax_cfg.additional_rate,
        ni_primary_threshold=tax_cfg.ni_primary_threshold,
        ni_upper_earnings_limit=tax_cfg.ni_upper_earnings_limit,
        ni_main_rate=tax_cfg.ni_main_rate,
        ni_upper_rate=tax_cfg.ni_upper_rate,
    )

    start_year = _coerce_int(assumptions_json.get("start_year"), date.today().year)
    end_year_default = _coerce_int(assumptions_json.get("end_year"), start_year + 60)
    end_year = end_year_override if end_year_override is not None else end_year_default

    annual_spend_default = _coerce_float(assumptions_json.get("annual_spend_target"), 0.0)
    annual_spend_target = annual_spend_target_override if annual_spend_target_override is not None else annual_spend_default

    people = [
        PersonEntity(
            key=person.label,
            birth_date=person.birth_date,
            planned_retirement_age=person.planned_retirement_age,
            state_pension_age=person.state_pension_age,
            is_child=getattr(person, "is_child", False),
            annual_cost=getattr(person, "annual_cost", 0.0) or 0.0,
            leaves_household_age=getattr(person, "leaves_household_age", 18) or 18,
        )
        for person in scenario.people
    ]

    salary_by_person: dict[str, list[SalaryIncome]] = {}
    rental_incomes: list[RentalIncome] = []
    gift_incomes: list[GiftIncome] = []

    for income in scenario.incomes:
        if income.kind == "salary":
            # If person_id missing, attach to first person (simple default).
            person_key = next((p.label for p in scenario.people if p.id == income.person_id), scenario.people[0].label)
            salary_by_person.setdefault(person_key, []).append(
                SalaryIncome(
                    gross_annual=income.gross_annual,
                    annual_growth_rate=income.annual_growth_rate,
                    employee_pension_pct=income.employee_pension_pct,
                    employer_pension_pct=income.employer_pension_pct,
                    start_year=income.start_year,
                    end_year=income.end_year,
                )
            )
        elif income.kind == "rental":
            # Rental income: taxable as personal income, no NI, no pension contributions
            person_key = next((p.label for p in scenario.people if p.id == income.person_id), scenario.people[0].label)
            rental_incomes.append(
                RentalIncome(
                    gross_annual=income.gross_annual,
                    annual_growth_rate=income.annual_growth_rate,
                    start_year=income.start_year,
                    end_year=income.end_year,
                    person_key=person_key,
                )
            )
        elif income.kind == "gift":
            # Gift income: completely tax-free
            person_key = next((p.label for p in scenario.people if p.id == income.person_id), scenario.people[0].label)
            gift_incomes.append(
                GiftIncome(
                    gross_annual=income.gross_annual,
                    annual_growth_rate=income.annual_growth_rate,
                    start_year=income.start_year,
                    end_year=income.end_year,
                    person_key=person_key,
                )
            )

    pension_by_person: dict[str, PensionPot] = {}
    assets: list[AssetAccount] = []
    pension_withdrawal_priority = 100

    for asset in scenario.assets:
        asset_type = getattr(asset, "asset_type", None) or ("PENSION" if "pension" in asset.name.lower() else "GIA")
        withdrawal_priority = getattr(asset, "withdrawal_priority", 100)

        bond_allocation = float(getattr(asset, "bond_allocation", 0.0) or 0.0)

        if asset_type == "PENSION":
            # Pension assets: assign to specific person or default to first person
            if asset.person_id:
                person_key = next((p.label for p in scenario.people if p.id == asset.person_id), scenario.people[0].label)
            else:
                # No person_id - assign to first person as a household pension
                person_key = scenario.people[0].label

            if person_key not in pension_by_person:
                pension_by_person[person_key] = PensionPot(
                    balance=asset.balance,
                    growth_rate_mean=asset.growth_rate_mean,
                    growth_rate_std=asset.growth_rate_std,
                    bond_allocation=bond_allocation,
                )
            else:
                # Add balance to existing pension; keep growth rates from first pension
                pension_by_person[person_key].balance += asset.balance
            pension_withdrawal_priority = min(pension_withdrawal_priority, int(withdrawal_priority))
            continue

        assets.append(
            AssetAccount(
                name=asset.name,
                asset_type=asset_type,
                withdrawal_priority=withdrawal_priority,
                balance=asset.balance,
                annual_contribution=asset.annual_contribution,
                growth_rate_mean=asset.growth_rate_mean,
                growth_rate_std=asset.growth_rate_std,
                contributions_end_at_retirement=asset.contributions_end_at_retirement,
                bond_allocation=bond_allocation,
                cost_basis=asset.balance,
            )
        )

    mortgage = None
    if scenario.mortgage is not None:
        mortgage = MortgageAccount(
            balance=scenario.mortgage.balance,
            annual_interest_rate=scenario.mortgage.annual_interest_rate,
            monthly_payment=scenario.mortgage.monthly_payment,
        )

    expenses = [
        ExpenseItem(
            name=expense.name,
            annual_amount=expense.monthly_amount * 12.0,
            is_inflation_linked=expense.is_inflation_linked,
        )
        for expense in scenario.expenses
    ]

    return SimulationScenario(
        start_year=start_year,
        end_year=end_year,
        people=people,
        salary_by_person=salary_by_person,
        pension_by_person=pension_by_person,
        assets=assets,
        mortgage=mortgage,
        expenses=expenses,
        rental_incomes=rental_incomes,
        gift_incomes=gift_incomes,
        annual_spend_target=annual_spend_target,
        planned_retirement_age_by_person={
            p.key: p.planned_retirement_age
            for p in people
            if not p.is_child and p.planned_retirement_age is not None
        },
        pension_withdrawal_priority=pension_withdrawal_priority,
        assumptions=assumptions,
    )


def _retirement_years_from_people(*, people: list[PersonEntity]) -> list[int]:
    # Only include adults with retirement ages (exclude children)
    return sorted({
        p.birth_date.year + p.planned_retirement_age
        for p in people
        if not p.is_child and p.planned_retirement_age is not None
    })


def _response_from_matrices(
    *,
    years: list[int],
    mats: dict[str, np.ndarray],
    people: list[PersonEntity],
    inflation_rate: float,
    start_year: int,
    pct: int = 50,
) -> SimulationResponse:
    # Find the representative iteration for the target percentile
    # We use the final year's net_worth to rank iterations, then pick the one closest to the target percentile
    nw = mats.get("net_worth")
    if nw is not None and nw.size:
        # Sort iterations by final net worth to find the one at the target percentile
        final_nw = nw[:, -1]
        sorted_indices = np.argsort(final_nw)
        # Calculate which index corresponds to the target percentile
        target_idx = int(np.clip(len(sorted_indices) * pct / 100, 0, len(sorted_indices) - 1))
        rep_iter = sorted_indices[target_idx]
    else:
        rep_iter = 0
    
    def from_iteration(field_name: str) -> list[float]:
        """Get values from the representative iteration."""
        m = mats.get(field_name)
        if m is None or not m.size:
            return [0.0] * len(years)
        return m[rep_iter, :].tolist()
    
    def at_percentile(field_name: str, p: int) -> list[float]:
        """Get true percentile values (used for p10/p90 bands)."""
        m = mats.get(field_name)
        if m is None or not m.size:
            return [0.0] * len(years)
        return np.percentile(m, p, axis=0).tolist()

    def percentage(field_name: str) -> list[float]:
        """Get percentage of iterations where field is true (for boolean fields)."""
        m = mats.get(field_name)
        if m is None or not m.size:
            return [0.0] * len(years)
        return (np.mean(m, axis=0) * 100).tolist()

    return SimulationResponse(
        years=years,
        # Net worth bands still use true percentiles for the uncertainty visualization
        net_worth_p10=at_percentile("net_worth", 10),
        net_worth_median=from_iteration("net_worth"),  # Use representative iteration
        net_worth_p90=at_percentile("net_worth", 90),
        income_median=from_iteration("total_income"),
        spend_median=from_iteration("total_expenses"),
        retirement_years=_retirement_years_from_people(people=people),
        inflation_rate=inflation_rate,
        start_year=start_year,
        # Detailed incomes (from representative iteration for consistency)
        salary_gross_median=from_iteration("salary_gross"),
        salary_net_median=from_iteration("salary_net"),
        rental_income_median=from_iteration("rental_income"),
        gift_income_median=from_iteration("gift_income"),
        pension_income_median=from_iteration("pension_income"),
        state_pension_income_median=from_iteration("state_pension_income"),
        investment_returns_median=from_iteration("investment_returns"),
        total_income_median=from_iteration("total_income"),
        # Detailed expenses (from representative iteration)
        total_expenses_median=from_iteration("total_expenses"),
        mortgage_payment_median=from_iteration("mortgage_payment"),
        pension_contributions_median=from_iteration("pension_contributions"),
        fun_fund_median=from_iteration("fun_fund"),
        # Tax (from representative iteration)
        income_tax_paid_median=from_iteration("income_tax_paid"),
        ni_paid_median=from_iteration("ni_paid"),
        total_tax_median=from_iteration("total_tax"),
        # Assets (from representative iteration)
        isa_balance_median=from_iteration("isa_balance"),
        pension_balance_median=from_iteration("pension_balance"),
        cash_balance_median=from_iteration("cash_balance"),
        gia_balance_median=from_iteration("gia_balance"),
        total_assets_median=from_iteration("total_assets"),
        # Asset-type performance and flows (from representative iteration)
        isa_returns_median=from_iteration("isa_returns"),
        gia_returns_median=from_iteration("gia_returns"),
        cash_returns_median=from_iteration("cash_returns"),
        pension_returns_median=from_iteration("pension_returns"),
        isa_contributions_median=from_iteration("isa_contributions"),
        gia_contributions_median=from_iteration("gia_contributions"),
        isa_withdrawals_median=from_iteration("isa_withdrawals"),
        gia_withdrawals_median=from_iteration("gia_withdrawals"),
        pension_withdrawals_median=from_iteration("pension_withdrawals"),
        # Liabilities (from representative iteration)
        mortgage_balance_median=from_iteration("mortgage_balance"),
        total_liabilities_median=from_iteration("total_liabilities"),
        # Other (these remain as percentages of runs across all iterations)
        mortgage_paid_off_median=percentage("mortgage_paid_off"),
        is_depleted_median=percentage("is_depleted"),
        is_bankrupt_median=percentage("is_bankrupt"),
        debt_balance_median=from_iteration("debt_balance"),
        debt_interest_paid_median=from_iteration("debt_interest_paid"),
    )


@router.post("/run", response_model=SimulationResponse)
async def run_simulation_endpoint(payload: SimulationRequest, session: AsyncSession = Depends(get_db_session)) -> SimulationResponse:
    result = await session.execute(_scenario_query().where(Scenario.id == payload.scenario_id))
    scenario = result.scalars().unique().first()
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if len(scenario.people) == 0:
        raise HTTPException(status_code=400, detail="Scenario must have at least one person")

    sim_scenario = _build_simulation_scenario(
        scenario=scenario,
        annual_spend_target_override=payload.annual_spend_target,
        end_year_override=payload.end_year,
    )

    returns = generate_returns_matrix(scenario=sim_scenario, iterations=payload.iterations, seed=payload.seed)
    mats = run_simulation(scenario=sim_scenario, returns=returns)

    return _response_from_matrices(
        years=mats.years,
        mats=mats.fields,
        people=sim_scenario.people,
        inflation_rate=sim_scenario.assumptions.inflation_rate,
        start_year=sim_scenario.start_year,
    )


@router.post("/init", response_model=SimulationInitResponse)
async def init_simulation(
    payload: SimulationInitRequest, session: AsyncSession = Depends(get_db_session)
) -> SimulationInitResponse:
    result = await session.execute(_scenario_query().where(Scenario.id == payload.scenario_id))
    scenario = result.scalars().unique().first()
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if len(scenario.people) == 0:
        raise HTTPException(status_code=400, detail="Scenario must have at least one person")

    sim_scenario = _build_simulation_scenario(
        scenario=scenario,
        annual_spend_target_override=payload.annual_spend_target,
        end_year_override=payload.end_year,
    )

    session_id = create_session(
        scenario_id=scenario.id,
        base_scenario=sim_scenario,
        iterations=payload.iterations,
        seed=payload.seed,
    )

    cached = get_session(session_id=session_id)
    if cached is None:
        raise HTTPException(status_code=500, detail="Failed to initialize simulation session")

    mats = run_simulation(scenario=sim_scenario, returns=cached.returns)
    response = _response_from_matrices(
        years=mats.years,
        mats=mats.fields,
        people=sim_scenario.people,
        inflation_rate=sim_scenario.assumptions.inflation_rate,
        start_year=sim_scenario.start_year,
    )
    return SimulationInitResponse(session_id=session_id, **response.model_dump())


def _build_scenario_from_cached(
    *,
    base: SimulationScenario,
    annual_spend_target: float,
    retirement_age_offset: int = 0,
) -> SimulationScenario:
    """Build a scenario variant from a cached base with spend/retirement overrides."""
    people = [
        PersonEntity(
            key=p.key,
            birth_date=p.birth_date,
            planned_retirement_age=(
                max(0, int(p.planned_retirement_age) + retirement_age_offset)
                if p.planned_retirement_age is not None else None
            ),
            state_pension_age=p.state_pension_age,
            is_child=p.is_child,
            annual_cost=p.annual_cost,
            leaves_household_age=p.leaves_household_age,
        )
        for p in base.people
    ]

    return SimulationScenario(
        start_year=base.start_year,
        end_year=base.end_year,
        people=people,
        salary_by_person=base.salary_by_person,
        pension_by_person=base.pension_by_person,
        assets=base.assets,
        mortgage=base.mortgage,
        expenses=base.expenses,
        rental_incomes=base.rental_incomes,
        gift_incomes=base.gift_incomes,
        annual_spend_target=annual_spend_target,
        planned_retirement_age_by_person={
            p.key: p.planned_retirement_age
            for p in people
            if not p.is_child and p.planned_retirement_age is not None
        },
        pension_withdrawal_priority=base.pension_withdrawal_priority,
        assumptions=base.assumptions,
    )


@router.post("/recalc", response_model=SimulationResponse)
async def recalc_simulation(
    payload: SimulationRecalcRequest,
) -> SimulationResponse:
    cached = get_session(session_id=payload.session_id)
    if cached is None:
        raise HTTPException(status_code=404, detail="Simulation session not found (expired?)")

    base = cached.base_scenario
    retirement_age_offset = int(payload.retirement_age_offset or 0)
    spend = float(payload.annual_spend_target) if payload.annual_spend_target is not None else base.annual_spend_target

    sim_scenario = _build_scenario_from_cached(
        base=base,
        annual_spend_target=spend,
        retirement_age_offset=retirement_age_offset,
    )

    mats = run_simulation(scenario=sim_scenario, returns=cached.returns)
    pct = payload.percentile if payload.percentile is not None else 50
    return _response_from_matrices(
        years=mats.years,
        mats=mats.fields,
        people=sim_scenario.people,
        inflation_rate=sim_scenario.assumptions.inflation_rate,
        start_year=sim_scenario.start_year,
        pct=pct,
    )


@router.post("/safe-withdrawal", response_model=SafeWithdrawalResponse)
async def safe_withdrawal(
    payload: SafeWithdrawalRequest,
) -> SafeWithdrawalResponse:
    """Compute the maximum safe fun fund and a risk sensitivity curve.

    Sweeps fun_fund values from 0 to max_spend in `steps` increments,
    running the fast engine for each. Returns the sensitivity curve and
    the highest fun_fund where final-year bankruptcy risk <= threshold.
    """
    cached = get_session(session_id=payload.session_id)
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
        sim_scenario = _build_scenario_from_cached(
            base=base,
            annual_spend_target=float(spend),
            retirement_age_offset=retirement_age_offset,
        )

        mats = run_simulation(scenario=sim_scenario, returns=cached.returns)

        # Extract final-year risk metrics across all iterations
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

    # Binary search refinement between max_safe_fun_fund and the next step up
    if max_safe_fun_fund < max_spend:
        lo = max_safe_fun_fund
        hi = min(max_safe_fun_fund + step_size, max_spend)
        for _ in range(10):  # ~£1 precision at 200k range
            mid = round((lo + hi) / 2)
            sim_scenario = _build_scenario_from_cached(
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


def _scenario_has_asset_class(scenario: SimulationScenario, asset_class: str) -> bool:
    """Check whether the scenario actually has assets of the given class."""
    if asset_class == "PENSION":
        return bool(scenario.pension_by_person)
    return any(
        str(getattr(a, "asset_type", "")).upper() == asset_class
        for a in scenario.assets
    )


# Progress tracking for bond sweep
_SWEEP_PROGRESS: dict[str, dict] = {}


@router.get("/bond-sweep/progress")
async def bond_sweep_progress(session_id: str) -> dict:
    """Poll the progress of a running bond sweep."""
    prog = _SWEEP_PROGRESS.get(session_id)
    if prog is None:
        return {"completed": 0, "total": 0, "phase": "", "running": False}
    return {**prog, "running": prog["completed"] < prog["total"]}


def _run_combo(
    *,
    isa_pct: float,
    gia_pct: float,
    pen_pct: float,
    active_classes: list[str],
    sim_scenario_base: SimulationScenario,
    iterations: int,
    risk_threshold: float,
    target_year_index: int,
    max_spend: float,
) -> BondCombo:
    """Find max safe fun fund for one ISA/GIA/PENSION bond-allocation combination."""
    override: dict[str, float] = {}
    if "ISA" in active_classes:
        override["ISA"] = isa_pct / 100.0
    if "GIA" in active_classes:
        override["GIA"] = gia_pct / 100.0
    if "PENSION" in active_classes:
        override["PENSION"] = pen_pct / 100.0

    returns = generate_returns_matrix_with_bond_override(
        scenario=sim_scenario_base,
        iterations=iterations,
        seed=0,
        bond_pct_by_class=override,
    )

    lo = 0.0
    hi = max_spend
    for _ in range(15):
        mid = (lo + hi) / 2.0
        sim_scenario = _build_scenario_from_cached(
            base=sim_scenario_base,
            annual_spend_target=float(mid),
        )
        mats = run_simulation(scenario=sim_scenario, returns=returns)
        is_bankrupt = mats.fields.get("is_bankrupt")
        if is_bankrupt is not None and is_bankrupt.size:
            bankruptcy_pct = float(np.mean(is_bankrupt[:, target_year_index]) * 100)
        else:
            bankruptcy_pct = 0.0

        if bankruptcy_pct <= risk_threshold:
            lo = mid
        else:
            hi = mid

    max_safe_fun_fund = round(float(lo), 2)
    final_scenario = _build_scenario_from_cached(
        base=sim_scenario_base,
        annual_spend_target=max_safe_fun_fund,
    )
    final_mats = run_simulation(scenario=final_scenario, returns=returns)
    final_is_bankrupt = final_mats.fields.get("is_bankrupt")
    final_is_depleted = final_mats.fields.get("is_depleted")
    if final_is_bankrupt is not None and final_is_bankrupt.size:
        bankruptcy_pct = float(np.mean(final_is_bankrupt[:, target_year_index]) * 100)
    else:
        bankruptcy_pct = 0.0
    if final_is_depleted is not None and final_is_depleted.size:
        depletion_pct = float(np.mean(final_is_depleted[:, target_year_index]) * 100)
    else:
        depletion_pct = 0.0

    return BondCombo(
        isa_bond_pct=isa_pct,
        gia_bond_pct=gia_pct,
        pension_bond_pct=pen_pct,
        bankruptcy_pct=round(bankruptcy_pct, 2),
        depletion_pct=round(depletion_pct, 2),
        max_safe_fun_fund=max_safe_fun_fund,
    )


def _find_best_point(
    results: list[BondCombo],
) -> BondCombo:
    """Return the single best combo (highest max safe fun fund)."""
    return max(results, key=lambda r: (r.max_safe_fun_fund, -r.bankruptcy_pct))


@router.post("/bond-sweep", response_model=BondSweepResponse)
def bond_sweep(
    payload: BondSweepRequest,
) -> BondSweepResponse:
    """Adaptive coarse-to-fine combinatorial sweep of bond allocations.

    Round 1: 25% steps (coarse scan, ~125 combos for 3 classes)
    Round 2:  5% steps around coarse best (fixed 5 points per active class)
    Round 3:  1% steps around refined best (fixed 7 points per active class)

    Uses a fixed number of simulation runs per round so progress can be
    tracked as one monotonic total from start to finish.
    """
    cached = get_session(session_id=payload.session_id)
    if cached is None:
        raise HTTPException(status_code=404, detail="Simulation session not found (expired?)")

    base = cached.base_scenario
    if base.assumptions.return_model != "historical_bootstrap":
        raise HTTPException(status_code=400, detail="Bond sweep requires historical_bootstrap return model")

    retirement_age_offset = int(payload.retirement_age_offset)
    acceptable_risk = float(payload.risk_threshold)
    max_spend = float(payload.max_spend)

    sim_scenario_base = _build_scenario_from_cached(
        base=base,
        annual_spend_target=base.annual_spend_target,
        retirement_age_offset=retirement_age_offset,
    )
    years = cached.returns.years
    if years.size == 0:
        raise HTTPException(status_code=400, detail="No simulation years available for bond sweep")
    if payload.target_year is None:
        target_year_index = int(years.size - 1)
    else:
        target_year_index = int(np.searchsorted(years, int(payload.target_year)))
        target_year_index = max(0, min(target_year_index, int(years.size - 1)))
    target_year = int(years[target_year_index])

    all_classes = ["ISA", "GIA", "PENSION"]
    active_classes = [c for c in all_classes if _scenario_has_asset_class(sim_scenario_base, c)]

    sid = payload.session_id
    results: list[BondCombo] = []
    total_completed = 0
    active_count = len(active_classes)
    total_sim_runs = (5 ** active_count) + (5 ** active_count) + (7 ** active_count)

    def _grid_for_class(cls: str, values: list[float]) -> list[float]:
        return values if cls in active_classes else [0.0]

    def _run_round(
        *,
        phase: str,
        isa_vals: list[float],
        gia_vals: list[float],
        pen_vals: list[float],
    ) -> None:
        nonlocal total_completed
        import itertools
        combos = [(i, g, p) for i, g, p in itertools.product(isa_vals, gia_vals, pen_vals)]
        round_count = len(combos)
        _SWEEP_PROGRESS[sid] = {"completed": total_completed, "total": total_sim_runs, "phase": phase}
        for idx, (isa, gia, pen) in enumerate(combos):
            results.append(_run_combo(
                isa_pct=isa, gia_pct=gia, pen_pct=pen,
                active_classes=active_classes,
                sim_scenario_base=sim_scenario_base,
                iterations=cached.returns.iterations,
                risk_threshold=acceptable_risk,
                target_year_index=target_year_index,
                max_spend=max_spend,
            ))
            _SWEEP_PROGRESS[sid] = {
                "completed": total_completed + idx + 1,
                "total": total_sim_runs,
                "phase": phase,
            }
        total_completed += round_count

    def _range_around(center: float, pad: float, step: float) -> list[float]:
        """Generate a fixed-width stepped range around center clamped to [0, 100]."""
        count = int((2 * pad) / step) + 1
        min_start = 0.0
        max_start = 100.0 - (step * (count - 1))
        start = min(max(center - pad, min_start), max_start)
        return [round(start + (step * idx), 2) for idx in range(count)]

    # --- Round 1: 25% coarse scan ---
    coarse = [0.0, 25.0, 50.0, 75.0, 100.0]
    _run_round(
        phase="Coarse scan (25% steps)",
        isa_vals=_grid_for_class("ISA", coarse),
        gia_vals=_grid_for_class("GIA", coarse),
        pen_vals=_grid_for_class("PENSION", coarse),
    )

    # --- Round 2: 5% medium scan around best point (±10% pad) ---
    best = _find_best_point(results)
    _run_round(
        phase="Refining (5% steps)",
        isa_vals=_grid_for_class("ISA", _range_around(best.isa_bond_pct, 10, 5)),
        gia_vals=_grid_for_class("GIA", _range_around(best.gia_bond_pct, 10, 5)),
        pen_vals=_grid_for_class("PENSION", _range_around(best.pension_bond_pct, 10, 5)),
    )

    # --- Round 3: 1% fine scan around refined best (±3% pad) ---
    best = _find_best_point(results)
    _run_round(
        phase="Fine-tuning (1% steps)",
        isa_vals=_grid_for_class("ISA", _range_around(best.isa_bond_pct, 3, 1)),
        gia_vals=_grid_for_class("GIA", _range_around(best.gia_bond_pct, 3, 1)),
        pen_vals=_grid_for_class("PENSION", _range_around(best.pension_bond_pct, 3, 1)),
    )

    # Clean up progress
    _SWEEP_PROGRESS.pop(sid, None)

    unique_results_by_combo: dict[tuple[float, float, float], BondCombo] = {}
    for combo in results:
        combo_key = (combo.isa_bond_pct, combo.gia_bond_pct, combo.pension_bond_pct)
        unique_results_by_combo[combo_key] = combo
    unique_results = list(unique_results_by_combo.values())

    optimal = _find_best_point(unique_results)
    ranked = sorted(unique_results, key=lambda r: (-r.max_safe_fun_fund, r.bankruptcy_pct))[:10]

    # Build marginal curves from the coarse round (full 0-100 coverage)
    marginals: list[MarginalCurve] = []
    class_pct_field = {"ISA": "isa_bond_pct", "GIA": "gia_bond_pct", "PENSION": "pension_bond_pct"}
    for cls in active_classes:
        field = class_pct_field[cls]
        points: list[MarginalPoint] = []
        all_pct_vals = sorted({getattr(r, field) for r in unique_results})
        for pct_val in all_pct_vals:
            matching = [r for r in unique_results if getattr(r, field) == pct_val]
            if not matching:
                continue
            avg_bank = float(np.mean([r.bankruptcy_pct for r in matching]))
            avg_fun_fund = float(np.mean([r.max_safe_fun_fund for r in matching]))
            min_bank = float(min(r.bankruptcy_pct for r in matching))
            best_fun_fund = float(max(r.max_safe_fun_fund for r in matching))
            points.append(MarginalPoint(
                bond_pct=float(pct_val),
                avg_bankruptcy_pct=round(avg_bank, 2),
                avg_max_fun_fund=round(avg_fun_fund, 2),
                min_bankruptcy_pct=round(min_bank, 2),
                best_max_fun_fund=round(best_fun_fund, 2),
            ))
        marginals.append(MarginalCurve(asset_class=cls, points=points))

    return BondSweepResponse(
        asset_classes=active_classes,
        optimal=optimal,
        top_combos=ranked,
        marginals=marginals,
        target_year=target_year,
        total_combos_tested=len(results),
    )

