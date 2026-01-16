from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class IncomeCreate(BaseModel):
    person_id: str | None = None
    person_label: str | None = None
    kind: str = Field(default="salary", min_length=1, max_length=50)

    gross_annual: float = Field(ge=0)
    annual_growth_rate: float = Field(default=0.0, ge=-1.0, le=10.0)

    employee_pension_pct: float = Field(default=0.0, ge=0.0, le=1.0)
    employer_pension_pct: float = Field(default=0.0, ge=0.0, le=1.0)

    start_year: int | None = Field(default=None, ge=1900, le=2200)
    end_year: int | None = Field(default=None, ge=1900, le=2200)


class IncomeRead(IncomeCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str

