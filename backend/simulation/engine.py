from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from backend.simulation.entities import (
    ExpenseItem,
    GiftIncome,
    PensionPot,
    PersonEntity,
    PropertyEntity,
    RentalIncome,
    SalaryIncome,
)
from backend.simulation.entities.asset import AssetAccount


@dataclass(frozen=True)
class SimulationAssumptions:
    return_model: str = "parametric"  # "parametric" or "historical_bootstrap"
    inflation_rate: float = 0.02
    isa_annual_limit: float = 20_000.0
    state_pension_annual: float = 11_500.0
    cgt_annual_allowance: float = 3_000.0
    emergency_fund_months: float = 6.0
    pension_access_age: int = 55  # UK minimum private pension access age
    debt_interest_rate: float = 0.08  # Annual interest rate on negative cash (debt)
    bankruptcy_threshold: float = -100_000.0  # Net worth below which simulation terminates

    # P1.5/P1.6: Pension rules
    pension_annual_allowance: float = 60_000.0
    pension_lump_sum_allowance: float = 26_100.0
    pension_tapered_threshold: float = 260_000.0
    pension_tapered_reduction_rate: float = 0.5
    pension_minimum_allowance: float = 10_000.0
    mpaa_annual_allowance: float = 10_000.0

    # Configurable tax bands (default: UK 2024/25)
    personal_allowance: float = 12_570.0
    basic_rate_limit: float = 50_270.0
    higher_rate_limit: float = 125_140.0
    basic_rate: float = 0.20
    higher_rate: float = 0.40
    additional_rate: float = 0.45
    ni_primary_threshold: float = 12_570.0
    ni_upper_earnings_limit: float = 50_270.0
    ni_main_rate: float = 0.08
    ni_upper_rate: float = 0.02


@dataclass(frozen=True)
class SimulationScenario:
    start_year: int
    end_year: int
    people: list[PersonEntity]
    salary_by_person: dict[str, list[SalaryIncome]]
    pension_by_person: dict[str, PensionPot]

    assets: list[AssetAccount]
    expenses: list[ExpenseItem]
    properties: list[PropertyEntity] = None  # type: ignore[assignment]

    # Additional income types (not tied to retirement)
    rental_incomes: list[RentalIncome] = None  # type: ignore[assignment]
    gift_incomes: list[GiftIncome] = None  # type: ignore[assignment]

    annual_spend_target: float = 0.0
    planned_retirement_age_by_person: dict[str, int] = None  # type: ignore[assignment]

    pension_withdrawal_priority: int = 100

    assumptions: SimulationAssumptions = SimulationAssumptions()

    def __post_init__(self) -> None:
        # Initialize mutable defaults properly for frozen dataclass
        if self.rental_incomes is None:
            object.__setattr__(self, "rental_incomes", [])
        if self.gift_incomes is None:
            object.__setattr__(self, "gift_incomes", [])
        if self.properties is None:
            object.__setattr__(self, "properties", [])
        if self.planned_retirement_age_by_person is None:
            object.__setattr__(self, "planned_retirement_age_by_person", {})


@dataclass(frozen=True)
class SimulationRunMatrices:
    """
    Compact simulation output for fast aggregation.

    Each field is shaped (iterations, n_years) and stored as float64.
    Boolean-like outputs are stored as 0.0/1.0 for fast averaging.
    """

    years: list[int]
    fields: dict[str, np.ndarray]
