from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from backend.schemas.assets import AssetCreate, AssetRead
from backend.schemas.expenses import ExpenseCreate, ExpenseRead
from backend.schemas.income import IncomeCreate, IncomeRead
from backend.schemas.person import PersonCreate, PersonRead
from backend.schemas.property import PropertyCreate, PropertyRead


class ScenarioCreate(BaseModel):
    """Create a new retirement planning scenario with people, incomes, assets, properties, and expenses."""
    name: str = Field(min_length=1, max_length=200, description="Scenario name (1-200 characters)")
    assumptions: dict[str, Any] = Field(default_factory=dict, description="Simulation assumptions (tax year, return model, etc.)")

    people: list[PersonCreate] = Field(default_factory=list, description="Adults and children in the scenario")
    incomes: list[IncomeCreate] = Field(default_factory=list, description="Salary, rental, and gift incomes")
    assets: list[AssetCreate] = Field(default_factory=list, description="ISA, GIA, CASH, and PENSION accounts")
    properties: list[PropertyCreate] = Field(default_factory=list, description="Rental properties with embedded mortgages")
    expenses: list[ExpenseCreate] = Field(default_factory=list, description="Living expenses (inflation-linked by default)")


class ScenarioRead(ScenarioCreate):
    """Scenario read model with DB-assigned id and scenario_id for child records."""
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(description="UUID v4 identifier for this scenario")

    people: list[PersonRead] = Field(default_factory=list, description="Adults and children in the scenario")
    incomes: list[IncomeRead] = Field(default_factory=list, description="Salary, rental, and gift incomes")
    assets: list[AssetRead] = Field(default_factory=list, description="ISA, GIA, CASH, and PENSION accounts")
    properties: list[PropertyRead] = Field(default_factory=list, description="Rental properties with embedded mortgages")
    expenses: list[ExpenseRead] = Field(default_factory=list, description="Living expenses (inflation-linked by default)")


class ScenarioCloneRequest(BaseModel):
    """Request body for cloning a scenario."""
    new_name: str | None = Field(default=None, min_length=1, max_length=200, description="Optional new name for the cloned scenario")


class ScenarioCloneResponse(BaseModel):
    """Response after cloning a scenario."""
    id: str = Field(description="UUID v4 identifier for the cloned scenario")
    name: str = Field(description="Name of the cloned scenario")
    message: str = Field(description="Status message (e.g., 'Scenario cloned successfully')")

