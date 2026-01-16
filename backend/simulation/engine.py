from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np

from backend.simulation.entities import (
    Cash,
    ExpenseItem,
    IsaAccount,
    MortgageAccount,
    PensionPot,
    PersonEntity,
    SalaryIncome,
    StatePension,
)
from backend.simulation.entities.base import SimContext
from backend.simulation.results import RunResult, SimulationResults, YearlySnapshot
from backend.simulation.tax import TaxCalculator


@dataclass(frozen=True)
class SimulationAssumptions:
    inflation_rate: float = 0.02
    equity_return_mean: float = 0.05
    equity_return_std: float = 0.10
    isa_annual_limit: float = 20_000.0
    state_pension_annual: float = 11_500.0


@dataclass(frozen=True)
class SimulationScenario:
    start_year: int
    end_year: int
    people: list[PersonEntity]
    salary_by_person: dict[str, SalaryIncome]
    pension_by_person: dict[str, PensionPot]

    isa: IsaAccount
    cash: Cash
    mortgage: MortgageAccount | None
    expenses: list[ExpenseItem]

    annual_spend_target: float
    planned_retirement_age_by_person: dict[str, int]

    assumptions: SimulationAssumptions = SimulationAssumptions()


def _sum_dicts(items: list[dict[str, float]]) -> dict[str, float]:
    out: dict[str, float] = {}
    for item in items:
        for k, v in item.items():
            out[k] = out.get(k, 0.0) + float(v)
    return out


def _safe_yearly_snapshot(
    *,
    year: int,
    people: list[PersonEntity],
    isa: IsaAccount,
    cash: Cash,
    pension_by_person: dict[str, PensionPot],
    mortgage: MortgageAccount | None,
    cash_flows: dict[str, float],
    tax_breakdown: dict[str, float],
    annual_spend: float,
) -> YearlySnapshot:
    ages = {p.key: p.age_in_year(year=year) for p in people}
    is_retired = {p.key: p.is_retired_in_year(year=year) for p in people}

    pension_balance = sum(p.balance for p in pension_by_person.values())
    mortgage_balance = mortgage.balance if mortgage is not None else 0.0

    total_assets = isa.balance + cash.balance + pension_balance
    total_liabilities = mortgage_balance
    net_worth = total_assets - total_liabilities

    salary_gross = cash_flows.get("salary_gross", 0.0)
    pension_contributions = cash_flows.get("pension_contributions", 0.0)

    income_tax_paid = tax_breakdown.get("income_tax_paid", 0.0)
    ni_paid = tax_breakdown.get("ni_paid", 0.0)
    total_tax = income_tax_paid + ni_paid

    state_pension_income = cash_flows.get("state_pension_income", 0.0)
    pension_income = cash_flows.get("pension_income", 0.0)

    investment_returns = (
        cash_flows.get("isa_investment_return", 0.0)
        + cash_flows.get("pension_investment_return", 0.0)
        + cash_flows.get("cash_interest", 0.0)
    )

    total_income = cash_flows.get("salary_net", 0.0) + pension_income + state_pension_income
    mortgage_payment = cash_flows.get("mortgage_payment", 0.0)
    total_expenses = cash_flows.get("expenses", 0.0) + mortgage_payment + annual_spend

    salary_net = cash_flows.get("salary_net", 0.0)

    is_depleted = cash.balance <= 0 and isa.balance <= 0 and pension_balance <= 0
    mortgage_paid_off = mortgage is None or mortgage.balance <= 0

    return YearlySnapshot(
        year=year,
        ages=ages,
        isa_balance=isa.balance,
        pension_balance=pension_balance,
        cash_balance=cash.balance,
        total_assets=total_assets,
        mortgage_balance=mortgage_balance,
        total_liabilities=total_liabilities,
        net_worth=net_worth,
        salary_gross=salary_gross,
        salary_net=salary_net,
        pension_income=pension_income,
        state_pension_income=state_pension_income,
        investment_returns=investment_returns,
        total_income=total_income,
        total_expenses=total_expenses,
        mortgage_payment=mortgage_payment,
        pension_contributions=pension_contributions,
        income_tax_paid=income_tax_paid,
        ni_paid=ni_paid,
        total_tax=total_tax,
        is_retired=is_retired,
        mortgage_paid_off=mortgage_paid_off,
        is_depleted=is_depleted,
    )


def run_monte_carlo(
    *,
    scenario: SimulationScenario,
    iterations: int,
    seed: int = 0,
) -> SimulationResults:
    rng = np.random.default_rng(seed)
    runs: list[RunResult] = []

    for _ in range(iterations):
        run_seed = int(rng.integers(0, 2**31 - 1))
        run = _simulate_single_run(scenario=scenario, seed=run_seed)
        runs.append(run)

    return SimulationResults(runs=runs)


def _simulate_single_run(*, scenario: SimulationScenario, seed: int) -> RunResult:
    rng = np.random.default_rng(seed)
    tax = TaxCalculator()

    # Clone entity state per run (keep it simple: copy scalars)
    people = [PersonEntity(**p.__dict__) for p in scenario.people]
    salary_by_person = {k: SalaryIncome(**v.__dict__) for k, v in scenario.salary_by_person.items()}
    pension_by_person = {k: PensionPot(**v.__dict__) for k, v in scenario.pension_by_person.items()}

    isa = IsaAccount(balance=scenario.isa.balance, annual_contribution=scenario.isa.annual_contribution)
    cash = Cash(balance=scenario.cash.balance, annual_interest_rate=scenario.cash.annual_interest_rate)
    mortgage = None
    if scenario.mortgage is not None:
        mortgage = MortgageAccount(
            balance=scenario.mortgage.balance,
            annual_interest_rate=scenario.mortgage.annual_interest_rate,
            monthly_payment=scenario.mortgage.monthly_payment,
            months_remaining=scenario.mortgage.months_remaining,
        )
    expenses = [ExpenseItem(**e.__dict__) for e in scenario.expenses]

    snapshots: list[YearlySnapshot] = []

    for year in range(scenario.start_year, scenario.end_year + 1):
        context = SimContext(year=year, inflation_rate=scenario.assumptions.inflation_rate, rng=rng)

        # Sample annual return for equity-like assets (ISA + pensions). (Simplified)
        annual_return = float(
            rng.normal(loc=scenario.assumptions.equity_return_mean, scale=scenario.assumptions.equity_return_std)
        )

        # Salary + pension contributions (assume only while not retired)
        salary_gross_total = 0.0
        employee_pension_total = 0.0
        employer_pension_total = 0.0

        for person in people:
            is_retired = person.is_retired_in_year(year=year)
            salary = salary_by_person.get(person.key)
            if salary is None:
                continue
            if is_retired:
                continue

            salary.step(context=context)
            salary_gross_total += salary.get_cash_flows().get("salary_gross", 0.0)

            employee_pension_total += salary.gross_annual * salary.employee_pension_pct
            employer_pension_total += salary.gross_annual * salary.employer_pension_pct

            pension = pension_by_person.get(person.key)
            if pension is not None:
                pension.contribute(amount=employee_pension_total + employer_pension_total)

        tax_breakdown = tax.calculate_for_salary(
            gross_salary=salary_gross_total,
            employee_pension_contribution=employee_pension_total,
        )
        salary_net = salary_gross_total - tax_breakdown.total_tax - employee_pension_total

        # Apply returns
        isa.annual_return = annual_return
        isa.step(context=context)
        for pension in pension_by_person.values():
            pension.annual_return = annual_return
            pension.step(context=context)
        cash.step(context=context)

        # Mortgage + expenses
        if mortgage is not None:
            mortgage.step(context=context)
        for expense in expenses:
            expense.step(context=context)

        # State pension income (simplified)
        state_pension_income = 0.0
        for person in people:
            if person.is_state_pension_eligible_in_year(year=year):
                state_pension_income += scenario.assumptions.state_pension_annual

        # Retirement spending target (simplified: once all retired)
        is_all_retired = all(person.is_retired_in_year(year=year) for person in people) if people else False
        annual_spend = scenario.annual_spend_target if is_all_retired else 0.0

        # Cash flow: deposit salary/state pension into cash; withdraw expenses/spend from cash
        cash.balance += salary_net + state_pension_income

        expense_total = sum(e.get_cash_flows().get("expenses", 0.0) for e in expenses)
        mortgage_payment = mortgage.get_cash_flows().get("mortgage_payment", 0.0) if mortgage is not None else 0.0
        total_outflows = expense_total + mortgage_payment + annual_spend
        cash.balance -= total_outflows

        cash_flows = {
            "salary_gross": salary_gross_total,
            "salary_net": salary_net,
            "expenses": expense_total,
            "mortgage_payment": mortgage_payment,
            "pension_contributions": employee_pension_total + employer_pension_total,
            "state_pension_income": state_pension_income,
            "isa_investment_return": isa.get_cash_flows().get("isa_investment_return", 0.0),
            "pension_investment_return": sum(p.get_cash_flows().get("pension_investment_return", 0.0) for p in pension_by_person.values()),
            "cash_interest": cash.get_cash_flows().get("cash_interest", 0.0),
            "pension_income": 0.0,
        }
        tax_out = {"income_tax_paid": tax_breakdown.income_tax, "ni_paid": tax_breakdown.national_insurance}

        snapshot = _safe_yearly_snapshot(
            year=year,
            people=people,
            isa=isa,
            cash=cash,
            pension_by_person=pension_by_person,
            mortgage=mortgage,
            cash_flows=cash_flows,
            tax_breakdown=tax_out,
            annual_spend=annual_spend,
        )
        snapshots.append(snapshot)

    return RunResult(snapshots=snapshots)

