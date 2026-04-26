from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SalaryIncome:
    gross_annual: float
    annual_growth_rate: float
    employee_pension_pct: float
    employer_pension_pct: float
    start_year: int | None = None
    end_year: int | None = None

