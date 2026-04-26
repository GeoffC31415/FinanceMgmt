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
    """
    Solve for the pension taxable amount needed to achieve target_net_income.

    Uses binary search to correctly handle personal allowance tapering
    in the 100k-125,140 region (effective 60% marginal rate).
    """
    if target_net_income <= 0:
        return 0.0

    # Binary search for the taxable amount that produces target_net_income
    low = 0.0
    high = target_net_income * 3.0  # Upper bound (generous for high tax rates)

    for _ in range(40):  # ~penny precision
        mid = (low + high) / 2.0
        gross = mid / 0.75 if mid > 0 else 0.0

        total_tax = calculate_income_tax(
            taxable_income=other_taxable_income + mid,
            bands=bands,
        )
        base_tax = calculate_income_tax(
            taxable_income=other_taxable_income,
            bands=bands,
        )
        pension_tax = total_tax - base_tax
        net = gross - pension_tax

        if abs(net - target_net_income) < 0.01:
            return mid
        if net < target_net_income:
            low = mid
        else:
            high = mid

    return (low + high) / 2.0
