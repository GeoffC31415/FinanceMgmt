from __future__ import annotations

from dataclasses import dataclass

from backend.simulation.entities.base import SimContext


@dataclass
class AssetAccount:
    # Asset metadata
    name: str
    asset_type: str  # CASH | ISA | GIA
    withdrawal_priority: int

    # Current state
    balance: float
    annual_contribution: float
    growth_rate_mean: float
    growth_rate_std: float
    contributions_end_at_retirement: bool

    # For simplified GIA CGT modelling: treat this as remaining cost basis.
    cost_basis: float = 0.0

    _investment_return: float = 0.0
    _contribution_made: float = 0.0
    _withdrawals: float = 0.0
    _deposits: float = 0.0

    def deposit(self, *, amount: float) -> float:
        if amount <= 0:
            return 0.0
        deposited = float(amount)
        self._deposits += deposited
        self._contribution_made += deposited
        self.balance += deposited

        # Track cost basis for CGT modelling. For ISA/CASH it doesn't matter,
        # but keeping it consistent is useful.
        self.cost_basis += deposited
        return deposited

    def withdraw(self, *, amount: float) -> float:
        if amount <= 0 or self.balance <= 0:
            return 0.0

        starting_balance = self.balance
        withdrawn = min(starting_balance, float(amount))
        self.balance = starting_balance - withdrawn
        self._withdrawals += withdrawn

        # Reduce cost basis proportionally (simplified disposal model).
        if starting_balance > 0 and self.cost_basis > 0:
            basis_reduction = self.cost_basis * (withdrawn / starting_balance)
            self.cost_basis = max(0.0, self.cost_basis - basis_reduction)

        return withdrawn

    def begin_year(self) -> None:
        self._investment_return = 0.0
        self._contribution_made = 0.0
        self._withdrawals = 0.0
        self._deposits = 0.0

    def apply_growth(self, *, context: SimContext) -> None:
        # Apply growth (using mean + random sample from std)
        annual_return = float(
            context.rng.normal(loc=self.growth_rate_mean, scale=self.growth_rate_std)
        )
        self._investment_return = self.balance * annual_return
        self.balance += self._investment_return

    def step(self, *, context: SimContext, should_contribute: bool = True) -> None:
        """
        Backward-compatible stepping:
        - Resets per-year cashflow counters
        - If should_contribute, deposit `annual_contribution` (but note: this is *not* funded by cash)
        - Applies stochastic growth

        New cashflow engine should use: begin_year() -> deposit()/withdraw() -> apply_growth()
        """
        self.begin_year()

        if should_contribute and self.annual_contribution > 0:
            self.deposit(amount=self.annual_contribution)
        self.apply_growth(context=context)

    def get_balance_sheet(self) -> dict[str, float]:
        return {f"{self.name}_balance": self.balance}

    def get_cash_flows(self) -> dict[str, float]:
        return {
            f"{self.name}_contribution": self._contribution_made,
            f"{self.name}_deposits": self._deposits,
            f"{self.name}_withdrawals": self._withdrawals,
            f"{self.name}_investment_return": self._investment_return,
        }
