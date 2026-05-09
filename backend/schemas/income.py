from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class IncomeCreate(BaseModel):
    """Create a salary, rental, or gift income in a scenario."""
    person_id: str | None = Field(default=None, description="ID of the person this income is attributed to")
    person_label: str | None = Field(default=None, description="Label of the person this income is attributed to")
    kind: str = Field(default="salary", min_length=1, max_length=50, description="Income type: 'salary', 'rental', or 'gift'")

    gross_annual: float = Field(ge=0, description="Gross annual income amount")
    annual_growth_rate: float = Field(default=0.0, ge=-1.0, le=10.0, description="Annual growth rate (e.g., 0.03 for 3% inflation)")

    employee_pension_pct: float = Field(default=0.0, ge=0.0, le=1.0, description="Employee pension contribution percentage")
    employer_pension_pct: float = Field(default=0.0, ge=0.0, le=1.0, description="Employer pension contribution percentage")
    pension_contribution_method: str = Field(default="net_pay", description="Pension contribution method: 'net_pay', 'relief_at_source', or 'salary_sacrifice'")

    start_year: int | None = Field(default=None, ge=1900, le=2200, description="Year this income starts (None = from simulation start)")
    end_year: int | None = Field(default=None, ge=1900, le=2200, description="Year this income ends (None = indefinite)")


class IncomeRead(IncomeCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str

