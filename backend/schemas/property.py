from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class PropertyCreate(BaseModel):
    person_id: str | None = None
    person_label: str | None = None
    name: str = Field(min_length=1, max_length=200)

    value: float = Field(default=0.0, ge=0.0)
    appreciation_rate_mean: float = Field(default=0.0)
    appreciation_rate_std: float = Field(default=0.0, ge=0.0)
    monthly_rental_income: float = Field(default=0.0, ge=0.0)
    rental_growth_rate: float = Field(default=0.0, ge=-1.0, le=10.0)
    occupancy_rate: float = Field(default=1.0, ge=0.0, le=1.0)
    mortgage_ltv: float = Field(default=0.0, ge=0.0, le=1.0)
    mortgage_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    mortgage_term_years: int = Field(default=0, ge=0, le=100)
    annual_maintenance_cost: float = Field(default=0.0, ge=0.0)
    maintenance_is_inflation_linked: bool = Field(default=True)
    withdrawal_priority: int = Field(default=15, ge=0, le=10_000)


class PropertyRead(PropertyCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str
