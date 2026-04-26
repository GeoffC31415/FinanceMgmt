from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class PropertyCreate(BaseModel):
    """Create a rental property with embedded mortgage in a scenario."""
    person_id: str | None = Field(default=None, description="ID of the property owner")
    person_label: str | None = Field(default=None, description="Label of the property owner")
    name: str = Field(min_length=1, max_length=200, description="Display name for this property")

    value: float = Field(default=0.0, ge=0.0, description="Current property value")
    appreciation_rate_mean: float = Field(default=0.0, description="Expected annual property value growth rate")
    appreciation_rate_std: float = Field(default=0.0, ge=0.0, description="Volatility of property value changes")
    monthly_rental_income: float = Field(default=0.0, ge=0.0, description="Gross monthly rental income")
    rental_growth_rate: float = Field(default=0.0, ge=-1.0, le=10.0, description="Annual rental income growth rate")
    occupancy_rate: float = Field(default=1.0, ge=0.0, le=1.0, description="Fraction of time the property is occupied")
    mortgage_ltv: float = Field(default=0.0, ge=0.0, le=1.0, description="Loan-to-value ratio of the mortgage")
    mortgage_rate: float = Field(default=0.0, ge=0.0, le=1.0, description="Annual mortgage interest rate")
    mortgage_term_years: int = Field(default=0, ge=0, le=100, description="Remaining mortgage term in years")
    annual_maintenance_cost: float = Field(default=0.0, ge=0.0, description="Annual property maintenance cost")
    maintenance_is_inflation_linked: bool = Field(default=True, description="Whether maintenance costs inflate annually")
    withdrawal_priority: int = Field(default=15, ge=0, le=10_000, description="Higher priority = withdrawn first in retirement")


class PropertyRead(PropertyCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str
