from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class AssetCreate(BaseModel):
    person_id: str | None = None
    person_label: str | None = None
    kind: str = Field(min_length=1, max_length=50)  # "isa" | "pension" | "cash"

    balance: float = Field(default=0.0)
    annual_contribution: float = Field(default=0.0)


class AssetRead(AssetCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str

