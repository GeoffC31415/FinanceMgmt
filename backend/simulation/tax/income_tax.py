from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class IncomeTaxBands:
    personal_allowance: float = 12_570.0
    basic_rate_limit: float = 50_270.0
    higher_rate_limit: float = 125_140.0

    basic_rate: float = 0.20
    higher_rate: float = 0.40
    additional_rate: float = 0.45


def calculate_income_tax(*, taxable_income: float, bands: IncomeTaxBands) -> float:
    if taxable_income <= 0:
        return 0.0

    remaining = taxable_income
    tax = 0.0

    allowance = min(remaining, bands.personal_allowance)
    remaining -= allowance
    if remaining <= 0:
        return 0.0

    basic_band = max(0.0, bands.basic_rate_limit - bands.personal_allowance)
    basic_amount = min(remaining, basic_band)
    tax += basic_amount * bands.basic_rate
    remaining -= basic_amount
    if remaining <= 0:
        return tax

    higher_band = max(0.0, bands.higher_rate_limit - bands.basic_rate_limit)
    higher_amount = min(remaining, higher_band)
    tax += higher_amount * bands.higher_rate
    remaining -= higher_amount
    if remaining <= 0:
        return tax

    tax += remaining * bands.additional_rate
    return tax

