from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Cash:
    balance: float
    annual_interest_rate: float = 0.0

