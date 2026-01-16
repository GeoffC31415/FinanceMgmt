from __future__ import annotations

from dataclasses import dataclass

from backend.simulation.entities.base import SimContext


@dataclass
class SalaryIncome:
    gross_annual: float
    annual_growth_rate: float
    employee_pension_pct: float
    employer_pension_pct: float
    start_year: int | None = None
    end_year: int | None = None

    _salary_gross: float = 0.0
    _pension_contributions: float = 0.0

    def step(self, *, context: SimContext) -> None:
        if self.start_year is not None and context.year < self.start_year:
            self._salary_gross = 0.0
            self._pension_contributions = 0.0
            return
        if self.end_year is not None and context.year > self.end_year:
            self._salary_gross = 0.0
            self._pension_contributions = 0.0
            return

        self.gross_annual *= 1.0 + self.annual_growth_rate
        self._salary_gross = self.gross_annual
        self._pension_contributions = self.gross_annual * (self.employee_pension_pct + self.employer_pension_pct)

    def get_balance_sheet(self) -> dict[str, float]:
        return {}

    def get_cash_flows(self) -> dict[str, float]:
        return {
            "salary_gross": self._salary_gross,
            "pension_contributions": self._pension_contributions,
        }

