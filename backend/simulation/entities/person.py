from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class PersonEntity:
    key: str
    birth_date: date
    planned_retirement_age: int | None = None
    state_pension_age: int | None = None

    # Child-specific fields
    is_child: bool = False
    annual_cost: float = 0.0
    leaves_household_age: int = 18

