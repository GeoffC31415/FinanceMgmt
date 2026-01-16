from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class MortgageCreate(BaseModel):
    balance: float = Field(default=0.0, ge=0.0)
    annual_interest_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    monthly_payment: float = Field(default=0.0, ge=0.0)


class MortgageRead(MortgageCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str

