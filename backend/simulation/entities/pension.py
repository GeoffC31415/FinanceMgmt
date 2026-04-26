from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PensionPot:
    balance: float
    growth_rate_mean: float = 0.05
    growth_rate_std: float = 0.10
    annual_return: float = 0.0
    bond_allocation: float = 0.0

