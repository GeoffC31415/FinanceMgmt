from __future__ import annotations

from dataclasses import dataclass

from backend.simulation.entities.base import SimContext


@dataclass
class PensionPot:
    balance: float
    growth_rate_mean: float = 0.05
    growth_rate_std: float = 0.10
    annual_return: float = 0.0

    _investment_return: float = 0.0
    _contributions: float = 0.0
    _withdrawals: float = 0.0

    def begin_year(self) -> None:
        self._investment_return = 0.0
        self._contributions = 0.0
        self._withdrawals = 0.0

    def contribute(self, *, amount: float) -> None:
        if amount <= 0:
            return
        self._contributions += amount
        self.balance += amount

    def withdraw(self, *, amount: float) -> float:
        if amount <= 0:
            return 0.0
        withdrawn = min(self.balance, amount)
        self._withdrawals += withdrawn
        self.balance -= withdrawn
        return withdrawn

    def step(self, *, context: SimContext) -> None:
        # per-year tracking
        self.begin_year()
        self._investment_return = self.balance * self.annual_return
        self.balance += self._investment_return

    def get_balance_sheet(self) -> dict[str, float]:
        return {"pension_balance": self.balance}

    def get_cash_flows(self) -> dict[str, float]:
        return {
            "pension_contributions": self._contributions,
            "pension_withdrawals": self._withdrawals,
            "pension_investment_return": self._investment_return,
        }

