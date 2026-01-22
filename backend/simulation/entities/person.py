from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from backend.simulation.entities.base import SimContext


@dataclass
class PersonEntity:
    key: str
    birth_date: date
    planned_retirement_age: int | None = None
    state_pension_age: int | None = None

    # Child-specific fields
    is_child: bool = False
    annual_cost: float = 0.0
    leaves_household_age: int = 18

    def age_in_year(self, *, year: int) -> int:
        return year - self.birth_date.year

    def is_retired_in_year(self, *, year: int) -> bool:
        """Check if the person is retired in the given year. Children are never 'retired'."""
        if self.is_child or self.planned_retirement_age is None:
            return False
        return self.age_in_year(year=year) >= self.planned_retirement_age

    def is_state_pension_eligible_in_year(self, *, year: int) -> bool:
        """Check if the person is eligible for state pension. Children are never eligible."""
        if self.is_child or self.state_pension_age is None:
            return False
        return self.age_in_year(year=year) >= self.state_pension_age

    def can_access_pension_in_year(self, *, year: int, min_access_age: int = 55) -> bool:
        """Check if person can access their private pension (minimum age 55 in UK)."""
        if self.is_child:
            return False
        return self.age_in_year(year=year) >= min_access_age

    def is_dependent_in_year(self, *, year: int) -> bool:
        """Check if child is still a dependent (living at home) in the given year."""
        if not self.is_child:
            return False
        return self.age_in_year(year=year) < self.leaves_household_age

    def get_annual_cost_in_year(self, *, year: int) -> float:
        """Get the annual cost for this person in the given year (only applies to children)."""
        if not self.is_child:
            return 0.0
        if not self.is_dependent_in_year(year=year):
            return 0.0
        return self.annual_cost

    def step(self, *, context: SimContext) -> None:
        return None

    def get_balance_sheet(self) -> dict[str, float]:
        return {}

    def get_cash_flows(self) -> dict[str, float]:
        return {}

