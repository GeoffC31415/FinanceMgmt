from __future__ import annotations

from dataclasses import dataclass

from backend.simulation.entities.base import SimContext


@dataclass
class StatePension:
    annual_amount: float
    is_active: bool = False

    _paid: float = 0.0

    def step(self, *, context: SimContext) -> None:
        self._paid = self.annual_amount if self.is_active else 0.0

    def get_balance_sheet(self) -> dict[str, float]:
        return {}

    def get_cash_flows(self) -> dict[str, float]:
        return {"state_pension_income": self._paid}

