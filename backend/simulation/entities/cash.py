from __future__ import annotations

from dataclasses import dataclass

from backend.simulation.entities.base import SimContext


@dataclass
class Cash:
    balance: float
    annual_interest_rate: float = 0.0

    _interest_gained: float = 0.0

    def step(self, *, context: SimContext) -> None:
        self._interest_gained = self.balance * self.annual_interest_rate
        self.balance += self._interest_gained

    def get_balance_sheet(self) -> dict[str, float]:
        return {"cash_balance": self.balance}

    def get_cash_flows(self) -> dict[str, float]:
        return {"cash_interest": self._interest_gained}

