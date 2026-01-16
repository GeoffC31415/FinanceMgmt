from __future__ import annotations

from pydantic import BaseModel, Field


class SimulationRequest(BaseModel):
    scenario_id: str
    iterations: int = Field(default=1000, ge=10, le=20000)
    seed: int = Field(default=0, ge=0)

    # Scenario-level knobs for quick experiments (RORO style).
    annual_spend_target: float | None = Field(default=None, ge=0.0)
    end_year: int | None = Field(default=None, ge=1900, le=2200)


class YearlySeriesPoint(BaseModel):
    year: int
    net_worth: float


class SimulationResponse(BaseModel):
    years: list[int]
    net_worth_p10: list[float]
    net_worth_median: list[float]
    net_worth_p90: list[float]
    income_median: list[float]
    spend_median: list[float]
    retirement_years: list[int]

