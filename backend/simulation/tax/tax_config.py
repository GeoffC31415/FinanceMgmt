"""
Configurable UK tax band presets.

Provides TaxYearConfig with all thresholds and a registry of presets
for different UK tax years. Users can select a preset or override individual values.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class TaxYearConfig:
    """All UK tax thresholds for a given tax year."""
    # Income tax
    personal_allowance: float = 12_570.0
    basic_rate_limit: float = 50_270.0
    higher_rate_limit: float = 125_140.0
    basic_rate: float = 0.20
    higher_rate: float = 0.40
    additional_rate: float = 0.45

    # National Insurance
    ni_primary_threshold: float = 12_570.0
    ni_upper_earnings_limit: float = 50_270.0
    ni_main_rate: float = 0.08
    ni_upper_rate: float = 0.02

    # Pension (P1.5/P1.6)
    pension_annual_allowance: float = 60_000.0
    pension_lump_sum_allowance: float = 26_100.0
    pension_tapered_threshold: float = 260_000.0
    pension_tapered_reduction_rate: float = 0.5
    pension_minimum_allowance: float = 10_000.0
    mpaa_annual_allowance: float = 10_000.0

    # Dividend (P2.1)
    dividend_allowance: float = 500.0
    dividend_basic_rate: float = 0.0875
    dividend_higher_rate: float = 0.3375
    dividend_additional_rate: float = 0.38125

    # Savings (P2.1)
    savings_starting_rate_limit: float = 5_000.0
    personal_savings_allowance: float = 1_000.0  # basic rate taxpayers
    basic_rate_savings_allowance: float = 1_000.0
    higher_rate_savings_allowance: float = 0.0

    # CGT
    cgt_basic_rate: float = 0.10
    cgt_higher_rate: float = 0.20
    cgt_property_basic_rate: float = 0.18
    cgt_property_higher_rate: float = 0.24

    # State pension
    state_pension_regular: float = 11_500.0
    state_pension_new_max: float = 11_500.0

    # Child benefit
    child_benefit_weekly_rate: float = 0.0
    child_benefit_high_income_threshold: float = 60_000.0
    child_benefit_charge_rate: float = 0.5

    # Marriage allowance
    marriage_allowance_transfer: float = 1_260.0

    # Student loan (P2.3)
    student_loan_plan_thresholds: dict[str, float] = None  # type: ignore[assignment]

    def __post_init__(self):
        if self.student_loan_plan_thresholds is None:
            object.__setattr__(self, "student_loan_plan_thresholds", {})


# ── Presets for UK tax years ──────────────────────────────────────

TAX_YEAR_PRESETS: dict[str, TaxYearConfig] = {
    "2024/25": TaxYearConfig(
        personal_allowance=12_570.0,
        basic_rate_limit=50_270.0,
        higher_rate_limit=125_140.0,
        basic_rate=0.20,
        higher_rate=0.40,
        additional_rate=0.45,
        ni_primary_threshold=12_570.0,
        ni_upper_earnings_limit=50_270.0,
        ni_main_rate=0.08,
        ni_upper_rate=0.02,
        pension_annual_allowance=60_000.0,
        pension_lump_sum_allowance=26_100.0,
        pension_tapered_threshold=260_000.0,
        pension_tapered_reduction_rate=0.5,
        pension_minimum_allowance=10_000.0,
        mpaa_annual_allowance=10_000.0,
        dividend_allowance=1_000.0,
        dividend_basic_rate=0.0875,
        dividend_higher_rate=0.3375,
        dividend_additional_rate=0.38125,
        savings_starting_rate_limit=5_000.0,
        personal_savings_allowance=1_000.0,
        basic_rate_savings_allowance=1_000.0,
        higher_rate_savings_allowance=0.0,
        cgt_basic_rate=0.10,
        cgt_higher_rate=0.20,
        cgt_property_basic_rate=0.18,
        cgt_property_higher_rate=0.24,
        state_pension_regular=11_500.0,
        state_pension_new_max=11_500.0,
        child_benefit_weekly_rate=0.0,
        child_benefit_high_income_threshold=60_000.0,
        child_benefit_charge_rate=0.5,
        marriage_allowance_transfer=1_260.0,
        student_loan_plan_thresholds={},
    ),
    "2023/24": TaxYearConfig(
        personal_allowance=12_570.0,
        basic_rate_limit=50_270.0,
        higher_rate_limit=125_140.0,
        basic_rate=0.20,
        higher_rate=0.40,
        additional_rate=0.45,
        ni_primary_threshold=12_570.0,
        ni_upper_earnings_limit=50_270.0,
        ni_main_rate=0.10,
        ni_upper_rate=0.02,
        pension_annual_allowance=60_000.0,
        pension_lump_sum_allowance=26_100.0,
        pension_tapered_threshold=260_000.0,
        pension_tapered_reduction_rate=0.5,
        pension_minimum_allowance=10_000.0,
        mpaa_annual_allowance=10_000.0,
        dividend_allowance=2_000.0,
        dividend_basic_rate=0.0875,
        dividend_higher_rate=0.3375,
        dividend_additional_rate=0.38125,
        savings_starting_rate_limit=5_000.0,
        personal_savings_allowance=1_000.0,
        basic_rate_savings_allowance=1_000.0,
        higher_rate_savings_allowance=0.0,
        cgt_basic_rate=0.10,
        cgt_higher_rate=0.20,
        cgt_property_basic_rate=0.18,
        cgt_property_higher_rate=0.24,
        state_pension_regular=11_500.0,
        state_pension_new_max=11_500.0,
        child_benefit_weekly_rate=0.0,
        child_benefit_high_income_threshold=60_000.0,
        child_benefit_charge_rate=0.5,
        marriage_allowance_transfer=1_260.0,
        student_loan_plan_thresholds={},
    ),
    "2022/23": TaxYearConfig(
        personal_allowance=12_570.0,
        basic_rate_limit=50_270.0,
        higher_rate_limit=150_000.0,
        basic_rate=0.20,
        higher_rate=0.40,
        additional_rate=0.45,
        ni_primary_threshold=12_570.0,
        ni_upper_earnings_limit=50_270.0,
        ni_main_rate=0.1325,
        ni_upper_rate=0.0325,
        pension_annual_allowance=40_000.0,
        pension_lump_sum_allowance=26_100.0,
        pension_tapered_threshold=240_000.0,
        pension_tapered_reduction_rate=0.5,
        pension_minimum_allowance=10_000.0,
        mpaa_annual_allowance=10_000.0,
        dividend_allowance=2_000.0,
        dividend_basic_rate=0.0875,
        dividend_higher_rate=0.3375,
        dividend_additional_rate=0.38125,
        savings_starting_rate_limit=5_000.0,
        personal_savings_allowance=1_000.0,
        basic_rate_savings_allowance=1_000.0,
        higher_rate_savings_allowance=0.0,
        cgt_basic_rate=0.10,
        cgt_higher_rate=0.20,
        cgt_property_basic_rate=0.18,
        cgt_property_higher_rate=0.24,
        state_pension_regular=11_500.0,
        state_pension_new_max=11_500.0,
        child_benefit_weekly_rate=0.0,
        child_benefit_high_income_threshold=50_000.0,
        child_benefit_charge_rate=0.5,
        marriage_allowance_transfer=1_260.0,
        student_loan_plan_thresholds={},
    ),
    "2021/22": TaxYearConfig(
        personal_allowance=12_570.0,
        basic_rate_limit=50_270.0,
        higher_rate_limit=150_000.0,
        basic_rate=0.20,
        higher_rate=0.40,
        additional_rate=0.45,
        ni_primary_threshold=9_568.0,
        ni_upper_earnings_limit=50_270.0,
        ni_main_rate=0.12,
        ni_upper_rate=0.02,
        pension_annual_allowance=40_000.0,
        pension_lump_sum_allowance=26_100.0,
        pension_tapered_threshold=240_000.0,
        pension_tapered_reduction_rate=0.5,
        pension_minimum_allowance=10_000.0,
        mpaa_annual_allowance=10_000.0,
        dividend_allowance=2_000.0,
        dividend_basic_rate=0.0875,
        dividend_higher_rate=0.3375,
        dividend_additional_rate=0.38125,
        savings_starting_rate_limit=5_000.0,
        personal_savings_allowance=1_000.0,
        basic_rate_savings_allowance=1_000.0,
        higher_rate_savings_allowance=0.0,
        cgt_basic_rate=0.10,
        cgt_higher_rate=0.20,
        cgt_property_basic_rate=0.18,
        cgt_property_higher_rate=0.24,
        state_pension_regular=11_500.0,
        state_pension_new_max=11_500.0,
        child_benefit_weekly_rate=0.0,
        child_benefit_high_income_threshold=50_000.0,
        child_benefit_charge_rate=0.5,
        marriage_allowance_transfer=1_260.0,
        student_loan_plan_thresholds={},
    ),
    "2025/26": TaxYearConfig(
        personal_allowance=12_570.0,
        basic_rate_limit=50_270.0,
        higher_rate_limit=125_140.0,
        basic_rate=0.20,
        higher_rate=0.40,
        additional_rate=0.45,
        ni_primary_threshold=12_570.0,
        ni_upper_earnings_limit=50_270.0,
        ni_main_rate=0.08,
        ni_upper_rate=0.02,
        pension_annual_allowance=60_000.0,
        pension_lump_sum_allowance=26_100.0,
        pension_tapered_threshold=260_000.0,
        pension_tapered_reduction_rate=0.5,
        pension_minimum_allowance=10_000.0,
        mpaa_annual_allowance=10_000.0,
        dividend_allowance=500.0,
        dividend_basic_rate=0.0875,
        dividend_higher_rate=0.3375,
        dividend_additional_rate=0.38125,
        savings_starting_rate_limit=5_000.0,
        personal_savings_allowance=1_000.0,
        basic_rate_savings_allowance=1_000.0,
        higher_rate_savings_allowance=0.0,
        cgt_basic_rate=0.10,
        cgt_higher_rate=0.20,
        cgt_property_basic_rate=0.18,
        cgt_property_higher_rate=0.24,
        state_pension_regular=11_500.0,
        state_pension_new_max=11_500.0,
        child_benefit_weekly_rate=0.0,
        child_benefit_high_income_threshold=60_000.0,
        child_benefit_charge_rate=0.5,
        marriage_allowance_transfer=1_260.0,
        student_loan_plan_thresholds={},
    ),
}

DEFAULT_TAX_YEAR = "2024/25"


def get_tax_config(tax_year: str | None = None) -> TaxYearConfig:
    """Get tax config for a given tax year, falling back to default."""
    if tax_year and tax_year in TAX_YEAR_PRESETS:
        return TAX_YEAR_PRESETS[tax_year]
    return TAX_YEAR_PRESETS[DEFAULT_TAX_YEAR]


def get_available_tax_years() -> list[str]:
    """Return sorted list of available tax year presets."""
    return sorted(TAX_YEAR_PRESETS.keys(), reverse=True)


def tax_config_from_assumptions(assumptions: dict[str, Any]) -> TaxYearConfig:
    """
    Build a TaxYearConfig from scenario assumptions JSON.

    Priority:
    1. Individual overrides in assumptions (e.g. personal_allowance=15000)
    2. Tax year preset (e.g. tax_year="2023/24")
    3. Default (2024/25)
    """
    tax_year = assumptions.get("tax_year")
    base = get_tax_config(tax_year)

    # Check for individual overrides
    overrides: dict[str, Any] = {}
    for field in [
        "personal_allowance", "basic_rate_limit", "higher_rate_limit",
        "basic_rate", "higher_rate", "additional_rate",
        "ni_primary_threshold", "ni_upper_earnings_limit",
        "ni_main_rate", "ni_upper_rate",
        "pension_annual_allowance", "pension_lump_sum_allowance",
        "pension_tapered_threshold", "pension_tapered_reduction_rate",
        "pension_minimum_allowance", "mpaa_annual_allowance",
        "dividend_allowance", "dividend_basic_rate", "dividend_higher_rate",
        "dividend_additional_rate",
        "savings_starting_rate_limit", "personal_savings_allowance",
        "basic_rate_savings_allowance", "higher_rate_savings_allowance",
        "cgt_basic_rate", "cgt_higher_rate",
        "cgt_property_basic_rate", "cgt_property_higher_rate",
        "state_pension_regular", "state_pension_new_max",
        "child_benefit_weekly_rate", "child_benefit_high_income_threshold",
        "child_benefit_charge_rate",
        "marriage_allowance_transfer",
    ]:
        if field in assumptions:
            try:
                overrides[field] = float(assumptions[field])
            except (ValueError, TypeError):
                pass

    if overrides:
        return TaxYearConfig(**{**base.__dict__, **overrides})
    return base
