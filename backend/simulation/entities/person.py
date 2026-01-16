from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from backend.simulation.entities.base import SimContext


@dataclass
class PersonEntity:
    key: str
    birth_date: date
    planned_retirement_age: int
    state_pension_age: int

    def age_in_year(self, *, year: int) -> int:
        return year - self.birth_date.year

    def is_retired_in_year(self, *, year: int) -> bool:
        return self.age_in_year(year=year) >= self.planned_retirement_age

    def is_state_pension_eligible_in_year(self, *, year: int) -> bool:
        return self.age_in_year(year=year) >= self.state_pension_age

    def can_access_pension_in_year(self, *, year: int, min_access_age: int = 55) -> bool:
        """Check if person can access their private pension (minimum age 55 in UK)."""
        return self.age_in_year(year=year) >= min_access_age

    def step(self, *, context: SimContext) -> None:
        return None

    def get_balance_sheet(self) -> dict[str, float]:
        return {}

    def get_cash_flows(self) -> dict[str, float]:
        return {}

