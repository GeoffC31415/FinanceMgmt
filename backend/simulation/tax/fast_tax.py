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

    # Personal allowance tapering: reduced by £1 for every £2 above £100k.
    # This mirrors backend.simulation.tax.income_tax.calculate_income_tax and
    # backend.simulation.engine_fast._calculate_income_tax.
    effective_allowance = personal_allowance
    if taxable_income > 100_000.0:
        reduction = (taxable_income - 100_000.0) / 2.0
        if reduction > personal_allowance:
            reduction = personal_allowance
        effective_allowance = personal_allowance - reduction
        if effective_allowance < 0.0:
            effective_allowance = 0.0

    remaining = taxable_income
    tax = 0.0

    allowance = effective_allowance if remaining > effective_allowance else remaining
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

    low = 0.0
    high = pension_balance
    target_cap = target_net_income * 2.0
    if target_cap < high:
        high = target_cap

    gross = 0.0
    pension_tax = 0.0
    net_income = 0.0
    tax_on_other = calculate_income_tax_fast(
        taxable_income=other_taxable_income,
        personal_allowance=personal_allowance,
        basic_rate_limit=basic_rate_limit,
        higher_rate_limit=higher_rate_limit,
        basic_rate=basic_rate,
        higher_rate=higher_rate,
        additional_rate=additional_rate,
    )

    for _ in range(20):
        gross = (low + high) / 2.0
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
        pension_tax = total_tax - tax_on_other
        net_income = gross - pension_tax

        if net_income < target_net_income:
            low = gross
        else:
            high = gross

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
        pension_tax = total_tax - tax_on_other
        net_income = gross - pension_tax

    return gross, pension_tax, net_income
