from __future__ import annotations


def apply_pension_contribution_relief(*, employee_contribution: float) -> float:
    """
    Basic UK assumption (simplified): employee contribution is taken pre-tax (net pay arrangement),
    so taxable pay is reduced by the contribution amount.
    """
    return max(0.0, employee_contribution)


def pension_tax_free_lump_sum(*, pension_pot_value: float) -> float:
    """Simplified: 25% of pension pot can be taken tax-free."""
    return max(0.0, pension_pot_value) * 0.25

