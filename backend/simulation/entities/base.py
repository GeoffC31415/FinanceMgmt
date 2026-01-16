from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np
from numpy.random import Generator


@dataclass(frozen=True)
class SimContext:
    year: int
    inflation_rate: float
    rng: Generator


class FinancialEntity(Protocol):
    def step(self, *, context: SimContext) -> None: ...

    def get_balance_sheet(self) -> dict[str, float]: ...

    def get_cash_flows(self) -> dict[str, float]: ...

