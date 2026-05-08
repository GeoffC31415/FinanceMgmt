from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WithdrawalResult:
    gross_withdrawal: float
    tax_paid: float
    net_withdrawal: float


@dataclass(frozen=True)
class GiaWithdrawalResult(WithdrawalResult):
    gains_realized: float
    cgt_allowance_used: float
    cgt_allowance_remaining: float


def calculate_tax_free_withdrawal(*, requested: float, balance: float) -> WithdrawalResult:
    if requested <= 0 or balance <= 0:
        return WithdrawalResult(gross_withdrawal=0.0, tax_paid=0.0, net_withdrawal=0.0)

    gross = min(balance, requested)
    return WithdrawalResult(gross_withdrawal=gross, tax_paid=0.0, net_withdrawal=gross)


def calculate_gia_withdrawal(
    *,
    requested: float,
    balance: float,
    cost_basis: float,
    cgt_allowance_remaining: float,
    remaining_basic_rate_band: float,
) -> GiaWithdrawalResult:
    """
    GIA withdrawal tax treatment with income-dependent CGT rates.

    - Treat a portion of each withdrawal as capital gains based on (balance - cost_basis) / balance.
    - Apply an annual CGT allowance, then income-dependent CGT rates:
      - 10% on gains within the remaining basic rate band
      - 20% on gains above the remaining basic rate band

    Notes:
    - This is a simplification: real CGT uses per-disposal rules, loss offsets, and varying rates.
    """
    if requested <= 0 or balance <= 0:
        return GiaWithdrawalResult(
            gross_withdrawal=0.0,
            tax_paid=0.0,
            net_withdrawal=0.0,
            gains_realized=0.0,
            cgt_allowance_used=0.0,
            cgt_allowance_remaining=max(0.0, cgt_allowance_remaining),
        )

    gross = min(balance, requested)
    safe_balance = max(0.0, balance)
    safe_cost_basis = max(0.0, cost_basis)

    total_gains = max(0.0, safe_balance - safe_cost_basis)
    gains_ratio = (total_gains / safe_balance) if safe_balance > 0 else 0.0
    gains_realized = gross * gains_ratio

    allowance_remaining = max(0.0, cgt_allowance_remaining)
    allowance_used = min(allowance_remaining, gains_realized)
    taxable_gains = max(0.0, gains_realized - allowance_used)

    # Income-dependent CGT rates: annual exempt amount is deducted first,
    # then taxable gains use any remaining basic-rate band at 10% and the
    # excess at 20%.
    lower_band_remaining = max(0.0, remaining_basic_rate_band)
    taxable_lower = min(taxable_gains, lower_band_remaining)
    taxable_higher = max(0.0, taxable_gains - taxable_lower)
    tax_paid = taxable_lower * 0.10 + taxable_higher * 0.20
    net = gross - tax_paid

    return GiaWithdrawalResult(
        gross_withdrawal=gross,
        tax_paid=tax_paid,
        net_withdrawal=net,
        gains_realized=gains_realized,
        cgt_allowance_used=allowance_used,
        cgt_allowance_remaining=allowance_remaining - allowance_used,
    )

