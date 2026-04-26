from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class IsaAccount:
    balance: float
    annual_contribution: float
    annual_return: float = 0.0

