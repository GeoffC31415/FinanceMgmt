from __future__ import annotations

from dataclasses import dataclass

from backend.simulation.entities.base import SimContext


@dataclass
class IsaAccount:
    balance: float
    annual_contribution: float
    annual_return: float = 0.0

    _investment_return: float = 0.0

    def step(self, *, context: SimContext) -> None:
        self.balance += self.annual_contribution
        self._investment_return = self.balance * self.annual_return
        self.balance += self._investment_return

    def get_balance_sheet(self) -> dict[str, float]:
        return {"isa_balance": self.balance}

    def get_cash_flows(self) -> dict[str, float]:
        return {
            "isa_contribution": self.annual_contribution,
            "isa_investment_return": self._investment_return,
        }

