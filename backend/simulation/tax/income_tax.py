from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class IncomeTaxBreakdown:
    personal_allowance_used: float
    personal_allowance_lost: float
    basic_band_amount: float
    basic_band_tax: float
    higher_band_amount: float
    higher_band_tax: float
    additional_band_amount: float
    additional_band_tax: float
    allowance_taper_tax: float
    total_tax: float


@dataclass(frozen=True)
class IncomeTaxBands:
    personal_allowance: float = 12_570.0
    basic_rate_limit: float = 50_270.0
    higher_rate_limit: float = 125_140.0

    basic_rate: float = 0.20
    higher_rate: float = 0.40
    additional_rate: float = 0.45


def calculate_income_tax_breakdown(*, taxable_income: float, bands: IncomeTaxBands) -> IncomeTaxBreakdown:
    """Return income tax split by statutory bands plus explicit allowance taper.

    The normal-rate band rows are calculated as if the full personal allowance
    were available. Any extra tax caused by losing personal allowance above
    £100k is exposed separately as ``allowance_taper_tax`` so high earners can
    see the 60% effective marginal-rate zone rather than having it hidden in the
    higher-rate line.
    """
    if taxable_income <= 0:
        return IncomeTaxBreakdown(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    effective_allowance = bands.personal_allowance
    if taxable_income > 100_000:
        reduction = min(bands.personal_allowance, (taxable_income - 100_000) / 2.0)
        effective_allowance = max(0.0, bands.personal_allowance - reduction)

    personal_allowance_used = min(taxable_income, effective_allowance)
    personal_allowance_lost = max(0.0, bands.personal_allowance - effective_allowance)

    remaining_without_taper = max(0.0, taxable_income - bands.personal_allowance)

    basic_band = max(0.0, bands.basic_rate_limit - bands.personal_allowance)
    basic_band_amount = min(remaining_without_taper, basic_band)
    remaining_without_taper -= basic_band_amount
    basic_band_tax = basic_band_amount * bands.basic_rate

    higher_band = max(0.0, bands.higher_rate_limit - bands.basic_rate_limit)
    higher_band_amount = min(remaining_without_taper, higher_band)
    remaining_without_taper -= higher_band_amount
    higher_band_tax = higher_band_amount * bands.higher_rate

    additional_band_amount = max(0.0, remaining_without_taper)
    additional_band_tax = additional_band_amount * bands.additional_rate

    total_tax = calculate_income_tax(taxable_income=taxable_income, bands=bands)
    tax_without_taper = basic_band_tax + higher_band_tax + additional_band_tax
    allowance_taper_tax = max(0.0, total_tax - tax_without_taper)

    return IncomeTaxBreakdown(
        personal_allowance_used=personal_allowance_used,
        personal_allowance_lost=personal_allowance_lost,
        basic_band_amount=basic_band_amount,
        basic_band_tax=basic_band_tax,
        higher_band_amount=higher_band_amount,
        higher_band_tax=higher_band_tax,
        additional_band_amount=additional_band_amount,
        additional_band_tax=additional_band_tax,
        allowance_taper_tax=allowance_taper_tax,
        total_tax=total_tax,
    )


def calculate_income_tax(*, taxable_income: float, bands: IncomeTaxBands) -> float:
    if taxable_income <= 0:
        return 0.0

    # Personal allowance tapering: reduced by £1 for every £2 above £100k
    effective_allowance = bands.personal_allowance
    if taxable_income > 100_000:
        reduction = min(bands.personal_allowance, (taxable_income - 100_000) / 2.0)
        effective_allowance = max(0.0, bands.personal_allowance - reduction)

    remaining = taxable_income
    tax = 0.0

    allowance = min(remaining, effective_allowance)
    remaining -= allowance
    if remaining <= 0:
        return 0.0

    # Use original personal_allowance for band boundary calculation
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

