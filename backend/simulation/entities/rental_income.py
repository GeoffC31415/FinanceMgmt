from __future__ import annotations

from dataclasses import dataclass

from backend.simulation.entities.base import SimContext


@dataclass
class RentalIncome:
    """
    Rental income - taxable as part of personal income.
    
    Unlike salary, rental income:
    - Does not have pension contributions
    - Is not subject to National Insurance
    - Is subject to Income Tax
    - Can continue into retirement (no automatic end at retirement age)
    """
    gross_annual: float
    annual_growth_rate: float
    start_year: int | None = None
    end_year: int | None = None

    _income_gross: float = 0.0

    def step(self, *, context: SimContext) -> None:
        if self.start_year is not None and context.year < self.start_year:
            self._income_gross = 0.0
            return
        if self.end_year is not None and context.year > self.end_year:
            self._income_gross = 0.0
            return

        self.gross_annual *= 1.0 + self.annual_growth_rate
        self._income_gross = self.gross_annual

    def get_balance_sheet(self) -> dict[str, float]:
        return {}

    def get_cash_flows(self) -> dict[str, float]:
        return {
            "rental_income_gross": self._income_gross,
        }
