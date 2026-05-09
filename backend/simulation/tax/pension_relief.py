"""
Pension contribution relief calculations (P1.6).

Supports three UK pension contribution methods:
- net_pay: Employee contributions reduce taxable salary; NI on gross salary.
- relief_at_source: Employee contributes from net pay; basic-rate gross-up;
  higher-rate relief via tax code adjustment (simplified).
- salary_sacrifice: Reduces both taxable salary and NI-able salary.

Returns detailed breakdowns for each method.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from backend.simulation.tax.income_tax import IncomeTaxBands, calculate_income_tax
from backend.simulation.tax.national_insurance import NationalInsuranceBands, calculate_ni_class1


class PensionContributionMethod(str, Enum):
    """How employee pension contributions are treated for tax/NI."""
    NET_PAY = "net_pay"
    RELIEF_AT_SOURCE = "relief_at_source"
    SALARY_SACRIFICE = "salary_sacrifice"


@dataclass(frozen=True)
class PensionContributionBreakdown:
    """Detailed breakdown of pension contribution tax treatment."""
    employee_gross_contribution: float  # Total contribution going into pension
    employee_net_cost: float  # What the employee actually pays out of pocket
    employer_contribution: float  # Employer's contribution
    total_contribution: float  # employee_gross + employer
    taxable_salary: float  # Salary after employee contribution relief
    niable_salary: float  # Salary subject to NI
    income_tax_saved: float  # Income tax saved via contribution
    ni_saved: float  # NI saved via contribution
    basic_rate_tax_relief: float  # Additional basic-rate relief (relief at source)
    higher_rate_tax_relief: float  # Additional higher-rate relief (relief at source)
    method: str  # Contribution method used


def pension_tax_free_lump_sum(*, pension_pot_value: float) -> float:
    """Simplified: 25% of pension pot can be taken tax-free."""
    return max(0.0, pension_pot_value) * 0.25


def apply_pension_contribution_relief(
    *,
    employee_contribution: float,
    method: PensionContributionMethod = PensionContributionMethod.NET_PAY,
    gross_salary: float = 0.0,
    bands: IncomeTaxBands | None = None,
    ni_bands: NationalInsuranceBands | None = None,
) -> float:
    """
    Calculate the taxable salary reduction for a given pension contribution.

    Args:
        employee_contribution: Employee's gross pension contribution.
        method: How the contribution is treated.
        gross_salary: Gross salary (needed for NI calculation).
        bands: Income tax bands.
        ni_bands: NI bands.

    Returns:
        The amount by which taxable salary is reduced.
    """
    if bands is None:
        bands = IncomeTaxBands()
    if ni_bands is None:
        ni_bands = NationalInsuranceBands()

    if method == PensionContributionMethod.NET_PAY:
        # Net pay: contribution reduces taxable salary, NI on gross
        return max(0.0, employee_contribution)

    elif method == PensionContributionMethod.RELIEF_AT_SOURCE:
        # Relief at source: employee contributes from net pay
        # The gross contribution is what goes into the pension
        # Taxable salary is NOT reduced; relief comes via tax code
        return 0.0

    elif method == PensionContributionMethod.SALARY_SACRIFICE:
        # Salary sacrifice: reduces both taxable salary and NI-able salary
        return max(0.0, employee_contribution)

    return max(0.0, employee_contribution)


def calculate_contribution_breakdown(
    *,
    gross_salary: float,
    employee_pension_pct: float,
    employer_pension_pct: float,
    method: PensionContributionMethod = PensionContributionMethod.NET_PAY,
    bands: IncomeTaxBands | None = None,
    ni_bands: NationalInsuranceBands | None = None,
) -> PensionContributionBreakdown:
    """
    Calculate detailed pension contribution breakdown for a given method.

    Args:
        gross_salary: Gross annual salary.
        employee_pension_pct: Employee contribution percentage (0-1).
        employer_pension_pct: Employer contribution percentage (0-1).
        method: Contribution method.
        bands: Income tax bands.
        ni_bands: NI bands.

    Returns:
        PensionContributionBreakdown with detailed figures.
    """
    if bands is None:
        bands = IncomeTaxBands()
    if ni_bands is None:
        ni_bands = NationalInsuranceBands()

    # Calculate employee gross contribution
    employee_gross = gross_salary * employee_pension_pct

    # Calculate employer contribution
    employer_contribution = gross_salary * employer_pension_pct

    if method == PensionContributionMethod.NET_PAY:
        # Net pay arrangement:
        # - Employee contribution reduces taxable salary
        # - NI is calculated on gross salary
        taxable_salary = max(0.0, gross_salary - employee_gross)
        niable_salary = gross_salary
        income_tax_saved = calculate_income_tax(
            taxable_income=gross_salary, bands=bands
        ) - calculate_income_tax(
            taxable_income=taxable_salary, bands=bands
        )
        ni_saved = 0.0  # NI on gross, so no NI saved

        return PensionContributionBreakdown(
            employee_gross_contribution=employee_gross,
            employee_net_cost=employee_gross,  # Net cost = gross for net pay
            employer_contribution=employer_contribution,
            total_contribution=employee_gross + employer_contribution,
            taxable_salary=taxable_salary,
            niable_salary=niable_salary,
            income_tax_saved=income_tax_saved,
            ni_saved=ni_saved,
            basic_rate_tax_relief=0.0,
            higher_rate_tax_relief=0.0,
            method=method.value,
        )

    elif method == PensionContributionMethod.RELIEF_AT_SOURCE:
        # Relief at source:
        # - Employee contributes from net pay
        # - Basic-rate tax is reclaimed automatically (gross-up)
        # - Higher-rate relief is via tax code
        # - NI is on gross salary
        taxable_salary = gross_salary  # No reduction for taxable income
        niable_salary = gross_salary

        # Basic-rate relief: contribution is grossed up at basic rate
        basic_rate = bands.basic_rate
        grossed_up = employee_gross / (1 - basic_rate) if basic_rate < 1 else employee_gross
        basic_relief = grossed_up - employee_gross

        # Higher-rate relief: difference between higher and basic rate
        higher_rate = bands.higher_rate
        higher_relief = employee_gross * (higher_rate - basic_rate)

        return PensionContributionBreakdown(
            employee_gross_contribution=grossed_up,
            employee_net_cost=employee_gross,  # What employee pays out of pocket
            employer_contribution=employer_contribution,
            total_contribution=grossed_up + employer_contribution,
            taxable_salary=taxable_salary,
            niable_salary=niable_salary,
            income_tax_saved=0.0,  # No direct reduction; relief via tax code
            ni_saved=0.0,
            basic_rate_tax_relief=basic_relief,
            higher_rate_tax_relief=higher_relief,
            method=method.value,
        )

    elif method == PensionContributionMethod.SALARY_SACRIFIFICE:
        # Salary sacrifice:
        # - Both taxable salary and NI-able salary are reduced
        taxable_salary = max(0.0, gross_salary - employee_gross)
        niable_salary = max(0.0, gross_salary - employee_gross)
        income_tax_saved = calculate_income_tax(
            taxable_income=gross_salary, bands=bands
        ) - calculate_income_tax(
            taxable_income=taxable_salary, bands=bands
        )

        # NI saved on the sacrificed amount
        ni_on_gross = calculate_ni_class1(gross_annual=gross_salary, bands=ni_bands)
        ni_on_reduced = calculate_ni_class1(gross_annual=niable_salary, bands=ni_bands)
        ni_saved = ni_on_gross - ni_on_reduced

        return PensionContributionBreakdown(
            employee_gross_contribution=employee_gross,
            employee_net_cost=employee_gross,
            employer_contribution=employer_contribution,
            total_contribution=employee_gross + employer_contribution,
            taxable_salary=taxable_salary,
            niable_salary=niable_salary,
            income_tax_saved=income_tax_saved,
            ni_saved=ni_saved,
            basic_rate_tax_relief=0.0,
            higher_rate_tax_relief=0.0,
            method=method.value,
        )

    # Fallback: treat as net pay
    return calculate_contribution_breakdown(
        gross_salary=gross_salary,
        employee_pension_pct=employee_pension_pct,
        employer_pension_pct=employer_pension_pct,
        method=PensionContributionMethod.NET_PAY,
        bands=bands,
        ni_bands=ni_bands,
    )
