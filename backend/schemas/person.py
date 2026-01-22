from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PersonCreate(BaseModel):
    id: str | None = None
    label: str = Field(min_length=1, max_length=100)
    birth_date: date

    # Adult-specific fields (required for adults, optional for children)
    planned_retirement_age: int | None = Field(default=None, ge=0, le=120)
    state_pension_age: int | None = Field(default=67, ge=0, le=120)

    # Child-specific fields
    is_child: bool = False
    annual_cost: float | None = Field(default=None, ge=0)  # Annual cost of raising the child
    leaves_household_age: int | None = Field(default=18, ge=0, le=50)  # Age when child leaves household

    @model_validator(mode="after")
    def validate_person_type(self) -> "PersonCreate":
        if self.is_child:
            # Children must have annual_cost and leaves_household_age
            if self.annual_cost is None:
                self.annual_cost = 0.0
            # Retirement fields are not relevant for children
        else:
            # Adults must have retirement ages
            if self.planned_retirement_age is None:
                raise ValueError("Adults must have a planned retirement age")
        return self


class PersonRead(PersonCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str

