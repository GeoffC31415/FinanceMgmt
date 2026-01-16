from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class PersonCreate(BaseModel):
    id: str | None = None
    label: str = Field(min_length=1, max_length=100)
    birth_date: date
    planned_retirement_age: int = Field(ge=0, le=120)
    state_pension_age: int = Field(default=67, ge=0, le=120)


class PersonRead(PersonCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str

