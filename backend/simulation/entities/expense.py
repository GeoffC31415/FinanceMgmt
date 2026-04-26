from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ExpenseItem:
    name: str
    annual_amount: float
    is_inflation_linked: bool = True

