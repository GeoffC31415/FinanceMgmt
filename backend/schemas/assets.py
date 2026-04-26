from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class AssetType(str, Enum):
    CASH = "CASH"
    ISA = "ISA"
    GIA = "GIA"
    PENSION = "PENSION"


class AssetCreate(BaseModel):
    """Create an investment account (ISA, GIA, CASH, or PENSION) in a scenario."""
    person_id: str | None = Field(default=None, description="ID of the person who owns this asset")
    person_label: str | None = Field(default=None, description="Label of the person who owns this asset")
    name: str = Field(min_length=1, max_length=200, description="Display name for this account")

    balance: float = Field(default=0.0, ge=0.0, description="Current account balance")
    annual_contribution: float = Field(default=0.0, description="Annual contribution to this account")
    growth_rate_mean: float = Field(default=0.0, description="Expected annual return rate (e.g., 0.07 for 7%)")
    growth_rate_std: float = Field(default=0.0, ge=0.0, description="Volatility of annual returns (standard deviation)")
    contributions_end_at_retirement: bool = Field(default=False, description="Whether contributions stop at retirement")

    asset_type: AssetType = Field(default=AssetType.GIA, description="Account type: ISA, GIA, CASH, or PENSION")
    withdrawal_priority: int = Field(default=100, ge=0, le=10_000, description="Higher priority = withdrawn first in retirement")
    bond_allocation: float = Field(default=0.0, ge=0.0, le=1.0, description="Fraction allocated to bonds (0.0 = 100% equity)")


class AssetRead(AssetCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str

