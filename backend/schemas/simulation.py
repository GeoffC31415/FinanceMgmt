from __future__ import annotations

from pydantic import BaseModel, Field


class SimulationRequest(BaseModel):
    scenario_id: str
    iterations: int = Field(default=2000, ge=10, le=20000)
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
    fun_fund_median: list[float]
    
    # Tax
    income_tax_paid_median: list[float]
    ni_paid_median: list[float]
    total_tax_median: list[float]
    
    # Assets
    isa_balance_median: list[float]
    pension_balance_median: list[float]
    cash_balance_median: list[float]
    gia_balance_median: list[float]
    total_assets_median: list[float]

    # Per-type investment returns
    isa_returns_median: list[float]
    gia_returns_median: list[float]
    cash_returns_median: list[float]
    pension_returns_median: list[float]

    # Per-type contributions
    isa_contributions_median: list[float]
    gia_contributions_median: list[float]

    # Per-type withdrawals
    isa_withdrawals_median: list[float]
    gia_withdrawals_median: list[float]
    pension_withdrawals_median: list[float]
    
    # Liabilities
    mortgage_balance_median: list[float]
    total_liabilities_median: list[float]
    
    # Other
    mortgage_paid_off_median: list[float]  # percentage of runs where mortgage is paid off
    is_depleted_median: list[float]  # percentage of runs where assets are depleted
    is_bankrupt_median: list[float]  # percentage of runs where net worth is below bankruptcy threshold
    debt_balance_median: list[float]  # median debt balance
    debt_interest_paid_median: list[float]  # median debt interest paid


class SimulationInitRequest(BaseModel):
    scenario_id: str
    iterations: int = Field(default=2000, ge=10, le=20000)
    seed: int = Field(default=0, ge=0)

    # Optional scenario-level knobs for initialization.
    annual_spend_target: float | None = Field(default=None, ge=0.0)
    end_year: int | None = Field(default=None, ge=1900, le=2200)



class SimulationInitResponse(SimulationResponse):
    session_id: str


class SimulationRecalcRequest(BaseModel):
    session_id: str
    annual_spend_target: float | None = Field(default=None, ge=0.0)
    retirement_age_offset: int | None = Field(default=0, ge=-30, le=30)
    percentile: int | None = Field(default=50, ge=1, le=99)


class SafeWithdrawalRequest(BaseModel):
    session_id: str
    retirement_age_offset: int = Field(default=0, ge=-30, le=30)
    risk_threshold: float = Field(default=5.0, ge=0.0, le=100.0)  # max acceptable bankruptcy %
    max_spend: float = Field(default=200_000.0, ge=0.0)
    steps: int = Field(default=25, ge=5, le=50)


class SensitivityPoint(BaseModel):
    fun_fund: float
    bankruptcy_pct: float
    depletion_pct: float
    p10_final_net_worth: float


class SafeWithdrawalResponse(BaseModel):
    max_safe_fun_fund: float
    risk_threshold: float
    sensitivity_curve: list[SensitivityPoint]


class BondSweepRequest(BaseModel):
    session_id: str
    retirement_age_offset: int = Field(default=0, ge=-30, le=30)
    annual_spend_target: float | None = Field(default=None, ge=0.0)
    risk_threshold: float = Field(default=5.0, ge=0.0, le=100.0)


class BondCombo(BaseModel):
    """A single tested combination of bond allocations across asset classes."""
    isa_bond_pct: float
    gia_bond_pct: float
    pension_bond_pct: float
    bankruptcy_pct: float
    depletion_pct: float
    median_final_net_worth: float
    p10_final_net_worth: float


class MarginalPoint(BaseModel):
    """Aggregated outcome at a single bond % for one asset class (averaged over all other combos)."""
    bond_pct: float
    avg_bankruptcy_pct: float
    avg_median_net_worth: float
    min_bankruptcy_pct: float
    max_median_net_worth: float


class MarginalCurve(BaseModel):
    asset_class: str
    points: list[MarginalPoint]


class BondSweepResponse(BaseModel):
    asset_classes: list[str]
    optimal: BondCombo
    top_combos: list[BondCombo]
    marginals: list[MarginalCurve]
    total_combos_tested: int