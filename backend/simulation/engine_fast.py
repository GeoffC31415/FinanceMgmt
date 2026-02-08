"""
Numba-accelerated Monte Carlo simulation engine.

This module provides a parallel, vectorized implementation of the simulation
using Numba JIT compilation with parallel iteration via prange, operating on
contiguous NumPy arrays with closed-form tax calculations.
"""
from __future__ import annotations

import numpy as np

from backend.simulation.array_scenario import ArrayScenario, build_array_scenario
from backend.simulation.engine import SimulationRunMatrices, SimulationScenario
from backend.simulation.returns_cache import ReturnsMatrix

from numba import njit, prange


# Field indices for the output matrix
F_NET_WORTH = 0
F_SALARY_GROSS = 1
F_SALARY_NET = 2
F_RENTAL_INCOME = 3
F_GIFT_INCOME = 4
F_PENSION_INCOME = 5
F_STATE_PENSION_INCOME = 6
F_INVESTMENT_RETURNS = 7
F_TOTAL_INCOME = 8
F_TOTAL_EXPENSES = 9
F_MORTGAGE_PAYMENT = 10
F_PENSION_CONTRIBUTIONS = 11
F_FUN_FUND = 12
F_INCOME_TAX_PAID = 13
F_NI_PAID = 14
F_TOTAL_TAX = 15
F_ISA_BALANCE = 16
F_PENSION_BALANCE = 17
F_CASH_BALANCE = 18
F_TOTAL_ASSETS = 19
F_MORTGAGE_BALANCE = 20
F_TOTAL_LIABILITIES = 21
F_MORTGAGE_PAID_OFF = 22
F_IS_DEPLETED = 23
F_IS_BANKRUPT = 24
F_DEBT_BALANCE = 25
F_DEBT_INTEREST_PAID = 26

# Per-type investment returns
F_ISA_RETURNS = 27
F_GIA_RETURNS = 28
F_CASH_RETURNS = 29
F_PENSION_RETURNS = 30

# Per-type contributions (deposits into accounts)
F_ISA_CONTRIBUTIONS = 31
F_GIA_CONTRIBUTIONS = 32
F_PENSION_CONTRIBUTIONS_TOTAL = 33

# Per-type withdrawals
F_ISA_WITHDRAWALS = 34
F_GIA_WITHDRAWALS = 35
F_PENSION_WITHDRAWALS = 36

# GIA balance (computed server-side)
F_GIA_BALANCE = 37

N_FIELDS = 38

# Asset type codes
ASSET_CASH = 0
ASSET_ISA = 1
ASSET_GIA = 2


def run_simulation(
    *,
    scenario: SimulationScenario,
    returns: ReturnsMatrix,
) -> SimulationRunMatrices:
    """Run Monte Carlo simulation using the Numba-accelerated engine."""
    array_scenario = build_array_scenario(scenario=scenario, returns=returns)
    out = _run_monte_carlo_fast(array_scenario=array_scenario, returns=returns)
    years = list(array_scenario.years.astype(int))
    return SimulationRunMatrices(years=years, fields=out)


def _run_monte_carlo_fast(
    *,
    array_scenario: ArrayScenario,
    returns: ReturnsMatrix,
) -> dict[str, np.ndarray]:
    """
    Numba-accelerated Monte Carlo simulation.
    """
    sc = array_scenario
    iterations = returns.iterations
    n_years = returns.n_years
    n_assets = len(sc.asset_names)
    n_pensions = len(sc.pension_keys)

    # Build withdrawal order: (priority, is_pension, asset_idx)
    # Sort descending by priority, ascending by name (approximated by index)
    withdrawal_items = []
    for i in range(n_assets):
        if sc.asset_types[i] != ASSET_CASH:
            withdrawal_items.append((sc.asset_withdrawal_priority[i], 0, i))
    withdrawal_items.append((sc.pension_withdrawal_priority, 1, -1))
    # Sort: highest priority first, then by asset index
    withdrawal_items.sort(key=lambda x: (-x[0], x[2]))
    
    withdrawal_priority = np.array([w[0] for w in withdrawal_items], dtype=np.int32)
    withdrawal_is_pension = np.array([w[1] for w in withdrawal_items], dtype=np.int8)
    withdrawal_asset_idx = np.array([w[2] for w in withdrawal_items], dtype=np.int32)

    # Find cash asset index
    cash_idx = -1
    for i in range(n_assets):
        if sc.asset_types[i] == ASSET_CASH:
            cash_idx = i
            break

    # Call the Numba kernel
    a = sc.assumptions
    out = _simulate_all_iterations(
        iterations=iterations,
        n_years=n_years,
        years=sc.years,
        # People
        people_birth_years=sc.people_birth_years,
        people_retirement_ages=sc.people_retirement_ages,
        people_state_pension_ages=sc.people_state_pension_ages,
        people_is_child=sc.people_is_child,
        people_annual_cost=sc.people_annual_cost.copy(),
        people_leaves_household_age=sc.people_leaves_household_age,
        # Salary
        salary_person_idx=sc.salary_person_idx,
        salary_gross_annual=sc.salary_gross_annual.copy(),
        salary_growth_rate=sc.salary_growth_rate,
        salary_employee_pct=sc.salary_employee_pct,
        salary_employer_pct=sc.salary_employer_pct,
        salary_start_year=sc.salary_start_year,
        salary_end_year=sc.salary_end_year,
        # Rental
        rental_person_idx=sc.rental_person_idx,
        rental_gross_annual=sc.rental_gross_annual.copy(),
        rental_growth_rate=sc.rental_growth_rate,
        rental_start_year=sc.rental_start_year,
        rental_end_year=sc.rental_end_year,
        # Gift
        gift_person_idx=sc.gift_person_idx,
        gift_gross_annual=sc.gift_gross_annual.copy(),
        gift_growth_rate=sc.gift_growth_rate,
        gift_start_year=sc.gift_start_year,
        gift_end_year=sc.gift_end_year,
        # Assets
        asset_types=sc.asset_types,
        asset_balances=sc.asset_balances.copy(),
        asset_cost_bases=sc.asset_cost_bases.copy(),
        asset_annual_contrib=sc.asset_annual_contrib,
        asset_contrib_end_retirement=sc.asset_contrib_end_retirement,
        asset_returns=returns.asset_returns,
        cash_idx=cash_idx,
        n_assets=n_assets,
        # Pensions
        pension_person_idx=sc.pension_person_idx,
        pension_balances=sc.pension_balances.copy(),
        pension_returns=returns.pension_returns,
        n_pensions=n_pensions,
        # Mortgage
        has_mortgage=sc.has_mortgage,
        mortgage_balance=sc.mortgage_balance,
        mortgage_annual_interest_rate=sc.mortgage_annual_interest_rate,
        mortgage_monthly_payment=sc.mortgage_monthly_payment,
        # Expenses
        expense_annual_amount=sc.expense_annual_amount.copy(),
        expense_is_inflation_linked=sc.expense_is_inflation_linked,
        # Scenario params
        annual_spend_target=sc.annual_spend_target,
        withdrawal_priority=withdrawal_priority,
        withdrawal_is_pension=withdrawal_is_pension,
        withdrawal_asset_idx=withdrawal_asset_idx,
        # Assumptions
        inflation_rate=a.inflation_rate,
        isa_annual_limit=a.isa_annual_limit,
        state_pension_annual=a.state_pension_annual,
        cgt_annual_allowance=a.cgt_annual_allowance,
        cgt_rate=a.cgt_rate,
        emergency_fund_months=a.emergency_fund_months,
        pension_access_age=a.pension_access_age,
        debt_interest_rate=a.debt_interest_rate,
        bankruptcy_threshold=a.bankruptcy_threshold,
        # Tax bands (configurable per scenario)
        personal_allowance=a.personal_allowance,
        basic_rate_limit=a.basic_rate_limit,
        higher_rate_limit=a.higher_rate_limit,
        basic_rate=a.basic_rate,
        higher_rate=a.higher_rate,
        additional_rate=a.additional_rate,
        ni_primary_threshold=a.ni_primary_threshold,
        ni_upper_earnings_limit=a.ni_upper_earnings_limit,
        ni_main_rate=a.ni_main_rate,
        ni_upper_rate=a.ni_upper_rate,
    )

    # Convert to dict format expected by SimulationRunMatrices
    field_names = [
        "net_worth", "salary_gross", "salary_net", "rental_income", "gift_income",
        "pension_income", "state_pension_income", "investment_returns", "total_income",
        "total_expenses", "mortgage_payment", "pension_contributions", "fun_fund",
        "income_tax_paid", "ni_paid", "total_tax", "isa_balance", "pension_balance",
        "cash_balance", "total_assets", "mortgage_balance", "total_liabilities",
        "mortgage_paid_off", "is_depleted", "is_bankrupt", "debt_balance", "debt_interest_paid",
        # Per-type details (asset class breakdown)
        "isa_returns", "gia_returns", "cash_returns", "pension_returns",
        "isa_contributions", "gia_contributions", "pension_contributions_total",
        "isa_withdrawals", "gia_withdrawals", "pension_withdrawals",
        "gia_balance",
    ]
    return {name: out[:, :, i] for i, name in enumerate(field_names)}


@njit(cache=True)
def _calculate_income_tax(
    taxable_income: float,
    pa: float, brl: float, hrl: float,
    br: float, hr: float, ar: float,
) -> float:
    if taxable_income <= 0:
        return 0.0

    # Personal allowance tapering: reduced by £1 for every £2 above £100k
    effective_pa = pa
    if taxable_income > 100_000.0:
        reduction = min(pa, (taxable_income - 100_000.0) / 2.0)
        effective_pa = max(0.0, pa - reduction)

    remaining = taxable_income
    tax = 0.0

    allowance = min(remaining, effective_pa)
    remaining -= allowance
    if remaining <= 0:
        return 0.0

    basic_band = max(0.0, brl - pa)  # Use original pa for band boundaries
    basic_amount = min(remaining, basic_band)
    tax += basic_amount * br
    remaining -= basic_amount
    if remaining <= 0:
        return tax

    higher_band = max(0.0, hrl - brl)
    higher_amount = min(remaining, higher_band)
    tax += higher_amount * hr
    remaining -= higher_amount
    if remaining <= 0:
        return tax

    tax += remaining * ar
    return tax

@njit(cache=True)
def _calculate_ni(
    gross_annual: float,
    ni_pt: float, ni_uel: float, ni_mr: float, ni_ur: float,
) -> float:
    if gross_annual <= ni_pt:
        return 0.0
    main_amount = min(gross_annual, ni_uel) - ni_pt
    upper_amount = max(0.0, gross_annual - ni_uel)
    return main_amount * ni_mr + upper_amount * ni_ur


@njit(cache=True)
def _calculate_pension_drawdown(
    target_net: float,
    other_taxable: float,
    pension_balance: float,
    pa: float, brl: float, hrl: float,
    br: float, hr: float, ar: float,
) -> tuple:
    """Returns (gross_withdrawal, tax_paid, net_income)"""
    if target_net <= 0 or pension_balance <= 0:
        return 0.0, 0.0, 0.0

    low = 0.0
    high = min(pension_balance, target_net * 2.0)

    for _ in range(20):
        gross = (low + high) / 2.0
        taxable = gross * 0.75
        total_tax = _calculate_income_tax(other_taxable + taxable, pa, brl, hrl, br, hr, ar)
        base_tax = _calculate_income_tax(other_taxable, pa, brl, hrl, br, hr, ar)
        pension_tax = total_tax - base_tax
        net = gross - pension_tax

        if abs(net - target_net) < 0.01:
            break
        if net < target_net:
            low = gross
        else:
            high = gross

    if gross > pension_balance:
        gross = pension_balance
        taxable = gross * 0.75
        total_tax = _calculate_income_tax(other_taxable + taxable, pa, brl, hrl, br, hr, ar)
        base_tax = _calculate_income_tax(other_taxable, pa, brl, hrl, br, hr, ar)
        pension_tax = total_tax - base_tax
        net = gross - pension_tax

    return gross, pension_tax, net


@njit(cache=True)
def _step_mortgage(
    balance: float,
    annual_rate: float,
    monthly_payment: float,
) -> tuple:
    """Returns (new_balance, payment_made)"""
    if balance <= 0:
        return 0.0, 0.0

    monthly_rate = annual_rate / 12.0
    payment_total = 0.0

    for _ in range(12):
        if balance <= 0:
            break
        interest = balance * monthly_rate
        payment = min(monthly_payment, balance + interest)
        principal = max(0.0, payment - interest)
        payment_total += payment
        balance = max(0.0, balance + interest - payment)

    return balance, payment_total


@njit(parallel=True, cache=True)
def _simulate_all_iterations(
    iterations: int,
    n_years: int,
    years: np.ndarray,
    # People
    people_birth_years: np.ndarray,
    people_retirement_ages: np.ndarray,
    people_state_pension_ages: np.ndarray,
    people_is_child: np.ndarray,
    people_annual_cost: np.ndarray,
    people_leaves_household_age: np.ndarray,
    # Salary
    salary_person_idx: np.ndarray,
    salary_gross_annual: np.ndarray,
    salary_growth_rate: np.ndarray,
    salary_employee_pct: np.ndarray,
    salary_employer_pct: np.ndarray,
    salary_start_year: np.ndarray,
    salary_end_year: np.ndarray,
    # Rental
    rental_person_idx: np.ndarray,
    rental_gross_annual: np.ndarray,
    rental_growth_rate: np.ndarray,
    rental_start_year: np.ndarray,
    rental_end_year: np.ndarray,
    # Gift
    gift_person_idx: np.ndarray,
    gift_gross_annual: np.ndarray,
    gift_growth_rate: np.ndarray,
    gift_start_year: np.ndarray,
    gift_end_year: np.ndarray,
    # Assets
    asset_types: np.ndarray,
    asset_balances: np.ndarray,
    asset_cost_bases: np.ndarray,
    asset_annual_contrib: np.ndarray,
    asset_contrib_end_retirement: np.ndarray,
    asset_returns: np.ndarray,
    cash_idx: int,
    n_assets: int,
    # Pensions
    pension_person_idx: np.ndarray,
    pension_balances: np.ndarray,
    pension_returns: np.ndarray,
    n_pensions: int,
    # Mortgage
    has_mortgage: bool,
    mortgage_balance: float,
    mortgage_annual_interest_rate: float,
    mortgage_monthly_payment: float,
    # Expenses
    expense_annual_amount: np.ndarray,
    expense_is_inflation_linked: np.ndarray,
    # Scenario
    annual_spend_target: float,
    withdrawal_priority: np.ndarray,
    withdrawal_is_pension: np.ndarray,
    withdrawal_asset_idx: np.ndarray,
    # Assumptions
    inflation_rate: float,
    isa_annual_limit: float,
    state_pension_annual: float,
    cgt_annual_allowance: float,
    cgt_rate: float,
    emergency_fund_months: float,
    pension_access_age: int,
    debt_interest_rate: float,
    bankruptcy_threshold: float,
    # Tax bands (configurable)
    personal_allowance: float,
    basic_rate_limit: float,
    higher_rate_limit: float,
    basic_rate: float,
    higher_rate: float,
    additional_rate: float,
    ni_primary_threshold: float,
    ni_upper_earnings_limit: float,
    ni_main_rate: float,
    ni_upper_rate: float,
) -> np.ndarray:
    """
    Main parallel simulation kernel. Each iteration runs independently.
    """
    out = np.zeros((iterations, n_years, N_FIELDS), dtype=np.float64)
    n_people = len(people_birth_years)
    n_salaries = len(salary_person_idx)
    n_rentals = len(rental_gross_annual)
    n_gifts = len(gift_gross_annual)
    n_expenses = len(expense_annual_amount)
    n_withdrawals = len(withdrawal_priority)

    for it in prange(iterations):
        # Per-iteration state copies
        it_asset_balances = asset_balances.copy()
        it_asset_cost_bases = asset_cost_bases.copy()
        it_pension_balances = pension_balances.copy()
        it_mortgage_balance = mortgage_balance
        it_salary_gross = salary_gross_annual.copy()
        it_rental_gross = rental_gross_annual.copy()
        it_gift_gross = gift_gross_annual.copy()
        it_expense_amounts = expense_annual_amount.copy()
        it_state_pension = state_pension_annual
        it_child_costs = people_annual_cost.copy()
        it_annual_spend = annual_spend_target

        # Debt tracking for this iteration
        it_debt_balance = 0.0
        it_is_bankrupt = False

        for y_idx in range(n_years):
            year = years[y_idx]

            # If bankrupt, skip simulation but record frozen bankrupt state
            if it_is_bankrupt:
                # Calculate totals for output (values frozen from bankruptcy year)
                pension_balance = 0.0
                for pen_idx in range(n_pensions):
                    pension_balance += it_pension_balances[pen_idx]
                isa_balance = 0.0
                cash_balance = 0.0
                total_asset_balance = 0.0
                for a_idx in range(n_assets):
                    total_asset_balance += it_asset_balances[a_idx]
                    if asset_types[a_idx] == ASSET_ISA:
                        isa_balance += it_asset_balances[a_idx]
                    elif asset_types[a_idx] == ASSET_CASH:
                        cash_balance += it_asset_balances[a_idx]
                total_assets = total_asset_balance + pension_balance
                total_liabilities = it_mortgage_balance + it_debt_balance
                net_worth = total_assets - total_liabilities

                out[it, y_idx, F_NET_WORTH] = net_worth
                out[it, y_idx, F_ISA_BALANCE] = isa_balance
                out[it, y_idx, F_PENSION_BALANCE] = pension_balance
                out[it, y_idx, F_CASH_BALANCE] = cash_balance
                out[it, y_idx, F_TOTAL_ASSETS] = total_assets
                out[it, y_idx, F_MORTGAGE_BALANCE] = it_mortgage_balance
                out[it, y_idx, F_TOTAL_LIABILITIES] = total_liabilities
                out[it, y_idx, F_IS_DEPLETED] = 1.0
                out[it, y_idx, F_IS_BANKRUPT] = 1.0
                out[it, y_idx, F_DEBT_BALANCE] = it_debt_balance
                out[it, y_idx, F_DEBT_INTEREST_PAID] = 0.0
                continue

            # Check retirement status for each adult person (skip children)
            is_all_retired = True
            has_adults = False
            for p in range(n_people):
                if people_is_child[p] == 1:
                    continue
                has_adults = True
                age = year - people_birth_years[p]
                if age < people_retirement_ages[p]:
                    is_all_retired = False
                    break
            if not has_adults:
                is_all_retired = False

            # --- Per-person income accumulation ---
            # Track salary and pension contributions per person for correct tax
            per_person_salary = np.zeros(n_people, dtype=np.float64)
            per_person_employee_pension = np.zeros(n_people, dtype=np.float64)
            per_person_employer_pension = np.zeros(n_people, dtype=np.float64)
            per_person_rental = np.zeros(n_people, dtype=np.float64)

            salary_gross_total = 0.0
            employee_pension_total = 0.0
            employer_pension_total = 0.0

            for s in range(n_salaries):
                p_idx = salary_person_idx[s]
                if p_idx < 0 or p_idx >= n_people:
                    continue

                # Check if person is retired
                age = year - people_birth_years[p_idx]
                if age >= people_retirement_ages[p_idx]:
                    continue

                # Check salary date range
                if salary_start_year[s] >= 0 and year < salary_start_year[s]:
                    continue
                if salary_end_year[s] >= 0 and year > salary_end_year[s]:
                    continue

                # Use current salary, then apply growth for next year
                salary_gross_total += it_salary_gross[s]
                per_person_salary[p_idx] += it_salary_gross[s]

                employee_contrib = it_salary_gross[s] * salary_employee_pct[s]
                employer_contrib = it_salary_gross[s] * salary_employer_pct[s]
                employee_pension_total += employee_contrib
                employer_pension_total += employer_contrib
                per_person_employee_pension[p_idx] += employee_contrib
                per_person_employer_pension[p_idx] += employer_contrib

                # Add to pension
                if n_pensions > 0:
                    for pen_idx in range(n_pensions):
                        if pension_person_idx[pen_idx] == p_idx:
                            it_pension_balances[pen_idx] += employee_contrib + employer_contrib
                            break

                # Apply salary growth for next year (after use)
                it_salary_gross[s] *= (1.0 + salary_growth_rate[s])

            # Process rental income (per person)
            rental_income_gross = 0.0
            for r in range(n_rentals):
                if rental_start_year[r] >= 0 and year < rental_start_year[r]:
                    continue
                if rental_end_year[r] >= 0 and year > rental_end_year[r]:
                    continue
                rental_income_gross += it_rental_gross[r]
                r_p_idx = rental_person_idx[r] if r < len(rental_person_idx) else 0
                if 0 <= r_p_idx < n_people:
                    per_person_rental[r_p_idx] += it_rental_gross[r]
                it_rental_gross[r] *= (1.0 + rental_growth_rate[r])

            # Process gift income (tax-free, no per-person tax needed)
            gift_income_total = 0.0
            for g in range(n_gifts):
                if gift_start_year[g] >= 0 and year < gift_start_year[g]:
                    continue
                if gift_end_year[g] >= 0 and year > gift_end_year[g]:
                    continue
                gift_income_total += it_gift_gross[g]
                it_gift_gross[g] *= (1.0 + gift_growth_rate[g])

            # --- Per-person tax calculation ---
            income_tax = 0.0
            ni_paid = 0.0
            rental_income_tax = 0.0
            for p in range(n_people):
                if people_is_child[p] == 1:
                    continue
                p_salary = per_person_salary[p]
                p_emp_pension = per_person_employee_pension[p]
                p_rental = per_person_rental[p]

                # Income tax on salary (net of pension contributions)
                p_taxable_salary = max(0.0, p_salary - p_emp_pension)
                income_tax += _calculate_income_tax(
                    p_taxable_salary, personal_allowance, basic_rate_limit,
                    higher_rate_limit, basic_rate, higher_rate, additional_rate,
                )
                # NI on gross salary (per person)
                ni_paid += _calculate_ni(
                    p_salary, ni_primary_threshold, ni_upper_earnings_limit,
                    ni_main_rate, ni_upper_rate,
                )
                # Marginal income tax on rental income (no NI)
                if p_rental > 0.0:
                    tax_with_rental = _calculate_income_tax(
                        p_taxable_salary + p_rental, personal_allowance, basic_rate_limit,
                        higher_rate_limit, basic_rate, higher_rate, additional_rate,
                    )
                    tax_without_rental = _calculate_income_tax(
                        p_taxable_salary, personal_allowance, basic_rate_limit,
                        higher_rate_limit, basic_rate, higher_rate, additional_rate,
                    )
                    rental_income_tax += tax_with_rental - tax_without_rental

            salary_net = salary_gross_total - income_tax - ni_paid - employee_pension_total
            rental_income_net = rental_income_gross - rental_income_tax

            # Mortgage payment
            mortgage_payment = 0.0
            if has_mortgage and it_mortgage_balance > 0:
                it_mortgage_balance, mortgage_payment = _step_mortgage(
                    it_mortgage_balance,
                    mortgage_annual_interest_rate,
                    mortgage_monthly_payment,
                )

            # Expenses
            expense_total = 0.0
            for e in range(n_expenses):
                expense_total += it_expense_amounts[e]
                if expense_is_inflation_linked[e]:
                    it_expense_amounts[e] *= (1.0 + inflation_rate)

            # Child costs (only while child is a dependent)
            for p in range(n_people):
                if people_is_child[p] == 1:
                    age = year - people_birth_years[p]
                    if age < people_leaves_household_age[p]:
                        expense_total += it_child_costs[p]
                    # Apply inflation to child costs
                    it_child_costs[p] *= (1.0 + inflation_rate)

            # State pension
            state_pension_income = 0.0
            for p in range(n_people):
                age = year - people_birth_years[p]
                if age >= people_state_pension_ages[p]:
                    state_pension_income += it_state_pension
            it_state_pension *= (1.0 + inflation_rate)

            # Extra retirement spending
            extra_retirement_spend = it_annual_spend if is_all_retired else 0.0
            total_outflows = expense_total + mortgage_payment + extra_retirement_spend
            # Inflate annual spend for next year (after use)
            it_annual_spend *= (1.0 + inflation_rate)

            # Emergency fund target
            monthly_outflows = total_outflows / 12.0 if total_outflows > 0 else 0.0
            emergency_target = monthly_outflows * emergency_fund_months

            # Add income to cash
            if cash_idx >= 0:
                it_asset_balances[cash_idx] += salary_net + rental_income_net + gift_income_total + state_pension_income
                it_asset_balances[cash_idx] -= total_outflows

            pension_income_net = 0.0
            pension_income_tax = 0.0
            cgt_paid = 0.0
            cgt_allowance_remaining = cgt_annual_allowance

            # Per-type flow tracking (annual, per iteration)
            isa_withdrawals = 0.0
            gia_withdrawals = 0.0
            pension_withdrawals = 0.0
            isa_contributions = 0.0
            gia_contributions = 0.0

            # Withdraw from assets if below emergency fund
            if cash_idx >= 0 and it_asset_balances[cash_idx] < emergency_target:
                shortfall = emergency_target - it_asset_balances[cash_idx]

                for w_idx in range(n_withdrawals):
                    if shortfall <= 0:
                        break

                    if withdrawal_is_pension[w_idx] == 1:
                        # Pension withdrawal
                        # Check eligibility (any person with pension at access age)
                        eligible_pension_balance = 0.0
                        for pen_idx in range(n_pensions):
                            p_idx = pension_person_idx[pen_idx]
                            if p_idx >= 0:
                                age = year - people_birth_years[p_idx]
                                if age >= pension_access_age:
                                    eligible_pension_balance += it_pension_balances[pen_idx]

                        if eligible_pension_balance > 0:
                            # Compute other taxable income for eligible pension holders
                            other_taxable = state_pension_income
                            for pen_idx in range(n_pensions):
                                pp = pension_person_idx[pen_idx]
                                if pp >= 0 and (year - people_birth_years[pp]) >= pension_access_age:
                                    other_taxable += max(0.0, per_person_salary[pp] - per_person_employee_pension[pp])
                                    other_taxable += per_person_rental[pp]

                            gross, tax, net = _calculate_pension_drawdown(
                                shortfall, other_taxable, eligible_pension_balance,
                                personal_allowance, basic_rate_limit, higher_rate_limit, basic_rate, higher_rate, additional_rate,
                            )
                            pension_income_net += net
                            pension_income_tax += tax
                            it_asset_balances[cash_idx] += net
                            shortfall -= net
                            pension_withdrawals += gross

                            # Proportionally withdraw from each eligible pension
                            if gross > 0:
                                for pen_idx in range(n_pensions):
                                    p_idx = pension_person_idx[pen_idx]
                                    if p_idx >= 0:
                                        age = year - people_birth_years[p_idx]
                                        if age >= pension_access_age and it_pension_balances[pen_idx] > 0:
                                            proportion = it_pension_balances[pen_idx] / eligible_pension_balance
                                            it_pension_balances[pen_idx] -= gross * proportion
                    else:
                        # Asset withdrawal
                        a_idx = withdrawal_asset_idx[w_idx]
                        if a_idx < 0 or a_idx >= n_assets:
                            continue
                        if it_asset_balances[a_idx] <= 0:
                            continue

                        asset_type = asset_types[a_idx]

                        if asset_type == ASSET_ISA:
                            # ISA: tax-free
                            gross = min(it_asset_balances[a_idx], shortfall)
                            it_asset_balances[a_idx] -= gross
                            it_asset_balances[cash_idx] += gross
                            shortfall -= gross
                            isa_withdrawals += gross

                        elif asset_type == ASSET_GIA:
                            # GIA: solve for gross that yields shortfall as net after CGT
                            balance = it_asset_balances[a_idx]
                            cost_basis = it_asset_cost_bases[a_idx]

                            total_gains = max(0.0, balance - cost_basis)
                            gains_ratio = total_gains / balance if balance > 0 else 0.0

                            # Compute gross needed to get shortfall net
                            if gains_ratio * cgt_rate > 0 and cgt_allowance_remaining <= 0:
                                # All gains taxed: net = gross * (1 - gains_ratio * cgt_rate)
                                desired_gross = shortfall / (1.0 - gains_ratio * cgt_rate)
                            elif gains_ratio > 0 and cgt_rate > 0:
                                # Some gains may be sheltered by allowance
                                # First try: gross where gains exceed allowance
                                allowance_gross = cgt_allowance_remaining / gains_ratio if gains_ratio > 0 else shortfall
                                if shortfall <= allowance_gross:
                                    # All gains within allowance, no tax
                                    desired_gross = shortfall
                                else:
                                    # net = gross - (gross * gains_ratio - allowance) * cgt_rate
                                    # net = gross * (1 - gains_ratio * cgt_rate) + allowance * cgt_rate
                                    desired_gross = (shortfall - cgt_allowance_remaining * cgt_rate) / (1.0 - gains_ratio * cgt_rate)
                            else:
                                desired_gross = shortfall

                            gross = min(balance, max(0.0, desired_gross))
                            gains_realized = gross * gains_ratio

                            allowance_used = min(cgt_allowance_remaining, gains_realized)
                            taxable_gains = max(0.0, gains_realized - allowance_used)
                            tax = taxable_gains * cgt_rate
                            cgt_allowance_remaining -= allowance_used
                            cgt_paid += tax

                            net = gross - tax
                            if balance > 0 and cost_basis > 0:
                                basis_reduction = cost_basis * (gross / balance)
                                it_asset_cost_bases[a_idx] = max(0.0, cost_basis - basis_reduction)

                            it_asset_balances[a_idx] -= gross
                            it_asset_balances[cash_idx] += net
                            shortfall -= net
                            gia_withdrawals += gross

                        else:
                            # Other: treat as tax-free
                            gross = min(it_asset_balances[a_idx], shortfall)
                            it_asset_balances[a_idx] -= gross
                            it_asset_balances[cash_idx] += gross
                            shortfall -= gross

                # Track negative cash as debt (don't clamp to 0)
                if it_asset_balances[cash_idx] < 0:
                    it_debt_balance += abs(it_asset_balances[cash_idx])
                    it_asset_balances[cash_idx] = 0.0

            # Pay down existing debt using accessible pension/assets before interest compounds
            # This ensures assets are fully used before debt accumulates
            if it_debt_balance > 0 and cash_idx >= 0:
                debt_to_repay = it_debt_balance
                    
                # Try to pay down debt using withdrawal sources in priority order
                for w_idx in range(n_withdrawals):
                    if debt_to_repay <= 0:
                        break
                        
                    if withdrawal_is_pension[w_idx] == 1:
                        # Pension withdrawal to repay debt
                        eligible_pension_balance = 0.0
                        for pen_idx in range(n_pensions):
                            p_idx = pension_person_idx[pen_idx]
                            if p_idx >= 0:
                                age = year - people_birth_years[p_idx]
                                if age >= pension_access_age:
                                    eligible_pension_balance += it_pension_balances[pen_idx]
                            
                        if eligible_pension_balance > 0:
                            # Compute other taxable income for eligible pension holders
                            debt_other_taxable = state_pension_income + pension_income_net
                            for pen_idx in range(n_pensions):
                                pp = pension_person_idx[pen_idx]
                                if pp >= 0 and (year - people_birth_years[pp]) >= pension_access_age:
                                    debt_other_taxable += max(0.0, per_person_salary[pp] - per_person_employee_pension[pp])
                                    debt_other_taxable += per_person_rental[pp]
                            gross, tax, net = _calculate_pension_drawdown(
                                debt_to_repay, debt_other_taxable, eligible_pension_balance,
                                personal_allowance, basic_rate_limit, higher_rate_limit, basic_rate, higher_rate, additional_rate,
                            )
                            if net > 0:
                                # Use the net to pay down debt
                                actual_repayment = min(net, it_debt_balance)
                                it_debt_balance -= actual_repayment
                                debt_to_repay -= actual_repayment
                                pension_income_net += net
                                pension_income_tax += tax
                                pension_withdrawals += gross
                                    
                                # Proportionally withdraw from each eligible pension
                                for pen_idx in range(n_pensions):
                                    p_idx = pension_person_idx[pen_idx]
                                    if p_idx >= 0:
                                        age = year - people_birth_years[p_idx]
                                        if age >= pension_access_age and it_pension_balances[pen_idx] > 0:
                                            proportion = it_pension_balances[pen_idx] / eligible_pension_balance
                                            it_pension_balances[pen_idx] -= gross * proportion
                    else:
                        # Asset withdrawal to repay debt
                        a_idx = withdrawal_asset_idx[w_idx]
                        if a_idx < 0 or a_idx >= n_assets:
                            continue
                        if it_asset_balances[a_idx] <= 0:
                            continue
                            
                        asset_type = asset_types[a_idx]
                            
                        if asset_type == ASSET_ISA:
                            # ISA: tax-free
                            gross = min(it_asset_balances[a_idx], debt_to_repay)
                            it_asset_balances[a_idx] -= gross
                            actual_repayment = min(gross, it_debt_balance)
                            it_debt_balance -= actual_repayment
                            debt_to_repay -= actual_repayment
                            isa_withdrawals += gross
                            
                        elif asset_type == ASSET_GIA:
                            # GIA: solve for gross that yields debt_to_repay as net after CGT
                            balance = it_asset_balances[a_idx]
                            cost_basis = it_asset_cost_bases[a_idx]

                            total_gains = max(0.0, balance - cost_basis)
                            gains_ratio = total_gains / balance if balance > 0 else 0.0

                            if gains_ratio * cgt_rate > 0 and cgt_allowance_remaining <= 0:
                                desired_gross = debt_to_repay / (1.0 - gains_ratio * cgt_rate)
                            elif gains_ratio > 0 and cgt_rate > 0:
                                allowance_gross = cgt_allowance_remaining / gains_ratio if gains_ratio > 0 else debt_to_repay
                                if debt_to_repay <= allowance_gross:
                                    desired_gross = debt_to_repay
                                else:
                                    desired_gross = (debt_to_repay - cgt_allowance_remaining * cgt_rate) / (1.0 - gains_ratio * cgt_rate)
                            else:
                                desired_gross = debt_to_repay

                            gross = min(balance, max(0.0, desired_gross))
                            gains_realized = gross * gains_ratio

                            allowance_used = min(cgt_allowance_remaining, gains_realized)
                            taxable_gains = max(0.0, gains_realized - allowance_used)
                            tax = taxable_gains * cgt_rate
                            cgt_allowance_remaining -= allowance_used
                            cgt_paid += tax

                            net = gross - tax
                            if balance > 0 and cost_basis > 0:
                                basis_reduction = cost_basis * (gross / balance)
                                it_asset_cost_bases[a_idx] = max(0.0, cost_basis - basis_reduction)

                            it_asset_balances[a_idx] -= gross
                            actual_repayment = min(net, it_debt_balance)
                            it_debt_balance -= actual_repayment
                            debt_to_repay -= actual_repayment
                            gia_withdrawals += gross

            # Invest excess cash
            if cash_idx >= 0:
                investable = max(0.0, it_asset_balances[cash_idx] - emergency_target)
                if investable > 0:
                    isa_remaining = isa_annual_limit
                    # ISA first
                    for a_idx in range(n_assets):
                        if investable <= 0 or isa_remaining <= 0:
                            break
                        if asset_types[a_idx] != ASSET_ISA:
                            continue
                        # Skip if contributions end at retirement and all adults are retired
                        if asset_contrib_end_retirement[a_idx] == 1 and is_all_retired:
                            continue
                        cap = asset_annual_contrib[a_idx] if asset_annual_contrib[a_idx] > 0 else isa_remaining
                        amount = min(investable, isa_remaining, cap)
                        if amount > 0:
                            it_asset_balances[a_idx] += amount
                            it_asset_cost_bases[a_idx] += amount
                            it_asset_balances[cash_idx] -= amount
                            investable -= amount
                            isa_remaining -= amount
                            isa_contributions += amount

                    # Then GIA
                    for a_idx in range(n_assets):
                        if investable <= 0:
                            break
                        if asset_types[a_idx] != ASSET_GIA:
                            continue
                        # Skip if contributions end at retirement and all adults are retired
                        if asset_contrib_end_retirement[a_idx] == 1 and is_all_retired:
                            continue
                        cap = asset_annual_contrib[a_idx] if asset_annual_contrib[a_idx] > 0 else investable
                        amount = min(investable, cap)
                        if amount > 0:
                            it_asset_balances[a_idx] += amount
                            it_asset_cost_bases[a_idx] += amount
                            it_asset_balances[cash_idx] -= amount
                            investable -= amount
                            gia_contributions += amount

            # Apply asset growth
            investment_returns = 0.0
            isa_returns = 0.0
            gia_returns = 0.0
            cash_returns = 0.0
            for a_idx in range(n_assets):
                ret = asset_returns[it, y_idx, a_idx]
                inv_return = it_asset_balances[a_idx] * ret
                it_asset_balances[a_idx] += inv_return
                investment_returns += inv_return
                if asset_types[a_idx] == ASSET_ISA:
                    isa_returns += inv_return
                elif asset_types[a_idx] == ASSET_GIA:
                    gia_returns += inv_return
                elif asset_types[a_idx] == ASSET_CASH:
                    cash_returns += inv_return

            # Apply pension growth
            pension_investment_return = 0.0
            for pen_idx in range(n_pensions):
                ret = pension_returns[it, y_idx, pen_idx]
                inv_return = it_pension_balances[pen_idx] * ret
                it_pension_balances[pen_idx] += inv_return
                pension_investment_return += inv_return
            investment_returns += pension_investment_return

            # Apply interest on debt at end of year
            debt_interest_paid = it_debt_balance * debt_interest_rate
            it_debt_balance += debt_interest_paid

            # Calculate totals
            pension_balance = 0.0
            for pen_idx in range(n_pensions):
                pension_balance += it_pension_balances[pen_idx]

            isa_balance = 0.0
            cash_balance = 0.0
            gia_balance = 0.0
            total_asset_balance = 0.0
            for a_idx in range(n_assets):
                total_asset_balance += it_asset_balances[a_idx]
                if asset_types[a_idx] == ASSET_ISA:
                    isa_balance += it_asset_balances[a_idx]
                elif asset_types[a_idx] == ASSET_CASH:
                    cash_balance += it_asset_balances[a_idx]
                elif asset_types[a_idx] == ASSET_GIA:
                    gia_balance += it_asset_balances[a_idx]

            total_assets = total_asset_balance + pension_balance
            total_liabilities = it_mortgage_balance + it_debt_balance
            net_worth = total_assets - total_liabilities

            # Check bankruptcy threshold
            if net_worth < bankruptcy_threshold:
                it_is_bankrupt = True

            total_income = salary_net + rental_income_net + gift_income_total + pension_income_net + state_pension_income
            total_tax = income_tax + rental_income_tax + pension_income_tax + cgt_paid + ni_paid

            # Store results
            out[it, y_idx, F_NET_WORTH] = net_worth
            out[it, y_idx, F_SALARY_GROSS] = salary_gross_total
            out[it, y_idx, F_SALARY_NET] = salary_net
            out[it, y_idx, F_RENTAL_INCOME] = rental_income_net
            out[it, y_idx, F_GIFT_INCOME] = gift_income_total
            out[it, y_idx, F_PENSION_INCOME] = pension_income_net
            out[it, y_idx, F_STATE_PENSION_INCOME] = state_pension_income
            out[it, y_idx, F_INVESTMENT_RETURNS] = investment_returns
            out[it, y_idx, F_TOTAL_INCOME] = total_income
            out[it, y_idx, F_TOTAL_EXPENSES] = total_outflows
            out[it, y_idx, F_MORTGAGE_PAYMENT] = mortgage_payment
            out[it, y_idx, F_PENSION_CONTRIBUTIONS] = employee_pension_total + employer_pension_total
            out[it, y_idx, F_FUN_FUND] = extra_retirement_spend
            out[it, y_idx, F_INCOME_TAX_PAID] = income_tax + rental_income_tax + pension_income_tax + cgt_paid
            out[it, y_idx, F_NI_PAID] = ni_paid
            out[it, y_idx, F_TOTAL_TAX] = total_tax
            out[it, y_idx, F_ISA_BALANCE] = isa_balance
            out[it, y_idx, F_PENSION_BALANCE] = pension_balance
            out[it, y_idx, F_CASH_BALANCE] = cash_balance
            out[it, y_idx, F_TOTAL_ASSETS] = total_assets
            out[it, y_idx, F_MORTGAGE_BALANCE] = it_mortgage_balance
            out[it, y_idx, F_TOTAL_LIABILITIES] = total_liabilities
            out[it, y_idx, F_MORTGAGE_PAID_OFF] = 1.0 if it_mortgage_balance <= 0 else 0.0
            out[it, y_idx, F_IS_DEPLETED] = 1.0 if total_assets <= 0 else 0.0
            out[it, y_idx, F_IS_BANKRUPT] = 1.0 if it_is_bankrupt else 0.0
            out[it, y_idx, F_DEBT_BALANCE] = it_debt_balance
            out[it, y_idx, F_DEBT_INTEREST_PAID] = debt_interest_paid

            # Per-type details
            out[it, y_idx, F_ISA_RETURNS] = isa_returns
            out[it, y_idx, F_GIA_RETURNS] = gia_returns
            out[it, y_idx, F_CASH_RETURNS] = cash_returns
            out[it, y_idx, F_PENSION_RETURNS] = pension_investment_return

            out[it, y_idx, F_ISA_CONTRIBUTIONS] = isa_contributions
            out[it, y_idx, F_GIA_CONTRIBUTIONS] = gia_contributions
            out[it, y_idx, F_PENSION_CONTRIBUTIONS_TOTAL] = employee_pension_total + employer_pension_total

            out[it, y_idx, F_ISA_WITHDRAWALS] = isa_withdrawals
            out[it, y_idx, F_GIA_WITHDRAWALS] = gia_withdrawals
            out[it, y_idx, F_PENSION_WITHDRAWALS] = pension_withdrawals

            out[it, y_idx, F_GIA_BALANCE] = gia_balance

    return out

