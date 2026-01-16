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
    if target_net_income <= 0:
        return PensionDrawdownResult(
            gross_withdrawal=0.0,
            tax_free_amount=0.0,
            taxable_amount=0.0,
            tax_paid=0.0,
            net_income=0.0,
        )
    
    # Binary search for the gross withdrawal that gives us target net income
    # This is needed because tax is non-linear (different bands)
    low = 0.0
    high = min(pension_balance, target_net_income * 2)  # Upper bound guess
    
    # If pension is empty, nothing to withdraw
    if pension_balance <= 0:
        return PensionDrawdownResult(
            gross_withdrawal=0.0,
            tax_free_amount=0.0,
            taxable_amount=0.0,
            tax_paid=0.0,
            net_income=0.0,
        )
    
    # Iteratively find the right withdrawal amount
    for _ in range(50):  # Should converge quickly
        gross = (low + high) / 2
        result = _calculate_for_gross(
            gross_withdrawal=gross,
            other_taxable_income=other_taxable_income,
            bands=bands,
        )
        
        if abs(result.net_income - target_net_income) < 0.01:
            break
        
        if result.net_income < target_net_income:
            low = gross
        else:
            high = gross
    
    # Cap at pension balance
    if result.gross_withdrawal > pension_balance:
        return _calculate_for_gross(
            gross_withdrawal=pension_balance,
            other_taxable_income=other_taxable_income,
            bands=bands,
        )
    
    return result


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
