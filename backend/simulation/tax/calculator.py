from __future__ import annotations

from dataclasses import dataclass

from backend.simulation.tax.income_tax import IncomeTaxBands, calculate_income_tax
from backend.simulation.tax.national_insurance import NationalInsuranceBands, calculate_ni_class1
from backend.simulation.tax.pension_relief import apply_pension_contribution_relief


@dataclass(frozen=True)
class TaxBreakdown:
    taxable_income: float
    income_tax: float
    national_insurance: float

    @property
    def total_tax(self) -> float:
        return self.income_tax + self.national_insurance


@dataclass(frozen=True)
class TaxCalculator:
    """
    Simplified UK assumptions, parameterized so we can update bands later.
    - Income tax bands using personal allowance + basic/higher/additional rates
    - NI class 1 on gross salary
    - Pension contributions reduce taxable income (net pay arrangement)
    """

    income_tax_bands: IncomeTaxBands = IncomeTaxBands()
    ni_bands: NationalInsuranceBands = NationalInsuranceBands()

    def calculate_for_salary(
        self,
        *,
        gross_salary: float,
        employee_pension_contribution: float,
    ) -> TaxBreakdown:
        pension_relief = apply_pension_contribution_relief(employee_contribution=employee_pension_contribution)
        taxable_income = max(0.0, gross_salary - pension_relief)

        income_tax = calculate_income_tax(taxable_income=taxable_income, bands=self.income_tax_bands)
        national_insurance = calculate_ni_class1(gross_annual=gross_salary, bands=self.ni_bands)

        return TaxBreakdown(
            taxable_income=taxable_income,
            income_tax=income_tax,
            national_insurance=national_insurance,
        )

