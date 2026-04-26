from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ExpenseCreate(BaseModel):
    """Create a living expense in a scenario."""
    name: str = Field(min_length=1, max_length=200, description="Display name for this expense (e.g., 'Rent', 'Insurance')")
    monthly_amount: float = Field(ge=0.0, description="Monthly expense amount")

    start_year: int | None = Field(default=None, ge=1900, le=2200, description="Year this expense starts (None = from simulation start)")
    end_year: int | None = Field(default=None, ge=1900, le=2200, description="Year this expense ends (None = indefinite)")
    is_inflation_linked: bool = Field(default=True, description="Whether this expense increases with inflation annually")


class ExpenseRead(ExpenseCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str

