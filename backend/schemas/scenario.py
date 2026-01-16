from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from backend.schemas.assets import AssetCreate, AssetRead
from backend.schemas.expenses import ExpenseCreate, ExpenseRead
from backend.schemas.income import IncomeCreate, IncomeRead
from backend.schemas.mortgage import MortgageCreate, MortgageRead
from backend.schemas.person import PersonCreate, PersonRead


class ScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    assumptions: dict[str, Any] = Field(default_factory=dict)

    people: list[PersonCreate] = Field(default_factory=list)
    incomes: list[IncomeCreate] = Field(default_factory=list)
    assets: list[AssetCreate] = Field(default_factory=list)
    mortgage: MortgageCreate | None = None
    expenses: list[ExpenseCreate] = Field(default_factory=list)


class ScenarioRead(ScenarioCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str

    people: list[PersonRead] = Field(default_factory=list)
    incomes: list[IncomeRead] = Field(default_factory=list)
    assets: list[AssetRead] = Field(default_factory=list)
    mortgage: MortgageRead | None = None
    expenses: list[ExpenseRead] = Field(default_factory=list)

