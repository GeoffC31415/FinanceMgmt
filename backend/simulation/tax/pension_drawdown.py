from __future__ import annotations

from dataclasses import dataclass

from backend.simulation.tax.income_tax import IncomeTaxBands, calculate_income_tax


@dataclass(frozen=True)
class PensionDrawdownResult:
    """Result of a pension drawdown calculation."""
    gross_withdrawal: float  # Total amount withdrawn from pension pot
    tax_free_amount: float   # 25% of withdrawal (PCLS)
    taxable_amount: float    # 75% of withdrawal
    tax_paid: float          # Income tax on taxable portion
    net_income: float        # Actual cash received after tax


def calculate_pension_drawdown(
    *,
    target_net_income: float,
    other_taxable_income: float,
    pension_balance: float,
    bands: IncomeTaxBands = IncomeTaxBands(),
) -> PensionDrawdownResult:
    """
    Calculate optimal pension drawdown to meet target net income.
    
    Strategy:
    - 25% of pension withdrawal is tax-free (PCLS)
    - 75% is taxable income
    - Use personal allowance to shelter taxable portion
    - Pay income tax on amounts above personal allowance
    
    Args:
        target_net_income: The net income needed from pension drawdown
        other_taxable_income: Other taxable income this year (e.g., state pension)
        pension_balance: Current pension pot balance
        bands: Tax bands to use for calculation
    
    Returns:
        PensionDrawdownResult with withdrawal amounts and tax
    """
    if target_net_income <= 0 or pension_balance <= 0:
        return PensionDrawdownResult(
            gross_withdrawal=0.0,
            tax_free_amount=0.0,
            taxable_amount=0.0,
            tax_paid=0.0,
            net_income=0.0,
        )

    gross = _solve_gross_withdrawal(
        target_net_income=target_net_income,
        other_taxable_income=other_taxable_income,
        pension_balance=pension_balance,
        bands=bands,
    )
    return _calculate_for_gross(
        gross_withdrawal=gross,
        other_taxable_income=other_taxable_income,
        bands=bands,
    )


def _calculate_for_gross(
    *,
    gross_withdrawal: float,
    other_taxable_income: float,
    bands: IncomeTaxBands,
) -> PensionDrawdownResult:
    """Calculate net income for a given gross pension withdrawal."""
    tax_free_amount = gross_withdrawal * 0.25
    taxable_amount = gross_withdrawal * 0.75
    
    # Calculate tax on total taxable income (other income + pension taxable portion)
    total_taxable_income = other_taxable_income + taxable_amount
    total_tax = calculate_income_tax(taxable_income=total_taxable_income, bands=bands)
    
    # Tax attributable to pension income is the marginal tax
    # (total tax with pension - tax on other income alone)
    tax_on_other = calculate_income_tax(taxable_income=other_taxable_income, bands=bands)
    pension_tax = total_tax - tax_on_other
    
    net_income = gross_withdrawal - pension_tax
    
    return PensionDrawdownResult(
        gross_withdrawal=gross_withdrawal,
        tax_free_amount=tax_free_amount,
        taxable_amount=taxable_amount,
        tax_paid=pension_tax,
        net_income=net_income,
    )


def _solve_gross_withdrawal(
    *,
    target_net_income: float,
    other_taxable_income: float,
    pension_balance: float,
    bands: IncomeTaxBands,
) -> float:
    """
    Closed-form solution for pension drawdown based on piecewise-linear tax bands.

    Net income per unit of pension taxable income depends on the marginal tax rate:
    - gross = taxable / 0.75
    - net = gross - tax
    => net per taxable = 4/3 - rate
    """
    taxable_target = _solve_taxable_amount(
        target_net_income=target_net_income,
        other_taxable_income=other_taxable_income,
        bands=bands,
    )
    gross = taxable_target / 0.75 if taxable_target > 0 else 0.0
    return min(gross, pension_balance)


def _solve_taxable_amount(
    *,
    target_net_income: float,
    other_taxable_income: float,
    bands: IncomeTaxBands,
) -> float:
    if target_net_income <= 0:
        return 0.0

    base_income = max(0.0, other_taxable_income)
    remaining_net = target_net_income
    taxable_needed = 0.0

    band_limits = (
        (bands.personal_allowance, 0.0),
        (bands.basic_rate_limit, bands.basic_rate),
        (bands.higher_rate_limit, bands.higher_rate),
    )

    previous_limit = 0.0
    current_income = base_income

    for limit, rate in band_limits:
        band_start = previous_limit
        band_end = limit
        previous_limit = limit

        if current_income >= band_end:
            continue

        available = band_end - max(current_income, band_start)
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

    # Additional rate band (no upper limit)
    additional_rate = bands.additional_rate
    net_per_taxable = (4.0 / 3.0) - additional_rate
    if net_per_taxable <= 0:
        return taxable_needed
    taxable_needed += remaining_net / net_per_taxable
    return taxable_needed
