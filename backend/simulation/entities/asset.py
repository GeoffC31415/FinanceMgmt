from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
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

    # Fraction of this asset allocated to bonds (0.0 = 100% equity, 1.0 = 100% bonds).
    bond_allocation: float = 0.0

    # For simplified GIA CGT modelling: treat this as remaining cost basis.
    cost_basis: float = 0.0
