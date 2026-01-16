from __future__ import annotations

from dataclasses import dataclass

from backend.simulation.entities.base import SimContext


@dataclass
class ExpenseItem:
    name: str
    annual_amount: float
    is_inflation_linked: bool = True

    _annual_spend: float = 0.0

    def step(self, *, context: SimContext) -> None:
        # Spend this year at the current amount, then apply inflation for next year.
        self._annual_spend = self.annual_amount
        if self.is_inflation_linked:
            self.annual_amount *= 1.0 + context.inflation_rate

    def get_balance_sheet(self) -> dict[str, float]:
        return {}

    def get_cash_flows(self) -> dict[str, float]:
        return {"expenses": self._annual_spend}

