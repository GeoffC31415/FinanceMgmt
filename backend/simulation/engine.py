from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np

from backend.simulation.entities import (
    ExpenseItem,
    MortgageAccount,
    PensionPot,
    PersonEntity,
    SalaryIncome,
    StatePension,
)
from backend.simulation.entities.asset import AssetAccount
from backend.simulation.entities.base import SimContext
from backend.simulation.results import RunResult, SimulationResults, YearlySnapshot
from backend.simulation.tax import TaxCalculator
from backend.simulation.tax.pension_drawdown import calculate_pension_drawdown
from backend.simulation.tax.withdrawals import calculate_gia_withdrawal, calculate_tax_free_withdrawal


@dataclass(frozen=True)
class SimulationAssumptions:
    inflation_rate: float = 0.02
    equity_return_mean: float = 0.05
    equity_return_std: float = 0.10
    isa_annual_limit: float = 20_000.0
    state_pension_annual: float = 11_500.0
    cgt_annual_allowance: float = 3_000.0
    cgt_rate: float = 0.10
    emergency_fund_months: float = 6.0


@dataclass(frozen=True)
class SimulationScenario:
    start_year: int
    end_year: int
    people: list[PersonEntity]
    salary_by_person: dict[str, SalaryIncome]
    pension_by_person: dict[str, PensionPot]

    assets: list[AssetAccount]
    mortgage: MortgageAccount | None
    expenses: list[ExpenseItem]

    annual_spend_target: float
    planned_retirement_age_by_person: dict[str, int]

    pension_withdrawal_priority: int = 100

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
    assets: list[AssetAccount],
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

    isa_balance = sum(a.balance for a in assets if a.asset_type == "ISA")
    cash_balance = sum(a.balance for a in assets if a.asset_type == "CASH")
    other_assets_balance = sum(a.balance for a in assets if a.asset_type not in {"ISA", "CASH"})
    
    total_assets = sum(a.balance for a in assets) + pension_balance
    total_liabilities = mortgage_balance
    net_worth = total_assets - total_liabilities

    salary_gross = cash_flows.get("salary_gross", 0.0)
    pension_contributions = cash_flows.get("pension_contributions", 0.0)

    income_tax_paid = tax_breakdown.get("income_tax_paid", 0.0)
    ni_paid = tax_breakdown.get("ni_paid", 0.0)
    total_tax = income_tax_paid + ni_paid

    state_pension_income = cash_flows.get("state_pension_income", 0.0)
    pension_income = cash_flows.get("pension_income", 0.0)

    # Sum all investment returns from assets
    investment_returns = sum(
        cash_flows.get(f"{asset.name}_investment_return", 0.0) for asset in assets
    ) + cash_flows.get("pension_investment_return", 0.0)

    total_income = cash_flows.get("salary_net", 0.0) + pension_income + state_pension_income
    mortgage_payment = cash_flows.get("mortgage_payment", 0.0)
    total_expenses = cash_flows.get("expenses", 0.0) + mortgage_payment + annual_spend

    salary_net = cash_flows.get("salary_net", 0.0)

    is_depleted = total_assets <= 0
    mortgage_paid_off = mortgage is None or mortgage.balance <= 0

    return YearlySnapshot(
        year=year,
        ages=ages,
        isa_balance=isa_balance,
        pension_balance=pension_balance,
        cash_balance=cash_balance,
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

    assets = [
        AssetAccount(
            name=asset.name,
            asset_type=getattr(asset, "asset_type", "GIA"),
            withdrawal_priority=getattr(asset, "withdrawal_priority", 100),
            balance=asset.balance,
            annual_contribution=asset.annual_contribution,
            growth_rate_mean=asset.growth_rate_mean,
            growth_rate_std=asset.growth_rate_std,
            contributions_end_at_retirement=asset.contributions_end_at_retirement,
            cost_basis=getattr(asset, "cost_basis", asset.balance),
        )
        for asset in scenario.assets
    ]
    
    # Find/create cash asset for cash flow management
    cash_assets = [a for a in assets if a.asset_type == "CASH"]
    if not cash_assets:
        assets.append(
            AssetAccount(
                name="Cash",
                asset_type="CASH",
                withdrawal_priority=0,
                balance=0.0,
                annual_contribution=0.0,
                growth_rate_mean=0.0,
                growth_rate_std=0.0,
                contributions_end_at_retirement=False,
                cost_basis=0.0,
            )
        )
        cash_assets = [a for a in assets if a.asset_type == "CASH"]
    primary_cash = cash_assets[0]
    
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

        for asset in assets:
            asset.begin_year()

        # Salary + pension contributions (assume only while not retired)
        salary_gross_total = 0.0
        employee_pension_total = 0.0
        employer_pension_total = 0.0
        is_all_retired = all(person.is_retired_in_year(year=year) for person in people) if people else False

        for person in people:
            is_retired = person.is_retired_in_year(year=year)
            salary = salary_by_person.get(person.key)
            if salary is None:
                continue
            if is_retired:
                continue

            salary.step(context=context)
            salary_gross_total += salary.get_cash_flows().get("salary_gross", 0.0)

            employee_contrib = salary.gross_annual * salary.employee_pension_pct
            employer_contrib = salary.gross_annual * salary.employer_pension_pct
            employee_pension_total += employee_contrib
            employer_pension_total += employer_contrib

            pension = pension_by_person.get(person.key)
            if pension is not None:
                pension.contribute(amount=employee_contrib + employer_contrib)

        tax_breakdown = tax.calculate_for_salary(
            gross_salary=salary_gross_total,
            employee_pension_contribution=employee_pension_total,
        )
        salary_net = salary_gross_total - tax_breakdown.total_tax - employee_pension_total

        # Step pensions
        for pension in pension_by_person.values():
            # Use default equity return for pensions (can be made configurable later)
            pension.annual_return = float(
                rng.normal(loc=scenario.assumptions.equity_return_mean, scale=scenario.assumptions.equity_return_std)
            )

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
        annual_spend = scenario.annual_spend_target if is_all_retired else 0.0

        # Calculate expenses before pension drawdown
        expense_total = sum(e.get_cash_flows().get("expenses", 0.0) for e in expenses)
        mortgage_payment = mortgage.get_cash_flows().get("mortgage_payment", 0.0) if mortgage is not None else 0.0
        total_outflows = expense_total + mortgage_payment + annual_spend

        # Cashflow allocator
        pension_income_net = 0.0
        pension_income_tax = 0.0
        cgt_paid = 0.0
        cgt_allowance_remaining = scenario.assumptions.cgt_annual_allowance

        # Start with cash inflows/outflows
        primary_cash.balance += salary_net + state_pension_income
        primary_cash.balance -= total_outflows

        # If cash negative, withdraw from assets (user-defined priority) and then pension (if needed)
        if primary_cash.balance < 0:
            remaining_shortfall = -primary_cash.balance

            withdrawal_assets = sorted(
                [a for a in assets if a.asset_type != "CASH"],
                key=lambda a: (a.withdrawal_priority, a.name.lower()),
            )

            # Insert pension as a synthetic source based on scenario.pension_withdrawal_priority
            # by splitting the process: withdraw non-pension assets first, then pension, then remaining assets.
            for asset in withdrawal_assets:
                if remaining_shortfall <= 0:
                    break

                if asset.asset_type == "ISA":
                    res = calculate_tax_free_withdrawal(requested=remaining_shortfall, balance=asset.balance)
                    asset.withdraw(amount=res.gross_withdrawal)
                    primary_cash.balance += res.net_withdrawal
                    remaining_shortfall -= res.net_withdrawal
                    continue

                if asset.asset_type == "GIA":
                    res = calculate_gia_withdrawal(
                        requested=remaining_shortfall,
                        balance=asset.balance,
                        cost_basis=asset.cost_basis,
                        cgt_allowance_remaining=cgt_allowance_remaining,
                        cgt_rate=scenario.assumptions.cgt_rate,
                    )
                    asset.withdraw(amount=res.gross_withdrawal)
                    cgt_allowance_remaining = res.cgt_allowance_remaining
                    cgt_paid += res.tax_paid
                    primary_cash.balance += res.net_withdrawal
                    remaining_shortfall -= res.net_withdrawal
                    continue

                # Unknown types treated as tax-free (safe default)
                res = calculate_tax_free_withdrawal(requested=remaining_shortfall, balance=asset.balance)
                asset.withdraw(amount=res.gross_withdrawal)
                primary_cash.balance += res.net_withdrawal
                remaining_shortfall -= res.net_withdrawal

            if remaining_shortfall > 0 and pension_by_person:
                total_pension_balance = sum(p.balance for p in pension_by_person.values())
                if total_pension_balance > 0:
                    drawdown_result = calculate_pension_drawdown(
                        target_net_income=remaining_shortfall,
                        other_taxable_income=state_pension_income,
                        pension_balance=total_pension_balance,
                    )
                    pension_income_net += drawdown_result.net_income
                    pension_income_tax += drawdown_result.tax_paid
                    primary_cash.balance += drawdown_result.net_income
                    remaining_shortfall -= drawdown_result.net_income

                    if drawdown_result.gross_withdrawal > 0 and total_pension_balance > 0:
                        for pension in pension_by_person.values():
                            proportion = pension.balance / total_pension_balance
                            pension.withdraw(amount=drawdown_result.gross_withdrawal * proportion)

            # Clamp cash at 0 if we couldn't cover everything
            if primary_cash.balance < 0:
                primary_cash.balance = 0.0

        # If cash above emergency fund, save excess in tax-optimal order: ISA (to limit) then GIA
        monthly_outflows = total_outflows / 12.0 if total_outflows > 0 else 0.0
        emergency_target = monthly_outflows * scenario.assumptions.emergency_fund_months

        investable = max(0.0, primary_cash.balance - emergency_target)
        if investable > 0:
            # ISA first (up to annual limit)
            isa_assets = [a for a in assets if a.asset_type == "ISA"]
            isa_remaining = scenario.assumptions.isa_annual_limit

            # Allocate across ISA assets using their annual_contribution as a per-year cap (if > 0).
            for isa in sorted(isa_assets, key=lambda a: (-a.annual_contribution, a.name.lower())):
                if investable <= 0 or isa_remaining <= 0:
                    break
                cap = isa.annual_contribution if isa.annual_contribution > 0 else isa_remaining
                amount = min(investable, isa_remaining, cap)
                if amount <= 0:
                    continue
                isa.deposit(amount=amount)
                primary_cash.balance -= amount
                investable -= amount
                isa_remaining -= amount

            # Then GIA (remainder), respecting annual_contribution caps if provided
            gia_assets = [a for a in assets if a.asset_type == "GIA"]
            for gia in sorted(gia_assets, key=lambda a: (-a.annual_contribution, a.name.lower())):
                if investable <= 0:
                    break
                cap = gia.annual_contribution if gia.annual_contribution > 0 else investable
                amount = min(investable, cap)
                if amount <= 0:
                    continue
                gia.deposit(amount=amount)
                primary_cash.balance -= amount
                investable -= amount

        # Apply growth at end of year
        for asset in assets:
            asset.apply_growth(context=context)
        for pension in pension_by_person.values():
            pension.step(context=context)

        # Collect cash flows from all assets
        asset_cash_flows = {}
        for asset in assets:
            asset_cf = asset.get_cash_flows()
            asset_cash_flows.update(asset_cf)

        # Total income tax includes salary tax + pension income tax + CGT (simplified reporting)
        total_income_tax = tax_breakdown.income_tax + pension_income_tax + cgt_paid

        cash_flows = {
            "salary_gross": salary_gross_total,
            "salary_net": salary_net,
            "expenses": expense_total,
            "mortgage_payment": mortgage_payment,
            "pension_contributions": employee_pension_total + employer_pension_total,
            "state_pension_income": state_pension_income,
            "pension_investment_return": sum(p.get_cash_flows().get("pension_investment_return", 0.0) for p in pension_by_person.values()),
            "pension_income": pension_income_net,
            **asset_cash_flows,
        }
        tax_out = {"income_tax_paid": total_income_tax, "ni_paid": tax_breakdown.national_insurance}

        snapshot = _safe_yearly_snapshot(
            year=year,
            people=people,
            assets=assets,
            pension_by_person=pension_by_person,
            mortgage=mortgage,
            cash_flows=cash_flows,
            tax_breakdown=tax_out,
            annual_spend=annual_spend,
        )
        snapshots.append(snapshot)

    return RunResult(snapshots=snapshots)

