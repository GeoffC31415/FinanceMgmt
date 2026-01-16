from __future__ import annotations

from dataclasses import dataclass

from backend.simulation.entities.base import SimContext


@dataclass
class AssetAccount:
    name: str
    balance: float
    annual_contribution: float
    growth_rate_mean: float
    growth_rate_std: float
    contributions_end_at_retirement: bool

    _investment_return: float = 0.0
    _contribution_made: float = 0.0

    def step(self, *, context: SimContext, should_contribute: bool = True) -> None:
        # Make contribution if applicable
        if should_contribute:
            self._contribution_made = self.annual_contribution
            self.balance += self._contribution_made
        else:
            self._contribution_made = 0.0

        # Apply growth (using mean + random sample from std)
        annual_return = float(
            context.rng.normal(loc=self.growth_rate_mean, scale=self.growth_rate_std)
        )
        self._investment_return = self.balance * annual_return
        self.balance += self._investment_return

    def get_balance_sheet(self) -> dict[str, float]:
        return {f"{self.name}_balance": self.balance}

    def get_cash_flows(self) -> dict[str, float]:
        return {
            f"{self.name}_contribution": self._contribution_made,
            f"{self.name}_investment_return": self._investment_return,
        }
