from __future__ import annotations

from pydantic import BaseModel, Field


class SimulationRequest(BaseModel):
    """Run a Monte Carlo retirement simulation on an existing scenario."""
    scenario_id: str = Field(description="UUID of the scenario to simulate")
    iterations: int = Field(default=2000, ge=10, le=20000, description="Number of Monte Carlo iterations (10-20000)")
    seed: int = Field(default=0, ge=0, description="Random seed for reproducibility (0 = random)")

    # Scenario-level knobs for quick experiments (RORO style).
    annual_spend_target: float | None = Field(default=None, ge=0.0, description="Target annual retirement spend override")
    end_year: int | None = Field(default=None, ge=1900, le=2200, description="Simulation end year override")


class YearlySeriesPoint(BaseModel):
    """A single year's data point in a time series."""
    year: int = Field(description="Simulation year")
    net_worth: float = Field(description="Net worth at year end")


class SimulationResponse(BaseModel):
    """Monte Carlo simulation results with percentile bands and median values for all engine output fields."""
    years: list[int] = Field(description="Simulation years (e.g., [2024, 2025, ..., 2064])")
    net_worth_p10: list[float] = Field(description="10th percentile net worth per year")
    net_worth_median: list[float] = Field(description="Median net worth per year")
    net_worth_p90: list[float] = Field(description="90th percentile net worth per year")
    income_median: list[float] = Field(description="Median total annual income")
    spend_median: list[float] = Field(description="Median total annual spend (expenses + fun_fund)")
    retirement_years: list[int] = Field(description="Years where at least one person is retired")
    
    # Inflation adjustment parameters (for frontend real-value toggle)
    inflation_rate: float = Field(description="Annual inflation rate used in simulation")
    start_year: int = Field(description="First simulation year")
    
    # Detailed fields for export
    # Incomes
    salary_gross_median: list[float] = Field(description="Median gross salary per year")
    salary_net_median: list[float] = Field(description="Median net salary (after tax + NI + pension) per year")
    rental_income_median: list[float] = Field(description="Median gross rental income per year")
    gift_income_median: list[float] = Field(description="Median gift income per year (tax-free)")
    pension_income_median: list[float] = Field(description="Median net pension drawdown per year")
    state_pension_income_median: list[float] = Field(description="Median state pension income per year")
    investment_returns_median: list[float] = Field(description="Median investment returns per year")
    total_income_median: list[float] = Field(description="Median total annual income per year")
    
    # Expenses
    total_expenses_median: list[float] = Field(description="Median total expenses per year")
    mortgage_payment_median: list[float] = Field(description="Median mortgage payment per year")
    pension_contributions_median: list[float] = Field(description="Median pension contributions per year")
    fun_fund_median: list[float] = Field(description="Median extra retirement spend (fun fund) per year")
    
    # Tax
    income_tax_paid_median: list[float] = Field(description="Median income tax paid per year, excluding CGT")
    state_pension_tax_paid_median: list[float] = Field(description="Median income tax attributable to taxable state pension per year")
    ni_paid_median: list[float] = Field(description="Median National Insurance paid per year")
    total_tax_median: list[float] = Field(description="Median total tax paid per year")
    # P1.1: Structured tax breakdown
    salary_income_tax_paid_median: list[float] = Field(description="Median income tax attributable to salary per year")
    rental_income_tax_paid_median: list[float] = Field(description="Median income tax attributable to rental income per year")
    pension_drawdown_tax_paid_median: list[float] = Field(description="Median income tax attributable to private pension drawdown per year")
    capital_gains_tax_paid_median: list[float] = Field(description="Median capital gains tax paid per year")
    gia_cgt_paid_median: list[float] = Field(description="Median CGT paid on GIA disposals per year")
    property_cgt_paid_median: list[float] = Field(description="Median CGT paid on property disposals per year")
    salary_income_tax_personal_allowance_used_median: list[float] = Field(description="Median salary tax-free personal allowance used per year")
    salary_income_tax_personal_allowance_lost_median: list[float] = Field(description="Median personal allowance lost to salary income taper per year")
    salary_income_tax_basic_band_amount_median: list[float] = Field(description="Median salary income amount taxed in the basic-rate band per year")
    salary_income_tax_basic_band_tax_median: list[float] = Field(description="Median salary income tax paid at the basic rate per year")
    salary_income_tax_higher_band_amount_median: list[float] = Field(description="Median salary income amount taxed in the higher-rate band per year")
    salary_income_tax_higher_band_tax_median: list[float] = Field(description="Median salary income tax paid at the higher rate per year")
    salary_income_tax_additional_band_amount_median: list[float] = Field(description="Median salary income amount taxed in the additional-rate band per year")
    salary_income_tax_additional_band_tax_median: list[float] = Field(description="Median salary income tax paid at the additional rate per year")
    salary_income_tax_allowance_taper_tax_median: list[float] = Field(description="Median extra salary income tax caused by personal allowance taper per year")

    # P1.5/P1.6: Pension rules
    pension_annual_allowance_charge_median: list[float] = Field(description="Median annual allowance charge per year (when contributions exceed allowance)")
    pension_tax_free_cash_remaining_median: list[float] = Field(description="Median remaining tax-free cash allowance per year")
    pension_tax_free_cash_taken_median: list[float] = Field(description="Median total tax-free cash taken per year")
    pension_mpaa_active_median: list[float] = Field(description="Median MPAA flag (1=active) per year")
    pension_annual_allowance_median: list[float] = Field(description="Median effective annual allowance per year")
    pension_tapered_allowance_median: list[float] = Field(description="Median tapered annual allowance per year")
    pension_is_tapered_median: list[float] = Field(description="Median flag indicating if tapered allowance applies per year")

    # Assets
    isa_balance_median: list[float] = Field(description="Median ISA balance per year")
    pension_balance_median: list[float] = Field(description="Median pension balance per year")
    cash_balance_median: list[float] = Field(description="Median cash balance per year")
    gia_balance_median: list[float] = Field(description="Median GIA balance per year")
    property_value_median: list[float] = Field(description="Median property value per year")
    total_assets_median: list[float] = Field(description="Median total assets per year")

    # Per-type investment returns
    isa_returns_median: list[float] = Field(description="Median ISA investment returns per year")
    gia_returns_median: list[float] = Field(description="Median GIA investment returns per year")
    cash_returns_median: list[float] = Field(description="Median cash returns per year")
    pension_returns_median: list[float] = Field(description="Median pension investment returns per year")
    property_returns_median: list[float] = Field(description="Median property returns per year")

    # Per-type contributions
    isa_contributions_median: list[float] = Field(description="Median ISA contributions per year")
    gia_contributions_median: list[float] = Field(description="Median GIA contributions per year")

    # Per-type withdrawals
    isa_withdrawals_median: list[float] = Field(description="Median ISA withdrawals per year")
    gia_withdrawals_median: list[float] = Field(description="Median GIA withdrawals per year")
    pension_withdrawals_median: list[float] = Field(description="Median pension withdrawals per year")
    property_rental_income_median: list[float] = Field(description="Median property rental income per year")
    property_maintenance_median: list[float] = Field(description="Median property maintenance costs per year")

    # Asset class funding for outgoings (net cash contribution from each source per year)
    asset_funding_cash_median: list[float] = Field(description="Median cash used to fund outgoings per year")
    asset_funding_isa_median: list[float] = Field(description="Median ISA withdrawals used to fund outgoings per year")
    asset_funding_gia_median: list[float] = Field(description="Median GIA net withdrawals (after CGT) used to fund outgoings per year")
    asset_funding_pension_median: list[float] = Field(description="Median net pension drawdown used to fund outgoings per year")
    asset_funding_property_median: list[float] = Field(description="Median net property cash (after mortgage) used to fund outgoings per year")

    # Liabilities
    mortgage_balance_median: list[float] = Field(description="Median mortgage balance per year")
    total_liabilities_median: list[float] = Field(description="Median total liabilities per year")
    
    # Other
    mortgage_paid_off_median: list[float] = Field(description="Percentage of runs where mortgage is paid off")
    is_depleted_median: list[float] = Field(description="Percentage of runs where assets are depleted")
    is_bankrupt_median: list[float] = Field(description="Percentage of runs where net worth is below bankruptcy threshold")
    debt_balance_median: list[float] = Field(description="Median debt balance per year")
    debt_interest_paid_median: list[float] = Field(description="Median debt interest paid per year")


class SimulationInitRequest(BaseModel):
    """Initialize a simulation session and run the first simulation."""
    scenario_id: str = Field(description="UUID of the scenario to simulate")
    iterations: int = Field(default=2000, ge=10, le=20000, description="Number of Monte Carlo iterations (10-20000)")
    seed: int = Field(default=0, ge=0, description="Random seed for reproducibility (0 = random)")

    # Optional scenario-level knobs for initialization.
    annual_spend_target: float | None = Field(default=None, ge=0.0, description="Target annual retirement spend override")
    end_year: int | None = Field(default=None, ge=1900, le=2200, description="Simulation end year override")



class SimulationInitResponse(SimulationResponse):
    """Simulation response with session_id for subsequent recalculation."""
    session_id: str = Field(description="Session ID (30-min TTL) for subsequent /recalc requests")


class SimulationRecalcRequest(BaseModel):
    """Recalculate a simulation with updated spend or retirement age (reuses cached returns)."""
    session_id: str = Field(description="Session ID from a previous /init response")
    annual_spend_target: float | None = Field(default=None, ge=0.0, description="New target annual retirement spend")
    retirement_age_offset: int | None = Field(default=0, ge=-30, le=30, description="Offset to apply to all planned retirement ages (-30 to +30)")
    percentile: int | None = Field(default=50, ge=1, le=99, description="Percentile to use for representative iteration (1-99)")


class SafeWithdrawalRequest(BaseModel):
    """Find the maximum safe 'fun fund' (extra retirement spend) for a scenario."""
    session_id: str = Field(description="Session ID from a previous /init response")
    retirement_age_offset: int = Field(default=0, ge=-30, le=30, description="Offset to apply to all planned retirement ages")
    risk_threshold: float = Field(default=5.0, ge=0.0, le=100.0, description="Maximum acceptable bankruptcy percentage")
    max_spend: float = Field(default=200_000.0, ge=0.0, description="Upper bound for spend search")
    steps: int = Field(default=25, ge=5, le=50, description="Number of spend steps to test")


class SensitivityPoint(BaseModel):
    """A single point on the safe withdrawal sensitivity curve."""
    fun_fund: float = Field(description="Tested fun fund amount")
    bankruptcy_pct: float = Field(description="Percentage of runs where assets are depleted")
    depletion_pct: float = Field(description="Percentage of runs where net worth goes bankrupt")
    p10_final_net_worth: float = Field(description="10th percentile final net worth")


class SafeWithdrawalResponse(BaseModel):
    """Result of safe withdrawal rate analysis."""
    max_safe_fun_fund: float = Field(description="Maximum safe extra retirement spend")
    risk_threshold: float = Field(description="Risk threshold used for analysis")
    sensitivity_curve: list[SensitivityPoint] = Field(description="Spend vs bankruptcy percentage curve")


class BondSweepRequest(BaseModel):
    """Run a bond allocation optimization sweep across asset classes."""
    session_id: str = Field(description="Session ID from a previous /init response")
    retirement_age_offset: int = Field(default=0, ge=-30, le=30, description="Offset to apply to all planned retirement ages")
    risk_threshold: float = Field(default=5.0, ge=0.0, le=100.0, description="Maximum acceptable bankruptcy percentage")
    target_year: int | None = Field(default=None, ge=1900, le=2200, description="Specific year to evaluate at (None = last year)")
    max_spend: float = Field(default=200_000.0, ge=0.0, description="Upper bound for spend search")
    max_combos: int | None = Field(default=None, ge=1, le=10000, description="Maximum number of combos to test (None = unlimited, useful for testing)")


class BondCombo(BaseModel):
    """A single tested combination of bond allocations across asset classes."""
    isa_bond_pct: float = Field(description="ISA bond allocation percentage")
    gia_bond_pct: float = Field(description="GIA bond allocation percentage")
    pension_bond_pct: float = Field(description="Pension bond allocation percentage")
    bankruptcy_pct: float = Field(description="Bankruptcy percentage at this combo")
    depletion_pct: float = Field(description="Depletion percentage at this combo")
    max_safe_fun_fund: float = Field(description="Maximum safe fun fund at this combo")


class MarginalPoint(BaseModel):
    """Aggregated outcome at a single bond % for one asset class (averaged over all other combos)."""
    bond_pct: float = Field(description="Bond allocation percentage")
    avg_bankruptcy_pct: float = Field(description="Average bankruptcy percentage across combos")
    avg_max_fun_fund: float = Field(description="Average max safe fun fund across combos")
    min_bankruptcy_pct: float = Field(description="Minimum bankruptcy percentage across combos")
    best_max_fun_fund: float = Field(description="Best (highest) max fun fund across combos")


class MarginalCurve(BaseModel):
    """Marginal analysis for a single asset class."""
    asset_class: str = Field(description="Asset class name (e.g., 'ISA', 'GIA', 'PENSION')")
    points: list[MarginalPoint] = Field(description="Bond allocation sweep points for this asset class")


class BondSweepResponse(BaseModel):
    """Result of bond allocation optimization sweep."""
    asset_classes: list[str] = Field(description="Asset classes analyzed")
    optimal: BondCombo = Field(description="Optimal bond allocation combo")
    top_combos: list[BondCombo] = Field(description="Top-performing combos")
    marginals: list[MarginalCurve] = Field(description="Marginal analysis per asset class")
    target_year: int = Field(description="Year used for evaluation")
    total_combos_tested: int = Field(description="Total combinations tested")


class BondOverrideRequest(BaseModel):
    """Apply bond allocation overrides and re-run the simulation."""
    session_id: str = Field(description="Session ID from a previous /init response")
    isa_bond_pct: float = Field(default=0.0, ge=0.0, le=100.0, description="ISA bond allocation percentage (0-100)")
    gia_bond_pct: float = Field(default=0.0, ge=0.0, le=100.0, description="GIA bond allocation percentage (0-100)")
    pension_bond_pct: float = Field(default=0.0, ge=0.0, le=100.0, description="Pension bond allocation percentage (0-100)")
    annual_spend_target: float | None = Field(default=None, ge=0.0, description="New target annual retirement spend")
    retirement_age_offset: int | None = Field(default=0, ge=-30, le=30, description="Offset to apply to all planned retirement ages")
    percentile: int | None = Field(default=50, ge=1, le=99, description="Percentile to use for representative iteration (1-99)")