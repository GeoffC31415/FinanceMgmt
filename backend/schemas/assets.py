from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class AssetCreate(BaseModel):
    person_id: str | None = None
    person_label: str | None = None
    name: str = Field(min_length=1, max_length=200)

    balance: float = Field(default=0.0, ge=0.0)
    annual_contribution: float = Field(default=0.0)
    growth_rate_mean: float = Field(default=0.0)
    growth_rate_std: float = Field(default=0.0, ge=0.0)
    contributions_end_at_retirement: bool = Field(default=False)


class AssetRead(AssetCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str

