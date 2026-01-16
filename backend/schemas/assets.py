from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class AssetType(str, Enum):
    CASH = "CASH"
    ISA = "ISA"
    GIA = "GIA"
    PENSION = "PENSION"


class AssetCreate(BaseModel):
    person_id: str | None = None
    person_label: str | None = None
    name: str = Field(min_length=1, max_length=200)

    balance: float = Field(default=0.0, ge=0.0)
    annual_contribution: float = Field(default=0.0)
    growth_rate_mean: float = Field(default=0.0)
    growth_rate_std: float = Field(default=0.0, ge=0.0)
    contributions_end_at_retirement: bool = Field(default=False)

    asset_type: AssetType = Field(default=AssetType.GIA)
    withdrawal_priority: int = Field(default=100, ge=0, le=10_000)


class AssetRead(AssetCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str

