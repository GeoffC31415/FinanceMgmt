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
    
    # Inflation adjustment parameters (for frontend real-value toggle)
    inflation_rate: float
    start_year: int
    
    # Detailed fields for export
    # Incomes
    salary_gross_median: list[float]
    salary_net_median: list[float]
    rental_income_median: list[float]
    gift_income_median: list[float]
    pension_income_median: list[float]
    state_pension_income_median: list[float]
    investment_returns_median: list[float]
    total_income_median: list[float]
    
    # Expenses
    total_expenses_median: list[float]
    mortgage_payment_median: list[float]
    pension_contributions_median: list[float]
    
    # Tax
    income_tax_paid_median: list[float]
    ni_paid_median: list[float]
    total_tax_median: list[float]
    
    # Assets
    isa_balance_median: list[float]
    pension_balance_median: list[float]
    cash_balance_median: list[float]
    total_assets_median: list[float]
    
    # Liabilities
    mortgage_balance_median: list[float]
    total_liabilities_median: list[float]
    
    # Other
    mortgage_paid_off_median: list[float]  # percentage of runs where mortgage is paid off
    is_depleted_median: list[float]  # percentage of runs where assets are depleted


class SimulationInitRequest(BaseModel):
    scenario_id: str
    iterations: int = Field(default=1000, ge=10, le=20000)
    seed: int = Field(default=0, ge=0)

    # Optional scenario-level knobs for initialization.
    annual_spend_target: float | None = Field(default=None, ge=0.0)
    end_year: int | None = Field(default=None, ge=1900, le=2200)

    # Engine selection (True = Numba fast engine, False = Python reference engine)
    use_fast_engine: bool = Field(default=True)


class SimulationInitResponse(SimulationResponse):
    session_id: str


class SimulationRecalcRequest(BaseModel):
    session_id: str
    annual_spend_target: float | None = Field(default=None, ge=0.0)
    retirement_age_offset: int | None = Field(default=0, ge=-30, le=30)
    percentile: int | None = Field(default=50, ge=1, le=99)

    # Engine selection (True = Numba fast engine, False = Python reference engine)
    use_fast_engine: bool = Field(default=True)