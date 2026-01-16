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
    cgt_rate: float,
) -> GiaWithdrawalResult:
    """
    Simplified GIA withdrawal tax treatment.

    - Treat a portion of each withdrawal as capital gains based on (balance - cost_basis) / balance.
    - Apply an annual CGT allowance, then a flat CGT rate above the allowance.

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

    tax_paid = taxable_gains * max(0.0, cgt_rate)
    net = gross - tax_paid

    return GiaWithdrawalResult(
        gross_withdrawal=gross,
        tax_paid=tax_paid,
        net_withdrawal=net,
        gains_realized=gains_realized,
        cgt_allowance_used=allowance_used,
        cgt_allowance_remaining=allowance_remaining - allowance_used,
    )

