from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NationalInsuranceBands:
    primary_threshold: float = 12_570.0
    upper_earnings_limit: float = 50_270.0

    main_rate: float = 0.08
    upper_rate: float = 0.02


def calculate_ni_class1(*, gross_annual: float, bands: NationalInsuranceBands) -> float:
    if gross_annual <= bands.primary_threshold:
        return 0.0

    main_amount = min(gross_annual, bands.upper_earnings_limit) - bands.primary_threshold
    upper_amount = max(0.0, gross_annual - bands.upper_earnings_limit)
    return main_amount * bands.main_rate + upper_amount * bands.upper_rate

