from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.dependencies import get_db_session
from backend.models import Asset, Expense, Income, Mortgage, Person, Scenario
from backend.schemas.simulation import SimulationRequest, SimulationResponse
import numpy as np

from backend.simulation.engine import (
    SimulationAssumptions,
    SimulationScenario,
    run_monte_carlo,
)
from backend.simulation.entities import Cash, ExpenseItem, IsaAccount, MortgageAccount, PensionPot, PersonEntity, SalaryIncome

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


@router.post("/run", response_model=SimulationResponse)
async def run_simulation(payload: SimulationRequest, session: AsyncSession = Depends(get_db_session)) -> SimulationResponse:
    result = await session.execute(_scenario_query().where(Scenario.id == payload.scenario_id))
    scenario = result.scalars().unique().first()
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if len(scenario.people) == 0:
        raise HTTPException(status_code=400, detail="Scenario must have at least one person")

    # Assumptions (basic UK defaults, plus user overrides from JSON)
    assumptions_json = scenario.assumptions or {}
    assumptions = SimulationAssumptions(
        inflation_rate=_coerce_float(assumptions_json.get("inflation_rate"), 0.02),
        equity_return_mean=_coerce_float(assumptions_json.get("equity_return_mean"), 0.05),
        equity_return_std=_coerce_float(assumptions_json.get("equity_return_std"), 0.10),
        isa_annual_limit=_coerce_float(assumptions_json.get("isa_annual_limit"), 20_000.0),
        state_pension_annual=_coerce_float(assumptions_json.get("state_pension_annual"), 11_500.0),
    )

    start_year = _coerce_int(assumptions_json.get("start_year"), date.today().year)
    end_year_default = _coerce_int(assumptions_json.get("end_year"), start_year + 60)
    end_year = payload.end_year if payload.end_year is not None else end_year_default

    annual_spend_default = _coerce_float(assumptions_json.get("annual_spend_target"), 0.0)
    annual_spend_target = payload.annual_spend_target if payload.annual_spend_target is not None else annual_spend_default

    people = [
        PersonEntity(
            key=person.label,
            birth_date=person.birth_date,
            planned_retirement_age=person.planned_retirement_age,
            state_pension_age=person.state_pension_age,
        )
        for person in scenario.people
    ]

    salary_by_person: dict[str, SalaryIncome] = {}
    for income in scenario.incomes:
        if income.kind != "salary":
            continue
        # If person_id missing, attach to first person (simple default).
        person_key = next((p.label for p in scenario.people if p.id == income.person_id), scenario.people[0].label)
        salary_by_person[person_key] = SalaryIncome(
            gross_annual=income.gross_annual,
            annual_growth_rate=income.annual_growth_rate,
            employee_pension_pct=income.employee_pension_pct,
            employer_pension_pct=income.employer_pension_pct,
        )

    pension_by_person: dict[str, PensionPot] = {}
    isa_balance = 0.0
    isa_contrib = 0.0
    cash_balance = 0.0
    cash_interest = _coerce_float(assumptions_json.get("cash_interest_rate"), 0.0)

    for asset in scenario.assets:
        if asset.kind == "pension":
            person_key = next((p.label for p in scenario.people if p.id == asset.person_id), scenario.people[0].label)
            pension_by_person[person_key] = PensionPot(balance=asset.balance)
        if asset.kind == "isa":
            isa_balance += asset.balance
            isa_contrib += asset.annual_contribution
        if asset.kind == "cash":
            cash_balance += asset.balance

    mortgage = None
    if scenario.mortgage is not None:
        mortgage = MortgageAccount(
            balance=scenario.mortgage.balance,
            annual_interest_rate=scenario.mortgage.annual_interest_rate,
            monthly_payment=scenario.mortgage.monthly_payment,
            months_remaining=scenario.mortgage.months_remaining,
        )

    expenses = [
        ExpenseItem(
            name=expense.name,
            annual_amount=expense.monthly_amount * 12.0,
            is_inflation_linked=expense.is_inflation_linked,
        )
        for expense in scenario.expenses
    ]

    sim_scenario = SimulationScenario(
        start_year=start_year,
        end_year=end_year,
        people=people,
        salary_by_person=salary_by_person,
        pension_by_person=pension_by_person,
        isa=IsaAccount(balance=isa_balance, annual_contribution=min(assumptions.isa_annual_limit, isa_contrib)),
        cash=Cash(balance=cash_balance, annual_interest_rate=cash_interest),
        mortgage=mortgage,
        expenses=expenses,
        annual_spend_target=annual_spend_target,
        planned_retirement_age_by_person={p.key: p.planned_retirement_age for p in people},
        assumptions=assumptions,
    )

    results = run_monte_carlo(scenario=sim_scenario, iterations=payload.iterations, seed=payload.seed)

    years = [s.year for s in results.runs[0].snapshots] if results.runs else []
    net_worth_matrix = np.array([[s.net_worth for s in run.snapshots] for run in results.runs], dtype=float)
    income_matrix = np.array([[s.total_income for s in run.snapshots] for run in results.runs], dtype=float)
    spend_matrix = np.array([[s.total_expenses for s in run.snapshots] for run in results.runs], dtype=float)

    if net_worth_matrix.size:
        p10 = np.percentile(net_worth_matrix, 10, axis=0).tolist()
        median = np.median(net_worth_matrix, axis=0).tolist()
        p90 = np.percentile(net_worth_matrix, 90, axis=0).tolist()
        income_median = np.median(income_matrix, axis=0).tolist()
        spend_median = np.median(spend_matrix, axis=0).tolist()
    else:
        p10 = []
        median = []
        p90 = []
        income_median = []
        spend_median = []

    retirement_years = sorted({person.birth_date.year + person.planned_retirement_age for person in scenario.people})

    return SimulationResponse(
        years=years,
        net_worth_p10=p10,
        net_worth_median=median,
        net_worth_p90=p90,
        income_median=income_median,
        spend_median=spend_median,
        retirement_years=retirement_years,
    )

