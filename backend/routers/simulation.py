from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.dependencies import get_db_session
from backend.models import Asset, Expense, Income, Mortgage, Person, Scenario
from backend.schemas.simulation import (
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
    run_monte_carlo,
)
from backend.simulation.engine import run_with_cached_returns
from backend.simulation.engine_fast import FastEngineConfig, run_with_cached_returns_fast
from backend.simulation.returns_cache import create_session, get_session
from backend.simulation.entities import ExpenseItem, GiftIncome, MortgageAccount, PensionPot, PersonEntity, RentalIncome, SalaryIncome
from backend.simulation.entities.asset import AssetAccount

router = APIRouter()


@router.get("/health")
async def simulation_health() -> dict[str, str]:
    return {"status": "ok"}


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
    assumptions = SimulationAssumptions(
        inflation_rate=_coerce_float(assumptions_json.get("inflation_rate"), 0.02),
        isa_annual_limit=_coerce_float(assumptions_json.get("isa_annual_limit"), 20_000.0),
        state_pension_annual=_coerce_float(assumptions_json.get("state_pension_annual"), 11_500.0),
        cgt_annual_allowance=_coerce_float(assumptions_json.get("cgt_annual_allowance"), 3_000.0),
        cgt_rate=_coerce_float(assumptions_json.get("cgt_rate"), 0.10),
        emergency_fund_months=_coerce_float(assumptions_json.get("emergency_fund_months"), 6.0),
        pension_access_age=_coerce_int(assumptions_json.get("pension_access_age"), 55),
        debt_interest_rate=_coerce_float(assumptions_json.get("debt_interest_rate"), 0.08),
        bankruptcy_threshold=_coerce_float(assumptions_json.get("bankruptcy_threshold"), -100_000.0),
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
            rental_incomes.append(
                RentalIncome(
                    gross_annual=income.gross_annual,
                    annual_growth_rate=income.annual_growth_rate,
                    start_year=income.start_year,
                    end_year=income.end_year,
                )
            )
        elif income.kind == "gift":
            # Gift income: completely tax-free
            gift_incomes.append(
                GiftIncome(
                    gross_annual=income.gross_annual,
                    annual_growth_rate=income.annual_growth_rate,
                    start_year=income.start_year,
                    end_year=income.end_year,
                )
            )

    pension_by_person: dict[str, PensionPot] = {}
    assets: list[AssetAccount] = []
    pension_withdrawal_priority = 100

    for asset in scenario.assets:
        asset_type = getattr(asset, "asset_type", None) or ("PENSION" if "pension" in asset.name.lower() else "GIA")
        withdrawal_priority = getattr(asset, "withdrawal_priority", 100)

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
async def run_simulation(payload: SimulationRequest, session: AsyncSession = Depends(get_db_session)) -> SimulationResponse:
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

    results = run_monte_carlo(scenario=sim_scenario, iterations=payload.iterations, seed=payload.seed)

    years = [s.year for s in results.runs[0].snapshots] if results.runs else []
    
    # Helper function to extract matrix for a field
    def get_matrix(field_name: str) -> np.ndarray:
        return np.array([[getattr(s, field_name) for s in run.snapshots] for run in results.runs], dtype=float)
    
    # Helper function to get median
    def get_median(field_name: str) -> list[float]:
        matrix = get_matrix(field_name)
        return np.median(matrix, axis=0).tolist() if matrix.size else []
    
    # Helper function to get percentage (for boolean fields)
    def get_percentage(field_name: str) -> list[float]:
        matrix = np.array([[float(getattr(s, field_name)) for s in run.snapshots] for run in results.runs], dtype=float)
        return (np.mean(matrix, axis=0) * 100).tolist() if matrix.size else []

    net_worth_matrix = get_matrix("net_worth")
    
    if net_worth_matrix.size:
        p10 = np.percentile(net_worth_matrix, 10, axis=0).tolist()
        median = np.median(net_worth_matrix, axis=0).tolist()
        p90 = np.percentile(net_worth_matrix, 90, axis=0).tolist()
    else:
        p10 = []
        median = []
        p90 = []

    retirement_years = _retirement_years_from_people(people=sim_scenario.people)
    n_years = len(years)

    # Slow /run endpoint doesn't currently track per-type flows; return 0s.
    zeros = [0.0] * n_years
    isa_balance_median = get_median("isa_balance")
    pension_balance_median = get_median("pension_balance")
    cash_balance_median = get_median("cash_balance")
    total_assets_median = get_median("total_assets")

    def _value_at(values: list[float], idx: int) -> float:
        return float(values[idx]) if idx < len(values) else 0.0

    gia_balance_median = [
        _value_at(total_assets_median, i)
        - _value_at(isa_balance_median, i)
        - _value_at(pension_balance_median, i)
        - _value_at(cash_balance_median, i)
        for i in range(n_years)
    ]

    return SimulationResponse(
        years=years,
        net_worth_p10=p10,
        net_worth_median=median,
        net_worth_p90=p90,
        income_median=get_median("total_income"),
        spend_median=get_median("total_expenses"),
        retirement_years=retirement_years,
        inflation_rate=sim_scenario.assumptions.inflation_rate,
        start_year=sim_scenario.start_year,
        # Detailed incomes
        salary_gross_median=get_median("salary_gross"),
        salary_net_median=get_median("salary_net"),
        rental_income_median=get_median("rental_income"),
        gift_income_median=get_median("gift_income"),
        pension_income_median=get_median("pension_income"),
        state_pension_income_median=get_median("state_pension_income"),
        investment_returns_median=get_median("investment_returns"),
        total_income_median=get_median("total_income"),
        # Detailed expenses
        total_expenses_median=get_median("total_expenses"),
        mortgage_payment_median=get_median("mortgage_payment"),
        pension_contributions_median=get_median("pension_contributions"),
        fun_fund_median=get_median("fun_fund"),
        # Tax
        income_tax_paid_median=get_median("income_tax_paid"),
        ni_paid_median=get_median("ni_paid"),
        total_tax_median=get_median("total_tax"),
        # Assets
        isa_balance_median=isa_balance_median,
        pension_balance_median=pension_balance_median,
        cash_balance_median=cash_balance_median,
        gia_balance_median=gia_balance_median,
        total_assets_median=total_assets_median,
        # Asset-type performance and flows (not available on slow engine)
        isa_returns_median=zeros,
        gia_returns_median=zeros,
        cash_returns_median=zeros,
        pension_returns_median=zeros,
        isa_contributions_median=zeros,
        gia_contributions_median=zeros,
        isa_withdrawals_median=zeros,
        gia_withdrawals_median=zeros,
        pension_withdrawals_median=zeros,
        # Liabilities
        mortgage_balance_median=get_median("mortgage_balance"),
        total_liabilities_median=get_median("total_liabilities"),
        # Other
        mortgage_paid_off_median=get_percentage("mortgage_paid_off"),
        is_depleted_median=get_percentage("is_depleted"),
        is_bankrupt_median=get_percentage("is_bankrupt"),
        debt_balance_median=get_median("debt_balance"),
        debt_interest_paid_median=get_median("debt_interest_paid"),
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

    use_fast = getattr(payload, "use_fast_engine", True)
    mats = run_with_cached_returns_fast(
        scenario=sim_scenario,
        returns=cached.returns,
        config=FastEngineConfig(enable_numba=use_fast),
    )
    response = _response_from_matrices(
        years=mats.years,
        mats=mats.fields,
        people=sim_scenario.people,
        inflation_rate=sim_scenario.assumptions.inflation_rate,
        start_year=sim_scenario.start_year,
    )
    return SimulationInitResponse(session_id=session_id, **response.model_dump())


@router.post("/recalc", response_model=SimulationResponse)
async def recalc_simulation(
    payload: SimulationRecalcRequest,
) -> SimulationResponse:
    cached = get_session(session_id=payload.session_id)
    if cached is None:
        raise HTTPException(status_code=404, detail="Simulation session not found (expired?)")

    base = cached.base_scenario
    retirement_age_offset = int(payload.retirement_age_offset or 0)

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

    sim_scenario = SimulationScenario(
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
        annual_spend_target=float(payload.annual_spend_target) if payload.annual_spend_target is not None else base.annual_spend_target,
        planned_retirement_age_by_person={
            p.key: p.planned_retirement_age
            for p in people
            if not p.is_child and p.planned_retirement_age is not None
        },
        pension_withdrawal_priority=base.pension_withdrawal_priority,
        assumptions=base.assumptions,
    )

    use_fast = getattr(payload, "use_fast_engine", True)
    mats = run_with_cached_returns_fast(
        scenario=sim_scenario,
        returns=cached.returns,
        config=FastEngineConfig(enable_numba=use_fast),
    )
    pct = payload.percentile if payload.percentile is not None else 50
    return _response_from_matrices(
        years=mats.years,
        mats=mats.fields,
        people=sim_scenario.people,
        inflation_rate=sim_scenario.assumptions.inflation_rate,
        start_year=sim_scenario.start_year,
        pct=pct,
    )

