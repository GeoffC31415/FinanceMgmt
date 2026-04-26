from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StatePension:
    annual_amount: float
    is_active: bool = False

