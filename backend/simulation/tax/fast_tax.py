from __future__ import annotations

from numba import njit


@njit(cache=True)
def calculate_income_tax_fast(
    taxable_income: float,
    personal_allowance: float,
    basic_rate_limit: float,
    higher_rate_limit: float,
    basic_rate: float,
    higher_rate: float,
    additional_rate: float,
) -> float:
    if taxable_income <= 0:
        return 0.0

    remaining = taxable_income
    tax = 0.0

    allowance = personal_allowance if remaining > personal_allowance else remaining
    remaining -= allowance
    if remaining <= 0:
        return 0.0

    basic_band = basic_rate_limit - personal_allowance
    if basic_band < 0:
        basic_band = 0.0
    basic_amount = remaining if remaining < basic_band else basic_band
    tax += basic_amount * basic_rate
    remaining -= basic_amount
    if remaining <= 0:
        return tax

    higher_band = higher_rate_limit - basic_rate_limit
    if higher_band < 0:
        higher_band = 0.0
    higher_amount = remaining if remaining < higher_band else higher_band
    tax += higher_amount * higher_rate
    remaining -= higher_amount
    if remaining <= 0:
        return tax

    tax += remaining * additional_rate
    return tax


@njit(cache=True)
def calculate_pension_drawdown_fast(
    target_net_income: float,
    other_taxable_income: float,
    pension_balance: float,
    personal_allowance: float,
    basic_rate_limit: float,
    higher_rate_limit: float,
    basic_rate: float,
    higher_rate: float,
    additional_rate: float,
) -> tuple[float, float, float]:
    if target_net_income <= 0 or pension_balance <= 0:
        return 0.0, 0.0, 0.0

    taxable_needed = _solve_taxable_amount_fast(
        target_net_income=target_net_income,
        other_taxable_income=other_taxable_income,
        personal_allowance=personal_allowance,
        basic_rate_limit=basic_rate_limit,
        higher_rate_limit=higher_rate_limit,
        basic_rate=basic_rate,
        higher_rate=higher_rate,
        additional_rate=additional_rate,
    )
    gross = taxable_needed / 0.75 if taxable_needed > 0 else 0.0
    if gross > pension_balance:
        gross = pension_balance

    taxable_amount = gross * 0.75
    total_tax = calculate_income_tax_fast(
        taxable_income=other_taxable_income + taxable_amount,
        personal_allowance=personal_allowance,
        basic_rate_limit=basic_rate_limit,
        higher_rate_limit=higher_rate_limit,
        basic_rate=basic_rate,
        higher_rate=higher_rate,
        additional_rate=additional_rate,
    )
    tax_on_other = calculate_income_tax_fast(
        taxable_income=other_taxable_income,
        personal_allowance=personal_allowance,
        basic_rate_limit=basic_rate_limit,
        higher_rate_limit=higher_rate_limit,
        basic_rate=basic_rate,
        higher_rate=higher_rate,
        additional_rate=additional_rate,
    )
    pension_tax = total_tax - tax_on_other
    net_income = gross - pension_tax
    return gross, pension_tax, net_income


@njit(cache=True)
def _solve_taxable_amount_fast(
    target_net_income: float,
    other_taxable_income: float,
    personal_allowance: float,
    basic_rate_limit: float,
    higher_rate_limit: float,
    basic_rate: float,
    higher_rate: float,
    additional_rate: float,
) -> float:
    if target_net_income <= 0:
        return 0.0

    base_income = other_taxable_income if other_taxable_income > 0 else 0.0
    remaining_net = target_net_income
    taxable_needed = 0.0

    limits = (personal_allowance, basic_rate_limit, higher_rate_limit)
    rates = (0.0, basic_rate, higher_rate)

    previous_limit = 0.0
    current_income = base_income

    for idx in range(3):
        band_end = limits[idx]
        rate = rates[idx]
        band_start = previous_limit
        previous_limit = band_end

        if current_income >= band_end:
            continue

        available = band_end - (current_income if current_income > band_start else band_start)
        if available <= 0:
            continue

        net_per_taxable = (4.0 / 3.0) - rate
        net_available = available * net_per_taxable
        if remaining_net <= net_available:
            taxable_needed += remaining_net / net_per_taxable
            return taxable_needed

        taxable_needed += available
        remaining_net -= net_available
        current_income = band_end

    net_per_taxable = (4.0 / 3.0) - additional_rate
    if net_per_taxable <= 0:
        return taxable_needed
    taxable_needed += remaining_net / net_per_taxable
    return taxable_needed
