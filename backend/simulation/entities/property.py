from __future__ import annotations

from dataclasses import dataclass


@dataclass
class PropertyEntity:
    name: str
    person_key: str | None
    withdrawal_priority: int

    value: float
    appreciation_rate_mean: float
    appreciation_rate_std: float
    monthly_rental_income: float
    rental_growth_rate: float
    occupancy_rate: float
    annual_maintenance_cost: float
    mortgage_ltv: float = 0.0
    mortgage_rate: float = 0.0
    mortgage_term_years: int = 0
    maintenance_is_inflation_linked: bool = True
    cost_basis: float = 0.0
