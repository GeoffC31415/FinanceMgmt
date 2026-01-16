from __future__ import annotations

from dataclasses import dataclass

from backend.simulation.entities.base import SimContext


@dataclass
class GiftIncome:
    """
    Gift income - not subject to any tax.
    
    This represents money received as gifts (e.g., from family, inheritance, etc.).
    Gifts are:
    - Not subject to Income Tax
    - Not subject to National Insurance
    - Can be one-off or recurring within a date range
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
            "gift_income": self._income_gross,
        }
