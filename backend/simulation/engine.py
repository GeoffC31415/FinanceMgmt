from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np

from backend.simulation.entities import (
    ExpenseItem,
    GiftIncome,
    MortgageAccount,
    PensionPot,
    PersonEntity,
    RentalIncome,
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
    isa_annual_limit: float = 20_000.0
    state_pension_annual: float = 11_500.0
    cgt_annual_allowance: float = 3_000.0
    cgt_rate: float = 0.10
    emergency_fund_months: float = 6.0
    pension_access_age: int = 55  # UK minimum private pension access age


@dataclass(frozen=True)
class SimulationScenario:
    start_year: int
    end_year: int
    people: list[PersonEntity]
    salary_by_person: dict[str, list[SalaryIncome]]
    pension_by_person: dict[str, PensionPot]

    assets: list[AssetAccount]
    mortgage: MortgageAccount | None
    expenses: list[ExpenseItem]

    # Additional income types (not tied to retirement)
    rental_incomes: list[RentalIncome] = None  # type: ignore[assignment]
    gift_incomes: list[GiftIncome] = None  # type: ignore[assignment]

    annual_spend_target: float = 0.0
    planned_retirement_age_by_person: dict[str, int] = None  # type: ignore[assignment]

    pension_withdrawal_priority: int = 100

    assumptions: SimulationAssumptions = SimulationAssumptions()

    def __post_init__(self) -> None:
        # Initialize mutable defaults properly for frozen dataclass
        if self.rental_incomes is None:
            object.__setattr__(self, "rental_incomes", [])
        if self.gift_incomes is None:
            object.__setattr__(self, "gift_incomes", [])
        if self.planned_retirement_age_by_person is None:
            object.__setattr__(self, "planned_retirement_age_by_person", {})


@dataclass(frozen=True)
class SimulationRunMatrices:
    """
    Compact simulation output for fast aggregation.

    Each field is shaped (iterations, n_years) and stored as float64.
    Boolean-like outputs are stored as 0.0/1.0 for fast averaging.
    """

    years: list[int]
    fields: dict[str, np.ndarray]


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

    rental_income_net = cash_flows.get("rental_income_net", 0.0)
    gift_income = cash_flows.get("gift_income", 0.0)
    total_income = cash_flows.get("salary_net", 0.0) + rental_income_net + gift_income + pension_income + state_pension_income
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
        rental_income=rental_income_net,
        gift_income=gift_income,
        pension_income=pension_income,
        state_pension_income=state_pension_income,
        investment_returns=investment_returns,
        total_income=total_income,
        total_expenses=total_expenses,
        mortgage_payment=mortgage_payment,
        pension_contributions=pension_contributions,
        fun_fund=annual_spend,
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
    salary_by_person = {k: [SalaryIncome(**s.__dict__) for s in v] for k, v in scenario.salary_by_person.items()}
    pension_by_person = {k: PensionPot(**v.__dict__) for k, v in scenario.pension_by_person.items()}
    rental_incomes = [RentalIncome(**r.__dict__) for r in (scenario.rental_incomes or [])]
    gift_incomes = [GiftIncome(**g.__dict__) for g in (scenario.gift_incomes or [])]

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
        )
    expenses = [ExpenseItem(**e.__dict__) for e in scenario.expenses]

    snapshots: list[YearlySnapshot] = []

    # Pre-compute sorted withdrawal order once per run (assets + pension slot)
    # Pension is represented as None in the list; we check balance at withdrawal time
    # Sort descending by priority (higher priority = withdraw first), then ascending by name
    withdrawal_order: list[tuple[int, str, AssetAccount | None]] = [
        (a.withdrawal_priority, a.name.lower(), a)
        for a in assets
        if a.asset_type != "CASH"
    ]
    withdrawal_order.append((scenario.pension_withdrawal_priority, "pension", None))
    withdrawal_order.sort(key=lambda x: (-x[0], x[1]))

    # Track state pension amount (grows with inflation each year)
    current_state_pension_annual = scenario.assumptions.state_pension_annual

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
            if is_retired:
                continue

            salaries = salary_by_person.get(person.key, [])
            if not salaries:
                continue

            pension = pension_by_person.get(person.key)

            for salary in salaries:
                salary.step(context=context)
                salary_gross_total += salary.get_cash_flows().get("salary_gross", 0.0)

                employee_contrib = salary.gross_annual * salary.employee_pension_pct
                employer_contrib = salary.gross_annual * salary.employer_pension_pct
                employee_pension_total += employee_contrib
                employer_pension_total += employer_contrib

                if pension is not None:
                    pension.contribute(amount=employee_contrib + employer_contrib)

        # Process rental income (taxable as personal income, no NI)
        rental_income_gross = 0.0
        for rental in rental_incomes:
            rental.step(context=context)
            rental_income_gross += rental.get_cash_flows().get("rental_income_gross", 0.0)

        # Process gift income (tax-free)
        gift_income_total = 0.0
        for gift in gift_incomes:
            gift.step(context=context)
            gift_income_total += gift.get_cash_flows().get("gift_income", 0.0)

        # Calculate tax: salary has income tax + NI; rental income has income tax only
        tax_breakdown = tax.calculate_for_salary(
            gross_salary=salary_gross_total,
            employee_pension_contribution=employee_pension_total,
        )
        # Calculate additional income tax on rental income (no NI)
        rental_income_tax = tax.calculate_income_tax_on_additional_income(
            base_taxable_income=salary_gross_total - employee_pension_total,
            additional_income=rental_income_gross,
        )
        salary_net = salary_gross_total - tax_breakdown.total_tax - employee_pension_total
        rental_income_net = rental_income_gross - rental_income_tax

        # Step pensions - use each pension's configured growth rate
        for pension in pension_by_person.values():
            pension.annual_return = float(
                rng.normal(loc=pension.growth_rate_mean, scale=pension.growth_rate_std)
            )

        # Mortgage + expenses
        if mortgage is not None:
            mortgage.step(context=context)
        for expense in expenses:
            expense.step(context=context)

        # State pension income (grows with inflation)
        state_pension_income = 0.0
        for person in people:
            if person.is_state_pension_eligible_in_year(year=year):
                state_pension_income += current_state_pension_annual
        
        # Apply inflation for next year
        current_state_pension_annual *= 1.0 + scenario.assumptions.inflation_rate

        # Calculate expenses before pension drawdown
        expense_total = sum(e.get_cash_flows().get("expenses", 0.0) for e in expenses)
        mortgage_payment = mortgage.get_cash_flows().get("mortgage_payment", 0.0) if mortgage is not None else 0.0

        # Retirement spending target:
        # Treat `annual_spend_target` as an EXTRA discretionary expense added when everyone is retired.
        # This is on top of configured expenses - a "fun money" budget for retirement.
        extra_retirement_spend = 0.0
        if is_all_retired:
            extra_retirement_spend = scenario.annual_spend_target

        total_outflows = expense_total + mortgage_payment + extra_retirement_spend

        # Cashflow allocator
        pension_income_net = 0.0
        pension_income_tax = 0.0
        cgt_paid = 0.0
        cgt_allowance_remaining = scenario.assumptions.cgt_annual_allowance

        # Calculate emergency fund target BEFORE processing cash flows
        monthly_outflows = total_outflows / 12.0 if total_outflows > 0 else 0.0
        emergency_target = monthly_outflows * scenario.assumptions.emergency_fund_months

        # Start with cash inflows/outflows
        # Include: salary (net of tax/NI/pension), rental income (net of income tax), gifts (tax-free), state pension
        primary_cash.balance += salary_net + rental_income_net + gift_income_total + state_pension_income
        primary_cash.balance -= total_outflows

        # If cash below emergency fund target, withdraw from assets to maintain the reserve
        if primary_cash.balance < emergency_target:
            remaining_shortfall = emergency_target - primary_cash.balance

            for priority, name, asset in withdrawal_order:
                if remaining_shortfall <= 0:
                    break

                if asset is not None:
                    # Regular asset withdrawal
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
                else:
                    # Pension withdrawal (synthetic source)
                    # Only include pensions from people who have reached pension access age
                    eligible_pensions = {
                        person_key: pension
                        for person_key, pension in pension_by_person.items()
                        if any(
                            p.key == person_key and p.can_access_pension_in_year(year=year, min_access_age=scenario.assumptions.pension_access_age)
                            for p in people
                        )
                    }
                    current_pension_balance = sum(p.balance for p in eligible_pensions.values())
                    if current_pension_balance > 0:
                        drawdown_result = calculate_pension_drawdown(
                            target_net_income=remaining_shortfall,
                            other_taxable_income=state_pension_income,
                            pension_balance=current_pension_balance,
                        )
                        pension_income_net += drawdown_result.net_income
                        pension_income_tax += drawdown_result.tax_paid
                        primary_cash.balance += drawdown_result.net_income
                        remaining_shortfall -= drawdown_result.net_income

                        if drawdown_result.gross_withdrawal > 0:
                            for pension in eligible_pensions.values():
                                proportion = pension.balance / current_pension_balance
                                pension.withdraw(amount=drawdown_result.gross_withdrawal * proportion)

            # Clamp cash at 0 if we couldn't cover everything (emergency fund depleted)
            if primary_cash.balance < 0:
                primary_cash.balance = 0.0

        # If cash above emergency fund, save excess in tax-optimal order: ISA (to limit) then GIA
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

        # Total income tax includes salary tax + rental income tax + pension income tax + CGT (simplified reporting)
        total_income_tax = tax_breakdown.income_tax + rental_income_tax + pension_income_tax + cgt_paid

        cash_flows = {
            "salary_gross": salary_gross_total,
            "salary_net": salary_net,
            "rental_income_gross": rental_income_gross,
            "rental_income_net": rental_income_net,
            "gift_income": gift_income_total,
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
            annual_spend=extra_retirement_spend,
        )
        snapshots.append(snapshot)

    return RunResult(snapshots=snapshots)


def run_with_cached_returns(
    *,
    scenario: SimulationScenario,
    returns: "ReturnsMatrix",
) -> SimulationRunMatrices:
    """
    Faster Monte Carlo runner:
    - Uses precomputed random returns from `returns`
    - Stores outputs in numpy matrices (no YearlySnapshot objects)

    This is designed for UI-driven "recalc" calls where the stochastic inputs
    stay fixed but scenario parameters (e.g. spending/retirement) change.
    """
    years = list(range(scenario.start_year, scenario.end_year + 1))
    if len(years) != int(returns.asset_returns.shape[1]):
        raise ValueError("Returns matrix year span does not match scenario year span")

    iterations = int(returns.asset_returns.shape[0])

    field_names = [
        "net_worth",
        "salary_gross",
        "salary_net",
        "rental_income",
        "gift_income",
        "pension_income",
        "state_pension_income",
        "investment_returns",
        "total_income",
        "total_expenses",
        "mortgage_payment",
        "pension_contributions",
        "fun_fund",
        "income_tax_paid",
        "ni_paid",
        "total_tax",
        "isa_balance",
        "pension_balance",
        "cash_balance",
        "total_assets",
        "mortgage_balance",
        "total_liabilities",
        "mortgage_paid_off",
        "is_depleted",
    ]

    out: dict[str, np.ndarray] = {name: np.zeros((iterations, len(years)), dtype=np.float64) for name in field_names}
    for it in range(iterations):
        _simulate_single_run_to_matrices(scenario=scenario, returns=returns, iteration_idx=it, out=out)

    return SimulationRunMatrices(years=years, fields=out)


def _apply_asset_growth_with_return(*, asset: AssetAccount, annual_return: float) -> None:
    annual_return_f = float(annual_return)
    # Internal perf shortcut: keep cashflow reporting consistent without calling RNG.
    asset._investment_return = asset.balance * annual_return_f  # type: ignore[attr-defined]
    asset.balance += asset._investment_return


def _simulate_single_run_to_matrices(
    *,
    scenario: SimulationScenario,
    returns: "ReturnsMatrix",
    iteration_idx: int,
    out: dict[str, np.ndarray],
) -> None:
    # Deterministic context; all stochasticity comes from `returns`.
    rng = np.random.default_rng(0)
    tax = TaxCalculator()

    people = [PersonEntity(**p.__dict__) for p in scenario.people]
    salary_by_person = {k: [SalaryIncome(**s.__dict__) for s in v] for k, v in scenario.salary_by_person.items()}
    pension_by_person = {k: PensionPot(**v.__dict__) for k, v in scenario.pension_by_person.items()}
    rental_incomes = [RentalIncome(**r.__dict__) for r in (scenario.rental_incomes or [])]
    gift_incomes = [GiftIncome(**g.__dict__) for g in (scenario.gift_incomes or [])]

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

    if int(returns.asset_returns.shape[2]) != len(assets):
        raise ValueError("Returns matrix asset axis does not match scenario assets (+cash) ordering")

    mortgage = None
    if scenario.mortgage is not None:
        mortgage = MortgageAccount(
            balance=scenario.mortgage.balance,
            annual_interest_rate=scenario.mortgage.annual_interest_rate,
            monthly_payment=scenario.mortgage.monthly_payment,
        )
    expenses = [ExpenseItem(**e.__dict__) for e in scenario.expenses]

    pension_keys = list(getattr(returns, "pension_keys", []))
    pension_returns = getattr(returns, "pension_returns", None)

    # Pre-compute sorted withdrawal order once per run (assets + pension slot)
    # Sort descending by priority (higher priority = withdraw first), then ascending by name
    withdrawal_order: list[tuple[int, str, AssetAccount | None]] = [
        (a.withdrawal_priority, a.name.lower(), a)
        for a in assets
        if a.asset_type != "CASH"
    ]
    withdrawal_order.append((scenario.pension_withdrawal_priority, "pension", None))
    withdrawal_order.sort(key=lambda x: (-x[0], x[1]))

    # Track state pension amount (grows with inflation each year)
    current_state_pension_annual = scenario.assumptions.state_pension_annual

    for year_idx, year in enumerate(range(scenario.start_year, scenario.end_year + 1)):
        context = SimContext(year=year, inflation_rate=scenario.assumptions.inflation_rate, rng=rng)

        for asset in assets:
            asset.begin_year()
        for pension in pension_by_person.values():
            pension.begin_year()

        salary_gross_total = 0.0
        employee_pension_total = 0.0
        employer_pension_total = 0.0
        is_all_retired = all(person.is_retired_in_year(year=year) for person in people) if people else False

        for person in people:
            if person.is_retired_in_year(year=year):
                continue

            salaries = salary_by_person.get(person.key, [])
            if not salaries:
                continue

            pension = pension_by_person.get(person.key)
            for salary in salaries:
                salary.step(context=context)
                salary_gross_total += salary.get_cash_flows().get("salary_gross", 0.0)

                employee_contrib = salary.gross_annual * salary.employee_pension_pct
                employer_contrib = salary.gross_annual * salary.employer_pension_pct
                employee_pension_total += employee_contrib
                employer_pension_total += employer_contrib

                if pension is not None:
                    pension.contribute(amount=employee_contrib + employer_contrib)

        # Process rental income (taxable as personal income, no NI)
        rental_income_gross = 0.0
        for rental in rental_incomes:
            rental.step(context=context)
            rental_income_gross += rental.get_cash_flows().get("rental_income_gross", 0.0)

        # Process gift income (tax-free)
        gift_income_total = 0.0
        for gift in gift_incomes:
            gift.step(context=context)
            gift_income_total += gift.get_cash_flows().get("gift_income", 0.0)

        # Calculate tax: salary has income tax + NI; rental income has income tax only
        tax_breakdown = tax.calculate_for_salary(
            gross_salary=salary_gross_total,
            employee_pension_contribution=employee_pension_total,
        )
        # Calculate additional income tax on rental income (no NI)
        rental_income_tax = tax.calculate_income_tax_on_additional_income(
            base_taxable_income=salary_gross_total - employee_pension_total,
            additional_income=rental_income_gross,
        )
        salary_net = salary_gross_total - tax_breakdown.total_tax - employee_pension_total
        rental_income_net = rental_income_gross - rental_income_tax

        # Apply cached pension returns (per pension key).
        if pension_returns is not None and pension_keys:
            for p_idx, p_key in enumerate(pension_keys):
                pension = pension_by_person.get(p_key)
                if pension is None:
                    continue
                pension.annual_return = float(pension_returns[iteration_idx, year_idx, p_idx])

        if mortgage is not None:
            mortgage.step(context=context)
        for expense in expenses:
            expense.step(context=context)

        state_pension_income = 0.0
        for person in people:
            if person.is_state_pension_eligible_in_year(year=year):
                state_pension_income += current_state_pension_annual
        
        # Apply inflation for next year
        current_state_pension_annual *= 1.0 + scenario.assumptions.inflation_rate

        expense_total = sum(e.get_cash_flows().get("expenses", 0.0) for e in expenses)
        mortgage_payment = mortgage.get_cash_flows().get("mortgage_payment", 0.0) if mortgage is not None else 0.0

        # Treat `annual_spend_target` as an EXTRA discretionary expense added when everyone is retired.
        extra_retirement_spend = scenario.annual_spend_target if is_all_retired else 0.0

        total_outflows = expense_total + mortgage_payment + extra_retirement_spend

        pension_income_net = 0.0
        pension_income_tax = 0.0
        cgt_paid = 0.0
        cgt_allowance_remaining = scenario.assumptions.cgt_annual_allowance

        # Calculate emergency fund target BEFORE processing cash flows
        monthly_outflows = total_outflows / 12.0 if total_outflows > 0 else 0.0
        emergency_target = monthly_outflows * scenario.assumptions.emergency_fund_months

        # Include: salary (net of tax/NI/pension), rental income (net of income tax), gifts (tax-free), state pension
        primary_cash.balance += salary_net + rental_income_net + gift_income_total + state_pension_income
        primary_cash.balance -= total_outflows

        # If cash below emergency fund target, withdraw from assets to maintain the reserve
        if primary_cash.balance < emergency_target:
            remaining_shortfall = emergency_target - primary_cash.balance

            for priority, name, asset in withdrawal_order:
                if remaining_shortfall <= 0:
                    break

                if asset is not None:
                    # Regular asset withdrawal
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
                else:
                    # Pension withdrawal (synthetic source)
                    # Only include pensions from people who have reached pension access age
                    eligible_pensions = {
                        person_key: pension
                        for person_key, pension in pension_by_person.items()
                        if any(
                            p.key == person_key and p.can_access_pension_in_year(year=year, min_access_age=scenario.assumptions.pension_access_age)
                            for p in people
                        )
                    }
                    current_pension_balance = sum(p.balance for p in eligible_pensions.values())
                    if current_pension_balance > 0:
                        drawdown_result = calculate_pension_drawdown(
                            target_net_income=remaining_shortfall,
                            other_taxable_income=state_pension_income,
                            pension_balance=current_pension_balance,
                        )
                        pension_income_net += drawdown_result.net_income
                        pension_income_tax += drawdown_result.tax_paid
                        primary_cash.balance += drawdown_result.net_income
                        remaining_shortfall -= drawdown_result.net_income

                        if drawdown_result.gross_withdrawal > 0:
                            for pension in eligible_pensions.values():
                                proportion = pension.balance / current_pension_balance
                                pension.withdraw(amount=drawdown_result.gross_withdrawal * proportion)

            # Clamp cash at 0 if we couldn't cover everything (emergency fund depleted)
            if primary_cash.balance < 0:
                primary_cash.balance = 0.0

        # If cash above emergency fund, save excess in tax-optimal order: ISA (to limit) then GIA
        investable = max(0.0, primary_cash.balance - emergency_target)
        if investable > 0:
            isa_assets = [a for a in assets if a.asset_type == "ISA"]
            isa_remaining = scenario.assumptions.isa_annual_limit
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

        for asset_idx, asset in enumerate(assets):
            _apply_asset_growth_with_return(asset=asset, annual_return=returns.asset_returns[iteration_idx, year_idx, asset_idx])
        for pension in pension_by_person.values():
            pension.step(context=context)

        pension_balance = sum(p.balance for p in pension_by_person.values())
        mortgage_balance = mortgage.balance if mortgage is not None else 0.0

        isa_balance = sum(a.balance for a in assets if a.asset_type == "ISA")
        cash_balance = sum(a.balance for a in assets if a.asset_type == "CASH")
        total_assets = sum(a.balance for a in assets) + pension_balance
        total_liabilities = mortgage_balance
        net_worth = total_assets - total_liabilities

        pension_investment_return = sum(p.get_cash_flows().get("pension_investment_return", 0.0) for p in pension_by_person.values())
        investment_returns = sum(a.get_cash_flows().get(f"{a.name}_investment_return", 0.0) for a in assets) + pension_investment_return

        total_income = salary_net + rental_income_net + gift_income_total + pension_income_net + state_pension_income

        income_tax_paid = tax_breakdown.income_tax + rental_income_tax + pension_income_tax + cgt_paid
        ni_paid = tax_breakdown.national_insurance
        total_tax = income_tax_paid + ni_paid

        total_expenses = expense_total + mortgage_payment + extra_retirement_spend
        pension_contributions = employee_pension_total + employer_pension_total

        is_depleted = total_assets <= 0
        mortgage_paid_off = mortgage is None or mortgage.balance <= 0

        out["net_worth"][iteration_idx, year_idx] = net_worth
        out["salary_gross"][iteration_idx, year_idx] = salary_gross_total
        out["salary_net"][iteration_idx, year_idx] = salary_net
        out["rental_income"][iteration_idx, year_idx] = rental_income_net
        out["gift_income"][iteration_idx, year_idx] = gift_income_total
        out["pension_income"][iteration_idx, year_idx] = pension_income_net
        out["state_pension_income"][iteration_idx, year_idx] = state_pension_income
        out["investment_returns"][iteration_idx, year_idx] = investment_returns
        out["total_income"][iteration_idx, year_idx] = total_income
        out["total_expenses"][iteration_idx, year_idx] = total_expenses
        out["mortgage_payment"][iteration_idx, year_idx] = mortgage_payment
        out["pension_contributions"][iteration_idx, year_idx] = pension_contributions
        out["fun_fund"][iteration_idx, year_idx] = extra_retirement_spend
        out["income_tax_paid"][iteration_idx, year_idx] = income_tax_paid
        out["ni_paid"][iteration_idx, year_idx] = ni_paid
        out["total_tax"][iteration_idx, year_idx] = total_tax
        out["isa_balance"][iteration_idx, year_idx] = isa_balance
        out["pension_balance"][iteration_idx, year_idx] = pension_balance
        out["cash_balance"][iteration_idx, year_idx] = cash_balance
        out["total_assets"][iteration_idx, year_idx] = total_assets
        out["mortgage_balance"][iteration_idx, year_idx] = mortgage_balance
        out["total_liabilities"][iteration_idx, year_idx] = total_liabilities
        out["mortgage_paid_off"][iteration_idx, year_idx] = 1.0 if mortgage_paid_off else 0.0
        out["is_depleted"][iteration_idx, year_idx] = 1.0 if is_depleted else 0.0


