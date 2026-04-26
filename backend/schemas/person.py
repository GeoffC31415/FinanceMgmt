from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PersonCreate(BaseModel):
    """Create a person (adult or child) in a retirement planning scenario."""
    id: str | None = Field(default=None, description="Optional UUID for preserving identity across updates")
    label: str = Field(min_length=1, max_length=100, description="Unique label for this person (e.g., 'person1')")
    birth_date: date = Field(description="Date of birth")

    # Adult-specific fields (required for adults, optional for children)
    planned_retirement_age: int | None = Field(default=None, ge=0, le=120, description="Age at which this person plans to retire")
    state_pension_age: int | None = Field(default=67, ge=0, le=120, description="Age at which this person becomes eligible for state pension")

    # Child-specific fields
    is_child: bool = Field(default=False, description="Whether this is a dependent child")
    annual_cost: float | None = Field(default=None, ge=0, description="Annual cost of raising this child")
    leaves_household_age: int | None = Field(default=18, ge=0, le=50, description="Age at which this child leaves the household")

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

    @model_validator(mode="after")
    def validate_person_type(self) -> "PersonRead":
        """Lenient validation for reads -- tolerate missing fields in existing data."""
        if self.is_child:
            if self.annual_cost is None:
                self.annual_cost = 0.0
        else:
            # Don't raise for existing data; default retirement age if missing
            if self.planned_retirement_age is None:
                self.planned_retirement_age = 65
        return self

