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
F_PROPERTY_VALUE = 38
F_PROPERTY_RENTAL_INCOME = 39
F_PROPERTY_MAINTENANCE = 40
F_PROPERTY_RETURNS = 41
F_STATE_PENSION_TAX_PAID = 42

# P1.1: Structured tax breakdown fields
F_SALARY_INCOME_TAX_PAID = 43
F_RENTAL_INCOME_TAX_PAID = 44
F_PENSION_DRAWDOWN_TAX_PAID = 45
F_CAPITAL_GAINS_TAX_PAID = 46
F_SALARY_TAX_PERSONAL_ALLOWANCE_USED = 47
F_SALARY_TAX_PERSONAL_ALLOWANCE_LOST = 48
F_SALARY_TAX_BASIC_BAND_AMOUNT = 49
F_SALARY_TAX_BASIC_BAND_TAX = 50
F_SALARY_TAX_HIGHER_BAND_AMOUNT = 51
F_SALARY_TAX_HIGHER_BAND_TAX = 52
F_SALARY_TAX_ADDITIONAL_BAND_AMOUNT = 53
F_SALARY_TAX_ADDITIONAL_BAND_TAX = 54
F_SALARY_TAX_ALLOWANCE_TAPER_TAX = 55

# Separate CGT tracking by source
F_GIA_CGT_PAID = 56
F_PROPERTY_CGT_PAID = 57

# P1.5/P1.6: Pension rules
F_PENSION_ANNUAL_ALLOWANCE_CHARGE = 58
F_PENSION_TAX_FREE_CASH_REMAINING = 59
F_PENSION_TAX_FREE_CASH_TAKEN = 60
F_PENSION_MPA_ACTIVE = 61
F_PENSION_ANNUAL_ALLOWANCE = 62
F_PENSION_TAPERED_ALLOWANCE = 63
F_PENSION_IS_TAPERED = 64

N_FIELDS = 65

# Asset type codes
ASSET_CASH = 0
ASSET_ISA = 1
ASSET_GIA = 2

WITHDRAW_ASSET = 0
WITHDRAW_PENSION = 1
WITHDRAW_PROPERTY = 2

# Pension drawdown mode codes (P1.5)
DRAWDOWN_MODE_SIMPLE = 0
DRAWDOWN_MODE_UFULS = 1
DRAWDOWN_MODE_PCLS_THEN_DRAWDOWN = 2
DRAWDOWN_MODE_FULLY_TAXABLE = 3

# Pension contribution method codes (P1.6)
CONTRIB_METHOD_NET_PAY = 0
CONTRIB_METHOD_RELIEF_AT_SOURCE = 1
CONTRIB_METHOD_SALARY_SACRIFICE = 2


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
    n_properties = len(sc.property_names)
    n_pensions = len(sc.pension_keys)

    # Build withdrawal order across assets, pensions, and properties.
    # Sort descending by priority, ascending by name (approximated by index)
    withdrawal_items = []
    for i in range(n_assets):
        if sc.asset_types[i] != ASSET_CASH:
            withdrawal_items.append((sc.asset_withdrawal_priority[i], WITHDRAW_ASSET, i))
    for i in range(n_properties):
        withdrawal_items.append((sc.property_withdrawal_priority[i], WITHDRAW_PROPERTY, i))
    withdrawal_items.append((sc.pension_withdrawal_priority, WITHDRAW_PENSION, -1))
    # Sort: highest priority first, then by asset index
    withdrawal_items.sort(key=lambda x: (-x[0], x[2]))
    
    withdrawal_priority = np.array([w[0] for w in withdrawal_items], dtype=np.int32)
    withdrawal_kind = np.array([w[1] for w in withdrawal_items], dtype=np.int8)
    withdrawal_idx = np.array([w[2] for w in withdrawal_items], dtype=np.int32)

    # Find cash asset index
    cash_idx = -1
    for i in range(n_assets):
        if sc.asset_types[i] == ASSET_CASH:
            cash_idx = i
            break

    # Call the Numba kernel
    a = sc.assumptions
    n_people = len(sc.people_birth_years)
    gia_owner_lookup = np.full(n_assets, -1, dtype=np.intp)
    for ai in range(n_assets):
        if sc.asset_types[ai] == ASSET_GIA:
            gia_owner_lookup[ai] = sc.asset_gia_owner_idx[ai]
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
        n_people=n_people,
        gia_owner_lookup=gia_owner_lookup,
        # Properties
        property_person_idx=sc.property_person_idx,
        property_values=sc.property_values.copy(),
        property_cost_bases=sc.property_cost_bases.copy(),
        property_monthly_rental_income=sc.property_monthly_rental_income.copy(),
        property_rental_growth_rate=sc.property_rental_growth_rate,
        property_occupancy_rate=sc.property_occupancy_rate,
        property_mortgage_balance=sc.property_mortgage_balance.copy(),
        property_mortgage_rate=sc.property_mortgage_rate,
        property_mortgage_monthly_payment=sc.property_mortgage_monthly_payment,
        property_annual_maintenance_cost=sc.property_annual_maintenance_cost.copy(),
        property_maintenance_is_inflation_linked=sc.property_maintenance_is_inflation_linked,
        property_returns=returns.property_returns,
        n_properties=n_properties,
        # Pensions
        pension_person_idx=sc.pension_person_idx,
        pension_balances=sc.pension_balances.copy(),
        pension_returns=returns.pension_returns,
        n_pensions=n_pensions,
        # Expenses
        expense_annual_amount=sc.expense_annual_amount.copy(),
        expense_is_inflation_linked=sc.expense_is_inflation_linked,
        # Scenario params
        annual_spend_target=sc.annual_spend_target,
        withdrawal_priority=withdrawal_priority,
        withdrawal_kind=withdrawal_kind,
        withdrawal_idx=withdrawal_idx,
        # Assumptions
        inflation_rate=a.inflation_rate,
        isa_annual_limit=a.isa_annual_limit,
        state_pension_annual=a.state_pension_annual,
        cgt_annual_allowance=a.cgt_annual_allowance,
        emergency_fund_months=a.emergency_fund_months,
        pension_access_age=a.pension_access_age,
        debt_interest_rate=a.debt_interest_rate,
        bankruptcy_threshold=a.bankruptcy_threshold,
        # P1.5/P1.6: Pension rules
        pension_annual_allowance=a.pension_annual_allowance,
        pension_lump_sum_allowance=a.pension_lump_sum_allowance,
        pension_tapered_threshold=a.pension_tapered_threshold,
        pension_tapered_reduction_rate=a.pension_tapered_reduction_rate,
        pension_minimum_allowance=a.pension_minimum_allowance,
        mpaa_annual_allowance=a.mpaa_annual_allowance,
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
        "property_value", "property_rental_income", "property_maintenance", "property_returns",
        "state_pension_tax_paid",
        "salary_income_tax_paid", "rental_income_tax_paid",
        "pension_drawdown_tax_paid", "capital_gains_tax_paid",
        "salary_income_tax_personal_allowance_used", "salary_income_tax_personal_allowance_lost",
        "salary_income_tax_basic_band_amount", "salary_income_tax_basic_band_tax",
        "salary_income_tax_higher_band_amount", "salary_income_tax_higher_band_tax",
        "salary_income_tax_additional_band_amount", "salary_income_tax_additional_band_tax",
        "salary_income_tax_allowance_taper_tax",
        "gia_cgt_paid", "property_cgt_paid",
        # P1.5/P1.6: Pension rules
        "pension_annual_allowance_charge",
        "pension_tax_free_cash_remaining",
        "pension_tax_free_cash_taken",
        "pension_mpaa_active",
        "pension_annual_allowance",
        "pension_tapered_allowance",
        "pension_is_tapered",
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
def _calculate_income_tax_breakdown(
    taxable_income: float,
    pa: float, brl: float, hrl: float,
    br: float, hr: float, ar: float,
) -> tuple:
    """Return salary income tax split by bands plus explicit PA taper tax.

    Band amounts/taxes are calculated with the full personal allowance. The
    extra tax caused by personal allowance tapering is returned separately so
    high-income effective marginal rates are visible and totals reconcile with
    _calculate_income_tax().
    """
    if taxable_income <= 0.0:
        return (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    effective_pa = pa
    if taxable_income > 100_000.0:
        reduction = min(pa, (taxable_income - 100_000.0) / 2.0)
        effective_pa = max(0.0, pa - reduction)

    pa_used = min(taxable_income, effective_pa)
    pa_lost = max(0.0, pa - effective_pa)

    remaining_without_taper = max(0.0, taxable_income - pa)

    basic_band = max(0.0, brl - pa)
    basic_amount = min(remaining_without_taper, basic_band)
    remaining_without_taper -= basic_amount
    basic_tax = basic_amount * br

    higher_band = max(0.0, hrl - brl)
    higher_amount = min(remaining_without_taper, higher_band)
    remaining_without_taper -= higher_amount
    higher_tax = higher_amount * hr

    additional_amount = max(0.0, remaining_without_taper)
    additional_tax = additional_amount * ar

    total_tax = _calculate_income_tax(taxable_income, pa, brl, hrl, br, hr, ar)
    tax_without_taper = basic_tax + higher_tax + additional_tax
    taper_tax = max(0.0, total_tax - tax_without_taper)

    return (
        pa_used, pa_lost,
        basic_amount, basic_tax,
        higher_amount, higher_tax,
        additional_amount, additional_tax,
        taper_tax, total_tax,
    )


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


@njit(cache=True)
def _apply_cgt_tax(
    balance: float,
    cost_basis: float,
    gross: float,
    remaining_basic_rate_band: float,
    cgt_allowance_remaining: float,
) -> tuple:
    """Calculate CGT on a taxable (GIA/property) disposal.

    Returns (tax, allowance_used, new_cgt_allowance_remaining, basis_reduction).

    Uses income-dependent CGT rates after deducting available annual exemption:
      - 10% on taxable gains within the remaining basic rate band
      - 20% on taxable gains above the remaining basic rate band

    Cost basis is reduced proportionally to the fraction of the balance sold
    (identical-asset pooling / average cost method).
    """
    if balance <= 0 or gross <= 0:
        return 0.0, 0.0, cgt_allowance_remaining, 0.0

    total_gains = max(0.0, balance - cost_basis)
    gains_ratio = total_gains / balance if balance > 0 else 0.0
    gains_realized = gross * gains_ratio

    allowance_remaining = max(0.0, cgt_allowance_remaining)
    allowance_used = min(max(0.0, gains_realized), allowance_remaining)
    taxable_gains = max(0.0, gains_realized - allowance_used)

    taxable_lower = min(taxable_gains, max(0.0, remaining_basic_rate_band))
    taxable_higher = max(0.0, taxable_gains - taxable_lower)
    tax = taxable_lower * 0.10 + taxable_higher * 0.20

    new_allowance_remaining = allowance_remaining - allowance_used
    basis_reduction = cost_basis * (gross / balance) if balance > 0 else 0.0

    return tax, allowance_used, new_allowance_remaining, basis_reduction


@njit(cache=True)
def _remaining_basic_rate_band_for_cgt(
    taxable_income_before_pa: float,
    pa: float,
    brl: float,
) -> float:
    """Return remaining basic-rate band available for CGT lower-rate gains."""
    effective_pa = pa
    if taxable_income_before_pa > 100_000.0:
        taper_reduction = min(pa, (taxable_income_before_pa - 100_000.0) / 2.0)
        effective_pa = max(0.0, pa - taper_reduction)

    taxable_income = max(0.0, taxable_income_before_pa - effective_pa)
    basic_band = max(0.0, brl - pa)
    return max(0.0, basic_band - taxable_income)


@njit(cache=True)
def _apply_taxable_disposal(
    balance: float,
    cost_basis: float,
    requested_cash_amount: float,
    remaining_basic_rate_band: float,
    cgt_allowance_remaining: float,
) -> tuple:
    """Apply a GIA/property disposal and return updated scalar state.

    Returns (gross, tax, net, new_allowance_remaining, new_cost_basis, new_balance).
    """
    if balance <= 0.0 or requested_cash_amount <= 0.0:
        return 0.0, 0.0, 0.0, cgt_allowance_remaining, cost_basis, balance

    gross = min(balance, requested_cash_amount)
    tax, _, new_allowance_remaining, basis_reduction = _apply_cgt_tax(
        balance, cost_basis, gross, remaining_basic_rate_band, cgt_allowance_remaining,
    )
    net = gross - tax
    new_cost_basis = max(0.0, cost_basis - basis_reduction)
    new_balance = max(0.0, balance - gross)
    return gross, tax, net, new_allowance_remaining, new_cost_basis, new_balance


@njit(cache=True)
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
    n_people: int,
    gia_owner_lookup: np.ndarray,
    # Properties
    property_person_idx: np.ndarray,
    property_values: np.ndarray,
    property_cost_bases: np.ndarray,
    property_monthly_rental_income: np.ndarray,
    property_rental_growth_rate: np.ndarray,
    property_occupancy_rate: np.ndarray,
    property_mortgage_balance: np.ndarray,
    property_mortgage_rate: np.ndarray,
    property_mortgage_monthly_payment: np.ndarray,
    property_annual_maintenance_cost: np.ndarray,
    property_maintenance_is_inflation_linked: np.ndarray,
    property_returns: np.ndarray,
    n_properties: int,
    # Pensions
    pension_person_idx: np.ndarray,
    pension_balances: np.ndarray,
    pension_returns: np.ndarray,
    n_pensions: int,
    # Expenses
    expense_annual_amount: np.ndarray,
    expense_is_inflation_linked: np.ndarray,
    # Scenario
    annual_spend_target: float,
    withdrawal_priority: np.ndarray,
    withdrawal_kind: np.ndarray,
    withdrawal_idx: np.ndarray,
    # Assumptions
    inflation_rate: float,
    isa_annual_limit: float,
    state_pension_annual: float,
    cgt_annual_allowance: float,
    emergency_fund_months: float,
    pension_access_age: int,
    debt_interest_rate: float,
    bankruptcy_threshold: float,
    # P1.5/P1.6: Pension rules
    pension_annual_allowance: float,
    pension_lump_sum_allowance: float,
    pension_tapered_threshold: float,
    pension_tapered_reduction_rate: float,
    pension_minimum_allowance: float,
    mpaa_annual_allowance: float,
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
        it_property_values = property_values.copy()
        it_property_cost_bases = property_cost_bases.copy()
        it_property_monthly_rents = property_monthly_rental_income.copy()
        it_property_mortgage_balances = property_mortgage_balance.copy()
        it_property_maintenance_costs = property_annual_maintenance_cost.copy()
        it_pension_balances = pension_balances.copy()
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

        # P1.5/P1.6: Per-person pension state tracking
        it_pension_tax_free_remaining = np.full(n_people, pension_lump_sum_allowance, dtype=np.float64)
        it_pension_tax_free_taken = np.zeros(n_people, dtype=np.float64)
        it_pension_mpaa_active = np.zeros(n_people, dtype=np.int8)
        it_personal_allowance_for_taper = np.zeros(n_people, dtype=np.float64)  # PA used for tapered allowance calc
        it_pension_annual_allowance = np.full(n_people, pension_annual_allowance, dtype=np.float64)
        it_pension_is_tapered = np.zeros(n_people, dtype=np.int8)

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
                property_value_total = 0.0
                for a_idx in range(n_assets):
                    total_asset_balance += it_asset_balances[a_idx]
                    if asset_types[a_idx] == ASSET_ISA:
                        isa_balance += it_asset_balances[a_idx]
                    elif asset_types[a_idx] == ASSET_CASH:
                        cash_balance += it_asset_balances[a_idx]
                for prop_idx in range(n_properties):
                    property_value_total += it_property_values[prop_idx]
                total_property_mortgage_balance = 0.0
                for prop_idx in range(n_properties):
                    total_property_mortgage_balance += it_property_mortgage_balances[prop_idx]
                total_assets = total_asset_balance + property_value_total + pension_balance
                total_liabilities = total_property_mortgage_balance + it_debt_balance
                net_worth = total_assets - total_liabilities

                out[it, y_idx, F_NET_WORTH] = net_worth
                out[it, y_idx, F_ISA_BALANCE] = isa_balance
                out[it, y_idx, F_PENSION_BALANCE] = pension_balance
                out[it, y_idx, F_CASH_BALANCE] = cash_balance
                out[it, y_idx, F_TOTAL_ASSETS] = total_assets
                out[it, y_idx, F_MORTGAGE_BALANCE] = total_property_mortgage_balance
                out[it, y_idx, F_TOTAL_LIABILITIES] = total_liabilities
                out[it, y_idx, F_IS_DEPLETED] = 1.0
                out[it, y_idx, F_IS_BANKRUPT] = 1.0
                out[it, y_idx, F_DEBT_BALANCE] = it_debt_balance
                out[it, y_idx, F_DEBT_INTEREST_PAID] = 0.0
                out[it, y_idx, F_PROPERTY_VALUE] = property_value_total
                continue

            # Check retirement status for each adult person (skip children).
            # Extra retirement spending is phased in by adult retirement ratio:
            # if 1 of 2 adults is retired, 50% of the configured fun fund is spent.
            is_all_retired = True
            has_adults = False
            adult_count = 0
            retired_adult_count = 0
            for p in range(n_people):
                if people_is_child[p] == 1:
                    continue
                has_adults = True
                adult_count += 1
                age = year - people_birth_years[p]
                if age >= people_retirement_ages[p]:
                    retired_adult_count += 1
                else:
                    is_all_retired = False
            if not has_adults:
                is_all_retired = False

            # --- Per-person income accumulation ---
            # Track salary and pension contributions per person for correct tax
            per_person_salary = np.zeros(n_people, dtype=np.float64)
            per_person_employee_pension = np.zeros(n_people, dtype=np.float64)
            per_person_employer_pension = np.zeros(n_people, dtype=np.float64)
            per_person_rental = np.zeros(n_people, dtype=np.float64)
            per_person_state_pension = np.zeros(n_people, dtype=np.float64)

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

            # --- P1.5: Annual allowance check per person ---
            # Calculate effective allowance based on tapered rules and MPAA
            for p in range(n_people):
                if people_is_child[p] == 1:
                    continue
                # Threshold income = salary + benefits + employee pension contributions
                threshold_income = per_person_salary[p] + per_person_employee_pension[p]
                # Adjusted income = threshold income + employer contributions
                adjusted_income = threshold_income + per_person_employer_pension[p]

                is_tapered = 0
                effective_allowance = pension_annual_allowance

                if it_pension_mpaa_active[p] == 1:
                    # MPAA active: use lower allowance
                    effective_allowance = mpaa_annual_allowance
                elif threshold_income > pension_tapered_threshold:
                    # Tapered allowance applies
                    excess_income = adjusted_income - pension_tapered_threshold
                    reduction = min(pension_annual_allowance, excess_income * pension_tapered_reduction_rate)
                    effective_allowance = max(pension_minimum_allowance, pension_annual_allowance - reduction)
                    is_tapered = 1

                it_pension_annual_allowance[p] = effective_allowance
                it_pension_is_tapered[p] = is_tapered
                it_personal_allowance_for_taper[p] = per_person_salary[p] + per_person_employee_pension[p]

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

            property_rental_gross = 0.0
            property_maintenance_total = 0.0
            for prop_idx in range(n_properties):
                property_rent = it_property_monthly_rents[prop_idx] * 12.0 * property_occupancy_rate[prop_idx]
                property_rental_gross += property_rent
                owner_idx = property_person_idx[prop_idx] if prop_idx < len(property_person_idx) else 0
                if 0 <= owner_idx < n_people:
                    per_person_rental[owner_idx] += property_rent
                property_maintenance_total += it_property_maintenance_costs[prop_idx]
                it_property_monthly_rents[prop_idx] *= (1.0 + property_rental_growth_rate[prop_idx])
                if property_maintenance_is_inflation_linked[prop_idx] == 1:
                    it_property_maintenance_costs[prop_idx] *= (1.0 + inflation_rate)

            rental_income_gross += property_rental_gross

            # State pension is taxable income, assessed per person.  For output/cashflow
            # we keep the gross state pension income separately, then subtract the
            # marginal tax attributable to it after salary and rental income.
            state_pension_income = 0.0
            for p in range(n_people):
                if people_is_child[p] == 1:
                    continue
                age = year - people_birth_years[p]
                if age >= people_state_pension_ages[p]:
                    per_person_state_pension[p] += it_state_pension
                    state_pension_income += it_state_pension
            it_state_pension *= (1.0 + inflation_rate)

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
            state_pension_tax = 0.0
            salary_tax_pa_used = 0.0
            salary_tax_pa_lost = 0.0
            salary_tax_pa_used_per_person = np.zeros(n_people, dtype=np.float64)
            salary_tax_basic_amount = 0.0
            salary_tax_basic_tax = 0.0
            salary_tax_higher_amount = 0.0
            salary_tax_higher_tax = 0.0
            salary_tax_additional_amount = 0.0
            salary_tax_additional_tax = 0.0
            salary_tax_taper_tax = 0.0
            for p in range(n_people):
                if people_is_child[p] == 1:
                    continue
                p_salary = per_person_salary[p]
                p_emp_pension = per_person_employee_pension[p]
                p_rental = per_person_rental[p]
                p_state_pension = per_person_state_pension[p]

                # Income tax on salary (net of pension contributions)
                p_taxable_salary = max(0.0, p_salary - p_emp_pension)
                (
                    p_pa_used, p_pa_lost,
                    p_basic_amount, p_basic_tax,
                    p_higher_amount, p_higher_tax,
                    p_additional_amount, p_additional_tax,
                    p_taper_tax, p_income_tax,
                ) = _calculate_income_tax_breakdown(
                    p_taxable_salary, personal_allowance, basic_rate_limit,
                    higher_rate_limit, basic_rate, higher_rate, additional_rate,
                )
                income_tax += p_income_tax
                salary_tax_pa_used += p_pa_used
                salary_tax_pa_lost += p_pa_lost
                salary_tax_pa_used_per_person[p] = p_pa_used
                salary_tax_basic_amount += p_basic_amount
                salary_tax_basic_tax += p_basic_tax
                salary_tax_higher_amount += p_higher_amount
                salary_tax_higher_tax += p_higher_tax
                salary_tax_additional_amount += p_additional_amount
                salary_tax_additional_tax += p_additional_tax
                salary_tax_taper_tax += p_taper_tax
                # NI on gross salary (per person)
                ni_paid += _calculate_ni(
                    p_salary, ni_primary_threshold, ni_upper_earnings_limit,
                    ni_main_rate, ni_upper_rate,
                )
                # Marginal income tax on rental income (no NI). Tax ordering is:
                # salary after employee pension contributions, then rental/property
                # income, then state pension, then private pension drawdown.
                tax_without_rental = _calculate_income_tax(
                    p_taxable_salary, personal_allowance, basic_rate_limit,
                    higher_rate_limit, basic_rate, higher_rate, additional_rate,
                )
                tax_with_rental = tax_without_rental
                if p_rental > 0.0:
                    tax_with_rental = _calculate_income_tax(
                        p_taxable_salary + p_rental, personal_allowance, basic_rate_limit,
                        higher_rate_limit, basic_rate, higher_rate, additional_rate,
                    )
                    rental_income_tax += tax_with_rental - tax_without_rental

                # Marginal income tax on state pension (no NI), per recipient.
                if p_state_pension > 0.0:
                    tax_with_state_pension = _calculate_income_tax(
                        p_taxable_salary + p_rental + p_state_pension, personal_allowance, basic_rate_limit,
                        higher_rate_limit, basic_rate, higher_rate, additional_rate,
                    )
                    state_pension_tax += tax_with_state_pension - tax_with_rental

            salary_net = salary_gross_total - income_tax - ni_paid - employee_pension_total
            rental_income_net = rental_income_gross - rental_income_tax
            state_pension_income_net = state_pension_income - state_pension_tax

            # Remaining basic-rate band for CGT: each person's lower-rate CGT
            # headroom after taxable income already recognized in the year.  Pension
            # drawdown can occur before taxable disposals, so disposal sites refresh
            # the owner's band using per_person_pension_taxable before applying CGT.
            remaining_basic_rate_band = np.zeros(n_people, dtype=np.float64)
            for p in range(n_people):
                if people_is_child[p] == 1:
                    continue
                taxable_income_before_pa = max(0.0, per_person_salary[p] - per_person_employee_pension[p])
                taxable_income_before_pa += per_person_rental[p]
                taxable_income_before_pa += per_person_state_pension[p]
                remaining_basic_rate_band[p] = _remaining_basic_rate_band_for_cgt(
                    taxable_income_before_pa, personal_allowance, basic_rate_limit,
                )

            # Mortgage payment
            mortgage_payment = 0.0
            for prop_idx in range(n_properties):
                if it_property_mortgage_balances[prop_idx] <= 0.0:
                    continue
                updated_balance, property_payment = _step_mortgage(
                    it_property_mortgage_balances[prop_idx],
                    property_mortgage_rate[prop_idx],
                    property_mortgage_monthly_payment[prop_idx],
                )
                it_property_mortgage_balances[prop_idx] = updated_balance
                mortgage_payment += property_payment

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

            # Extra retirement spending phases in as each adult retires.
            retired_ratio = retired_adult_count / adult_count if adult_count > 0 else 0.0
            extra_retirement_spend = it_annual_spend * retired_ratio
            total_outflows = expense_total + mortgage_payment + property_maintenance_total + extra_retirement_spend
            # Inflate annual spend for next year (after use)
            it_annual_spend *= (1.0 + inflation_rate)

            # Emergency fund target
            monthly_outflows = total_outflows / 12.0 if total_outflows > 0 else 0.0
            emergency_target = monthly_outflows * emergency_fund_months

            # Add income to cash
            if cash_idx >= 0:
                it_asset_balances[cash_idx] += salary_net + rental_income_net + gift_income_total + state_pension_income_net
                it_asset_balances[cash_idx] -= total_outflows

            pension_income_net = 0.0
            pension_income_tax = 0.0
            per_person_pension_taxable = np.zeros(n_people, dtype=np.float64)
            cgt_paid = 0.0
            gia_cgt_paid = 0.0
            property_cgt_paid = 0.0
            cgt_allowance_remaining_by_person = np.full(n_people, cgt_annual_allowance, dtype=np.float64)

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

                    if withdrawal_kind[w_idx] == WITHDRAW_PENSION:
                        # Pension withdrawal: process each eligible owner's pots separately
                        # so each person uses their own allowance and tax bands.
                        for p_owner in range(n_people):
                            if shortfall <= 0:
                                break
                            if people_is_child[p_owner] == 1:
                                continue
                            if year - people_birth_years[p_owner] < pension_access_age:
                                continue

                            owner_pension_balance = 0.0
                            for pen_idx in range(n_pensions):
                                if pension_person_idx[pen_idx] == p_owner:
                                    owner_pension_balance += it_pension_balances[pen_idx]

                            if owner_pension_balance <= 0.0:
                                continue

                            other_taxable = max(0.0, per_person_salary[p_owner] - per_person_employee_pension[p_owner])
                            other_taxable += per_person_rental[p_owner]
                            other_taxable += per_person_state_pension[p_owner]
                            other_taxable += per_person_pension_taxable[p_owner]

                            gross, tax, net = _calculate_pension_drawdown(
                                shortfall, other_taxable, owner_pension_balance,
                                personal_allowance, basic_rate_limit, higher_rate_limit, basic_rate, higher_rate, additional_rate,
                            )
                            if net <= 0.0 and gross <= 0.0:
                                continue

                            pension_income_net += net
                            pension_income_tax += tax
                            per_person_pension_taxable[p_owner] += gross * 0.75
                            it_asset_balances[cash_idx] += net
                            shortfall -= net
                            pension_withdrawals += gross

                            # Proportionally withdraw from this owner's eligible pots only.
                            if gross > 0.0:
                                for pen_idx in range(n_pensions):
                                    if pension_person_idx[pen_idx] == p_owner and it_pension_balances[pen_idx] > 0.0:
                                        proportion = it_pension_balances[pen_idx] / owner_pension_balance
                                        it_pension_balances[pen_idx] -= gross * proportion
                    elif withdrawal_kind[w_idx] == WITHDRAW_ASSET:
                        # Asset withdrawal
                        a_idx = withdrawal_idx[w_idx]
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
                            balance = it_asset_balances[a_idx]
                            cost_basis = it_asset_cost_bases[a_idx]
                            if balance <= 0:
                                continue
                            gia_owner = gia_owner_lookup[a_idx]
                            if gia_owner < 0 or gia_owner >= n_people:
                                gia_owner = 0
                            taxable_before_pa = max(0.0, per_person_salary[gia_owner] - per_person_employee_pension[gia_owner])
                            taxable_before_pa += per_person_rental[gia_owner]
                            taxable_before_pa += per_person_state_pension[gia_owner]
                            taxable_before_pa += per_person_pension_taxable[gia_owner]
                            remaining_band = _remaining_basic_rate_band_for_cgt(
                                taxable_before_pa, personal_allowance, basic_rate_limit,
                            )
                            remaining_basic_rate_band[gia_owner] = remaining_band
                            gross, tax, net, new_allowance, new_basis, new_balance = _apply_taxable_disposal(
                                balance, cost_basis, shortfall, remaining_band, cgt_allowance_remaining_by_person[gia_owner],
                            )
                            cgt_allowance_remaining_by_person[gia_owner] = new_allowance
                            cgt_paid += tax
                            gia_cgt_paid += tax
                            it_asset_cost_bases[a_idx] = new_basis
                            it_asset_balances[a_idx] = new_balance
                            it_asset_balances[cash_idx] += net
                            shortfall -= net
                            gia_withdrawals += gross

                        else:
                            # Other: treat as tax-free
                            gross = min(it_asset_balances[a_idx], shortfall)
                            it_asset_balances[a_idx] -= gross
                            it_asset_balances[cash_idx] += gross
                            shortfall -= gross
                    else:
                        prop_idx = withdrawal_idx[w_idx]
                        if prop_idx < 0 or prop_idx >= n_properties:
                            continue
                        if it_property_values[prop_idx] <= 0:
                            continue

                        balance = it_property_values[prop_idx]
                        cost_basis = it_property_cost_bases[prop_idx]
                        if balance <= 0:
                            continue
                        prop_owner = property_person_idx[prop_idx] if prop_idx < len(property_person_idx) else 0
                        if prop_owner < 0 or prop_owner >= n_people:
                            prop_owner = 0
                        taxable_before_pa = max(0.0, per_person_salary[prop_owner] - per_person_employee_pension[prop_owner])
                        taxable_before_pa += per_person_rental[prop_owner]
                        taxable_before_pa += per_person_state_pension[prop_owner]
                        taxable_before_pa += per_person_pension_taxable[prop_owner]
                        remaining_band = _remaining_basic_rate_band_for_cgt(
                            taxable_before_pa, personal_allowance, basic_rate_limit,
                        )
                        remaining_basic_rate_band[prop_owner] = remaining_band
                        gross, tax, net, new_allowance, new_basis, new_balance = _apply_taxable_disposal(
                            balance, cost_basis, shortfall, remaining_band, cgt_allowance_remaining_by_person[prop_owner],
                        )
                        cgt_allowance_remaining_by_person[prop_owner] = new_allowance
                        cgt_paid += tax
                        property_cgt_paid += tax
                        it_property_cost_bases[prop_idx] = new_basis
                        mortgage_repayment = 0.0
                        if balance > 0.0 and it_property_mortgage_balances[prop_idx] > 0.0 and gross > 0.0:
                            mortgage_repayment = min(
                                it_property_mortgage_balances[prop_idx],
                                it_property_mortgage_balances[prop_idx] * (gross / balance),
                            )
                            it_property_mortgage_balances[prop_idx] -= mortgage_repayment
                        it_property_values[prop_idx] = new_balance
                        net_after_mortgage = max(0.0, net - mortgage_repayment)
                        it_asset_balances[cash_idx] += net_after_mortgage
                        shortfall -= net_after_mortgage

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
                        
                    if withdrawal_kind[w_idx] == WITHDRAW_PENSION:
                        # Pension withdrawal to repay debt, processed per owner for tax.
                        for p_owner in range(n_people):
                            if debt_to_repay <= 0:
                                break
                            if people_is_child[p_owner] == 1:
                                continue
                            if year - people_birth_years[p_owner] < pension_access_age:
                                continue

                            owner_pension_balance = 0.0
                            for pen_idx in range(n_pensions):
                                if pension_person_idx[pen_idx] == p_owner:
                                    owner_pension_balance += it_pension_balances[pen_idx]

                            if owner_pension_balance <= 0.0:
                                continue

                            debt_other_taxable = max(0.0, per_person_salary[p_owner] - per_person_employee_pension[p_owner])
                            debt_other_taxable += per_person_rental[p_owner]
                            debt_other_taxable += per_person_state_pension[p_owner]
                            debt_other_taxable += per_person_pension_taxable[p_owner]

                            gross, tax, net = _calculate_pension_drawdown(
                                debt_to_repay, debt_other_taxable, owner_pension_balance,
                                personal_allowance, basic_rate_limit, higher_rate_limit, basic_rate, higher_rate, additional_rate,
                            )
                            if net > 0.0:
                                # Use the net to pay down debt
                                actual_repayment = min(net, it_debt_balance)
                                it_debt_balance -= actual_repayment
                                debt_to_repay -= actual_repayment
                                pension_income_net += net
                                pension_income_tax += tax
                                per_person_pension_taxable[p_owner] += gross * 0.75
                                pension_withdrawals += gross

                                # Proportionally withdraw from this owner's eligible pots only.
                                if gross > 0.0:
                                    for pen_idx in range(n_pensions):
                                        if pension_person_idx[pen_idx] == p_owner and it_pension_balances[pen_idx] > 0.0:
                                            proportion = it_pension_balances[pen_idx] / owner_pension_balance
                                            it_pension_balances[pen_idx] -= gross * proportion
                    elif withdrawal_kind[w_idx] == WITHDRAW_ASSET:
                        # Asset withdrawal to repay debt
                        a_idx = withdrawal_idx[w_idx]
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
                            balance = it_asset_balances[a_idx]
                            cost_basis = it_asset_cost_bases[a_idx]
                            if balance <= 0:
                                continue
                            gia_owner = gia_owner_lookup[a_idx]
                            if gia_owner < 0 or gia_owner >= n_people:
                                gia_owner = 0
                            taxable_before_pa = max(0.0, per_person_salary[gia_owner] - per_person_employee_pension[gia_owner])
                            taxable_before_pa += per_person_rental[gia_owner]
                            taxable_before_pa += per_person_state_pension[gia_owner]
                            taxable_before_pa += per_person_pension_taxable[gia_owner]
                            remaining_band = _remaining_basic_rate_band_for_cgt(
                                taxable_before_pa, personal_allowance, basic_rate_limit,
                            )
                            remaining_basic_rate_band[gia_owner] = remaining_band
                            gross, tax, net, new_allowance, new_basis, new_balance = _apply_taxable_disposal(
                                balance, cost_basis, debt_to_repay, remaining_band, cgt_allowance_remaining_by_person[gia_owner],
                            )
                            cgt_allowance_remaining_by_person[gia_owner] = new_allowance
                            cgt_paid += tax
                            gia_cgt_paid += tax
                            it_asset_cost_bases[a_idx] = new_basis
                            it_asset_balances[a_idx] = new_balance
                            actual_repayment = min(net, it_debt_balance)
                            it_debt_balance -= actual_repayment
                            debt_to_repay -= actual_repayment
                            gia_withdrawals += gross
                    else:
                        prop_idx = withdrawal_idx[w_idx]
                        if prop_idx < 0 or prop_idx >= n_properties:
                            continue
                        if it_property_values[prop_idx] <= 0:
                            continue

                        balance = it_property_values[prop_idx]
                        cost_basis = it_property_cost_bases[prop_idx]
                        if balance <= 0:
                            continue
                        prop_owner = property_person_idx[prop_idx] if prop_idx < len(property_person_idx) else 0
                        if prop_owner < 0 or prop_owner >= n_people:
                            prop_owner = 0
                        taxable_before_pa = max(0.0, per_person_salary[prop_owner] - per_person_employee_pension[prop_owner])
                        taxable_before_pa += per_person_rental[prop_owner]
                        taxable_before_pa += per_person_state_pension[prop_owner]
                        taxable_before_pa += per_person_pension_taxable[prop_owner]
                        remaining_band = _remaining_basic_rate_band_for_cgt(
                            taxable_before_pa, personal_allowance, basic_rate_limit,
                        )
                        remaining_basic_rate_band[prop_owner] = remaining_band
                        gross, tax, net, new_allowance, new_basis, new_balance = _apply_taxable_disposal(
                            balance, cost_basis, debt_to_repay, remaining_band, cgt_allowance_remaining_by_person[prop_owner],
                        )
                        cgt_allowance_remaining_by_person[prop_owner] = new_allowance
                        cgt_paid += tax
                        property_cgt_paid += tax
                        it_property_cost_bases[prop_idx] = new_basis
                        mortgage_repayment = 0.0
                        if balance > 0.0 and it_property_mortgage_balances[prop_idx] > 0.0 and gross > 0.0:
                            mortgage_repayment = min(
                                it_property_mortgage_balances[prop_idx],
                                it_property_mortgage_balances[prop_idx] * (gross / balance),
                            )
                            it_property_mortgage_balances[prop_idx] -= mortgage_repayment
                        it_property_values[prop_idx] = new_balance
                        net_after_mortgage = max(0.0, net - mortgage_repayment)
                        actual_repayment = min(net_after_mortgage, it_debt_balance)
                        it_debt_balance -= actual_repayment
                        debt_to_repay -= actual_repayment

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
            property_investment_return = 0.0
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

            for prop_idx in range(n_properties):
                ret = property_returns[it, y_idx, prop_idx]
                inv_return = it_property_values[prop_idx] * ret
                it_property_values[prop_idx] += inv_return
                investment_returns += inv_return
                property_investment_return += inv_return

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
            property_value_total = 0.0
            total_asset_balance = 0.0
            for a_idx in range(n_assets):
                total_asset_balance += it_asset_balances[a_idx]
                if asset_types[a_idx] == ASSET_ISA:
                    isa_balance += it_asset_balances[a_idx]
                elif asset_types[a_idx] == ASSET_CASH:
                    cash_balance += it_asset_balances[a_idx]
                elif asset_types[a_idx] == ASSET_GIA:
                    gia_balance += it_asset_balances[a_idx]

            for prop_idx in range(n_properties):
                property_value_total += it_property_values[prop_idx]
            total_property_mortgage_balance = 0.0
            for prop_idx in range(n_properties):
                total_property_mortgage_balance += it_property_mortgage_balances[prop_idx]

            total_assets = total_asset_balance + property_value_total + pension_balance
            total_liabilities = total_property_mortgage_balance + it_debt_balance
            net_worth = total_assets - total_liabilities

            # Check bankruptcy threshold
            if net_worth < bankruptcy_threshold:
                it_is_bankrupt = True

            total_income = salary_net + rental_income_net + gift_income_total + pension_income_net + state_pension_income_net
            total_tax = income_tax + rental_income_tax + state_pension_tax + pension_income_tax + cgt_paid + ni_paid

            # Store results
            out[it, y_idx, F_NET_WORTH] = net_worth
            out[it, y_idx, F_SALARY_GROSS] = salary_gross_total
            out[it, y_idx, F_SALARY_NET] = salary_net
            out[it, y_idx, F_RENTAL_INCOME] = rental_income_gross
            out[it, y_idx, F_GIFT_INCOME] = gift_income_total
            out[it, y_idx, F_PENSION_INCOME] = pension_income_net
            out[it, y_idx, F_STATE_PENSION_INCOME] = state_pension_income
            out[it, y_idx, F_INVESTMENT_RETURNS] = investment_returns
            out[it, y_idx, F_TOTAL_INCOME] = total_income
            out[it, y_idx, F_TOTAL_EXPENSES] = total_outflows
            out[it, y_idx, F_MORTGAGE_PAYMENT] = mortgage_payment
            out[it, y_idx, F_PENSION_CONTRIBUTIONS] = employee_pension_total + employer_pension_total
            out[it, y_idx, F_FUN_FUND] = extra_retirement_spend
            out[it, y_idx, F_INCOME_TAX_PAID] = income_tax + rental_income_tax + state_pension_tax + pension_income_tax
            out[it, y_idx, F_NI_PAID] = ni_paid
            out[it, y_idx, F_TOTAL_TAX] = total_tax
            out[it, y_idx, F_ISA_BALANCE] = isa_balance
            out[it, y_idx, F_PENSION_BALANCE] = pension_balance
            out[it, y_idx, F_CASH_BALANCE] = cash_balance
            out[it, y_idx, F_TOTAL_ASSETS] = total_assets
            out[it, y_idx, F_MORTGAGE_BALANCE] = total_property_mortgage_balance
            out[it, y_idx, F_TOTAL_LIABILITIES] = total_liabilities
            out[it, y_idx, F_MORTGAGE_PAID_OFF] = 1.0 if total_property_mortgage_balance <= 0 else 0.0
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
            out[it, y_idx, F_PROPERTY_VALUE] = property_value_total
            out[it, y_idx, F_PROPERTY_RENTAL_INCOME] = property_rental_gross
            out[it, y_idx, F_PROPERTY_MAINTENANCE] = property_maintenance_total
            out[it, y_idx, F_PROPERTY_RETURNS] = property_investment_return
            out[it, y_idx, F_STATE_PENSION_TAX_PAID] = state_pension_tax
            # P1.1: Structured tax breakdown
            out[it, y_idx, F_SALARY_INCOME_TAX_PAID] = income_tax
            out[it, y_idx, F_RENTAL_INCOME_TAX_PAID] = rental_income_tax
            out[it, y_idx, F_PENSION_DRAWDOWN_TAX_PAID] = pension_income_tax
            out[it, y_idx, F_CAPITAL_GAINS_TAX_PAID] = cgt_paid
            out[it, y_idx, F_GIA_CGT_PAID] = gia_cgt_paid
            out[it, y_idx, F_PROPERTY_CGT_PAID] = property_cgt_paid
            out[it, y_idx, F_SALARY_TAX_PERSONAL_ALLOWANCE_USED] = salary_tax_pa_used
            out[it, y_idx, F_SALARY_TAX_PERSONAL_ALLOWANCE_LOST] = salary_tax_pa_lost
            out[it, y_idx, F_SALARY_TAX_BASIC_BAND_AMOUNT] = salary_tax_basic_amount
            out[it, y_idx, F_SALARY_TAX_BASIC_BAND_TAX] = salary_tax_basic_tax
            out[it, y_idx, F_SALARY_TAX_HIGHER_BAND_AMOUNT] = salary_tax_higher_amount
            out[it, y_idx, F_SALARY_TAX_HIGHER_BAND_TAX] = salary_tax_higher_tax
            out[it, y_idx, F_SALARY_TAX_ADDITIONAL_BAND_AMOUNT] = salary_tax_additional_amount
            out[it, y_idx, F_SALARY_TAX_ADDITIONAL_BAND_TAX] = salary_tax_additional_tax
            out[it, y_idx, F_SALARY_TAX_ALLOWANCE_TAPER_TAX] = salary_tax_taper_tax

            # P1.5/P1.6: Pension rules output
            # Annual allowance charge per person (summed)
            total_aa_charge = 0.0
            for p in range(n_people):
                if people_is_child[p] == 1:
                    continue
                total_contrib = per_person_employee_pension[p] + per_person_employer_pension[p]
                excess = max(0.0, total_contrib - it_pension_annual_allowance[p])
                total_aa_charge += excess
            out[it, y_idx, F_PENSION_ANNUAL_ALLOWANCE_CHARGE] = total_aa_charge

            # Tax-free cash remaining (summed across people)
            total_tax_free_remaining = 0.0
            total_tax_free_taken = 0.0
            for p in range(n_people):
                total_tax_free_remaining += it_pension_tax_free_remaining[p]
                total_tax_free_taken += it_pension_tax_free_taken[p]
            out[it, y_idx, F_PENSION_TAX_FREE_CASH_REMAINING] = total_tax_free_remaining
            out[it, y_idx, F_PENSION_TAX_FREE_CASH_TAKEN] = total_tax_free_taken

            # MPAA active (summed)
            total_mpaa = 0.0
            for p in range(n_people):
                total_mpaa += it_pension_mpaa_active[p]
            out[it, y_idx, F_PENSION_MPA_ACTIVE] = total_mpaa

            # Annual allowance and tapered status (averaged)
            out[it, y_idx, F_PENSION_ANNUAL_ALLOWANCE] = np.mean(it_pension_annual_allowance)
            out[it, y_idx, F_PENSION_TAPERED_ALLOWANCE] = np.mean(
                np.where(it_pension_is_tapered == 1,
                         pension_minimum_allowance,
                         pension_annual_allowance)
            )
            out[it, y_idx, F_PENSION_IS_TAPERED] = np.max(it_pension_is_tapered)

    return out

