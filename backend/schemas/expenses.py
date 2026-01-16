from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ExpenseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    monthly_amount: float = Field(ge=0.0)

    start_year: int | None = Field(default=None, ge=1900, le=2200)
    end_year: int | None = Field(default=None, ge=1900, le=2200)
    is_inflation_linked: bool = True


class ExpenseRead(ExpenseCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str

