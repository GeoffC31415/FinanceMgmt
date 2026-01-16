from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class YearlySnapshot:
    year: int
    ages: dict[str, int]

    isa_balance: float
    pension_balance: float
    cash_balance: float
    total_assets: float

    mortgage_balance: float
    total_liabilities: float

    net_worth: float

    salary_gross: float
    salary_net: float
    rental_income: float
    gift_income: float
    pension_income: float
    state_pension_income: float
    investment_returns: float
    total_income: float

    total_expenses: float
    mortgage_payment: float
    pension_contributions: float
    fun_fund: float

    income_tax_paid: float
    ni_paid: float
    total_tax: float

    is_retired: dict[str, bool]
    mortgage_paid_off: bool
    is_depleted: bool


@dataclass(frozen=True)
class RunResult:
    snapshots: list[YearlySnapshot]


@dataclass(frozen=True)
class PercentileSeries:
    percentile: int
    values: list[float]


@dataclass(frozen=True)
class SimulationResults:
    runs: list[RunResult]

