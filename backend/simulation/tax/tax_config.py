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
    ]:
        if field in assumptions:
            try:
                overrides[field] = float(assumptions[field])
            except (ValueError, TypeError):
                pass

    if overrides:
        return TaxYearConfig(**{**base.__dict__, **overrides})
    return base
