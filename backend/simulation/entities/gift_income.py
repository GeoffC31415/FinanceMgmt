from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GiftIncome:
    """Gift income - not subject to any tax."""
    gross_annual: float
    annual_growth_rate: float
    start_year: int | None = None
    end_year: int | None = None
    person_key: str | None = None  # person this income is attributed to (tax-free, for consistency)
