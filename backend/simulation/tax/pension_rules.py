"""
Pension tax rules for UK pension modelling (P1.5).

Supports:
- Multiple drawdown modes: simple (25% tax-free per withdrawal), UFPLS,
  PCLS-then-drawdown, fully taxable.
- Tax-free cash tracking per person (lifetime lump sum allowance).
- Annual allowance calculation with tapered allowance for high earners.
- Money Purchase Annual Allowance (MPAA) once taxable flexible access starts.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class PensionDrawdownMode(str, Enum):
    """How pension withdrawals are taxed."""
    SIMPLE = "simple"  # 25% tax-free per withdrawal (current default)
    UFULS = "ufuls"  # UFPLS: each withdrawal 25% tax-free until cap exhausted
    PCLS_THEN_DRAWDOWN = "pcls_then_drawdown"  # Take PCLS upfront, then fully taxable drawdown
    FULLY_TAXABLE = "fully_taxable"  # All withdrawals taxable (after PCLS exhausted)


class PensionContributionMethod(str, Enum):
    """How employee pension contributions are treated for tax/NI."""
    NET_PAY = "net_pay"  # Current default: reduces taxable salary, NI on gross
    RELIEF_AT_SOURCE = "relief_at_source"  # Employee contributes from net pay; basic-rate gross-up
    SALARY_SACRIFICE = "salary_sacrifice"  # Reduces both taxable salary and NI-able salary


@dataclass(frozen=True)
class PensionTaxFreeCashTracker:
    """Tracks remaining tax-free cash allowance per person across years."""
    remaining_allowance: float  # Remaining lump sum allowance
    tax_free_taken: float = 0.0  # Total tax-free cash taken to date
    pcls_taken: float = 0.0  # Lump sum taken at retirement
    pcls_pension_value_at_retirement: float = 0.0  # Pension value when PCLS taken

    def take_tax_free(self, amount: float) -> tuple[float, float]:
        """
        Take tax-free cash up to remaining allowance.

        Returns: (tax_free_taken, remaining_allowance).
        """
        allowed = min(amount, self.remaining_allowance)
        new_remaining = self.remaining_allowance - allowed
        new_taken = self.tax_free_taken + allowed
        return allowed, new_remaining

    def set_pcls(self, pension_value_at_retirement: float, lump_sum_allowance: float) -> None:
        """Record a PCLS taken at retirement."""
        self.pcls_pension_value_at_retirement = pension_value_at_retirement
        self.remaining_allowance = max(0.0, lump_sum_allowance - self.tax_free_taken)


@dataclass
class PensionAnnualAllowanceTracker:
    """Tracks annual pension contributions and annual allowance per person per year."""
    total_contributions: float = 0.0  # Employee + employer + pensioner contributions
    annual_allowance: float = 60_000.0  # Default annual allowance
    tapered_allowance: float = 60_000.0  # Potentially reduced by taper
    mpaa_active: bool = False  # Money Purchase Annual Allowance active
    excess_chargeable: float = 0.0  # Amount over allowance (subject to charge)
    is_high_earner: bool = False  # Whether tapered allowance applies

    @property
    def effective_allowance(self) -> float:
        if self.mpaa_active:
            return min(self.annual_allowance, self.mpaa_annual_allowance_default())
        if self.is_high_earner:
            return self.tapered_allowance
        return self.annual_allowance

    def add_contribution(self, employee: float, employer: float, pensioner: float = 0.0) -> None:
        """Add contributions to the running total."""
        self.total_contributions += employee + employer + pensioner

    def reset_year(self) -> None:
        """Reset for a new tax year."""
        self.total_contributions = 0.0
        self.excess_chargeable = 0.0

    def check_excess(self) -> float:
        """
        Check if contributions exceed the effective allowance.

        Returns the excess amount (0.0 if within allowance).
        """
        excess = max(0.0, self.total_contributions - self.effective_allowance)
        self.excess_chargeable = excess
        return excess

    @staticmethod
    def mpaa_annual_allowance_default() -> float:
        """Default MPAA annual allowance."""
        return 10_000.0


@dataclass(frozen=True)
class AnnualAllowanceResult:
    """Result of annual allowance check."""
    total_contributions: float
    effective_allowance: float
    excess: float
    chargeable_amount: float
    is_high_earner: bool
    mpaa_active: bool


@dataclass(frozen=True)
class PensionDrawdownModeResult:
    """Result of pension drawdown with mode-specific tax treatment."""
    gross_withdrawal: float
    tax_free_amount: float
    taxable_amount: float
    tax_paid: float
    net_income: float
    mpaa_triggered: bool  # Whether this withdrawal triggers MPAA
    remaining_tax_free: float  # Remaining tax-free cash allowance


def calculate_tapered_annual_allowance(
    *,
    threshold_income: float,
    adjusted_income: float,
    standard_allowance: float = 60_000.0,
    tapered_threshold: float = 260_000.0,
    reduction_rate: float = 0.5,
    minimum_allowance: float = 10_000.0,
) -> AnnualAllowanceResult:
    """
    Calculate tapered annual allowance for high earners.

    When threshold income exceeds £260k, the annual allowance is reduced
    by £1 for every £2 over the threshold, down to a minimum of £10k.

    Args:
        threshold_income: Total income (salary + benefits + pension contributions).
        adjusted_income: Threshold income + employer pension contributions.
        standard_allowance: Standard annual allowance (£60,000).
        tapered_threshold: Threshold income above which taper applies (£260,000).
        reduction_rate: Reduction rate (0.5 = £1 per £2).
        minimum_allowance: Minimum tapered allowance (£10,000).

    Returns:
        AnnualAllowanceResult with effective allowance and excess.
    """
    is_high_earner = threshold_income > tapered_threshold
    if not is_high_earner:
        return AnnualAllowanceResult(
            total_contributions=0.0,
            effective_allowance=standard_allowance,
            excess=0.0,
            chargeable_amount=0.0,
            is_high_earner=False,
            mpaa_active=False,
        )

    excess_income = adjusted_income - tapered_threshold
    reduction = min(standard_allowance, excess_income * reduction_rate)
    tapered = max(minimum_allowance, standard_allowance - reduction)

    return AnnualAllowanceResult(
        total_contributions=0.0,
        effective_allowance=tapered,
        excess=0.0,
        chargeable_amount=0.0,
        is_high_earner=True,
        mpaa_active=False,
    )


def check_annual_allowance(
    *,
    employee_contributions: float,
    employer_contributions: float,
    pensioner_contributions: float = 0.0,
    threshold_income: float,
    adjusted_income: float,
    standard_allowance: float = 60_000.0,
    tapered_threshold: float = 260_000.0,
    reduction_rate: float = 0.5,
    minimum_allowance: float = 10_000.0,
    mpaa_active: bool = False,
) -> AnnualAllowanceResult:
    """
    Check if total pension contributions exceed the annual allowance.

    Args:
        employee_contributions: Employee pension contributions this year.
        employer_contributions: Employer pension contributions this year.
        pensioner_contributions: Pensioner's own contributions this year.
        threshold_income: Total income for taper calculation.
        adjusted_income: Adjusted income for taper calculation.
        standard_allowance: Standard annual allowance.
        tapered_threshold: Income threshold for taper.
        reduction_rate: Taper reduction rate.
        minimum_allowance: Minimum tapered allowance.
        mpaa_active: Whether MPAA is active.

    Returns:
        AnnualAllowanceResult with allowance details.
    """
    total = employee_contributions + employer_contributions + pensioner_contributions

    # Determine effective allowance
    effective = standard_allowance
    is_high_earner = False

    if mpaa_active:
        effective = min(standard_allowance, 10_000.0)
    else:
        is_high_earner = threshold_income > tapered_threshold
        if is_high_earner:
            excess_income = adjusted_income - tapered_threshold
            reduction = min(standard_allowance, excess_income * reduction_rate)
            tapered = max(minimum_allowance, standard_allowance - reduction)
            effective = tapered

    excess = max(0.0, total - effective)

    return AnnualAllowanceResult(
        total_contributions=total,
        effective_allowance=effective,
        excess=excess,
        chargeable_amount=excess,
        is_high_earner=is_high_earner,
        mpaa_active=mpaa_active,
    )


def calculate_drawdown_with_mode(
    *,
    target_net_income: float,
    other_taxable_income: float,
    pension_balance: float,
    mode: PensionDrawdownMode,
    remaining_tax_free_cash: float,
    lump_sum_allowance: float,
    bands,  # IncomeTaxBands
    mpaa_active: bool = False,
) -> PensionDrawdownModeResult:
    """
    Calculate pension drawdown using the specified mode.

    Args:
        target_net_income: Net income needed from drawdown.
        other_taxable_income: Other taxable income this year.
        pension_balance: Available pension balance.
        mode: Drawdown mode.
        remaining_tax_free_cash: Remaining tax-free cash allowance.
        lump_sum_allowance: Lifetime lump sum allowance.
        bands: Income tax bands.
        mpaa_active: Whether MPAA is active.

    Returns:
        PensionDrawdownModeResult with mode-specific tax treatment.
    """
    from backend.simulation.tax.income_tax import calculate_income_tax
    from backend.simulation.tax.pension_drawdown import calculate_pension_drawdown

    if target_net_income <= 0 or pension_balance <= 0:
        return PensionDrawdownModeResult(
            gross_withdrawal=0.0,
            tax_free_amount=0.0,
            taxable_amount=0.0,
            tax_paid=0.0,
            net_income=0.0,
            mpaa_triggered=False,
            remaining_tax_free=remaining_tax_free_cash,
        )

    if mode == PensionDrawdownMode.SIMPLE:
        # Current behavior: 25% tax-free per withdrawal
        result = calculate_pension_drawdown(
            target_net_income=target_net_income,
            other_taxable_income=other_taxable_income,
            pension_balance=pension_balance,
            bands=bands,
        )
        return PensionDrawdownModeResult(
            gross_withdrawal=result.gross_withdrawal,
            tax_free_amount=result.tax_free_amount,
            taxable_amount=result.taxable_amount,
            tax_paid=result.tax_paid,
            net_income=result.net_income,
            mpaa_triggered=False,
            remaining_tax_free=remaining_tax_free_cash,
        )

    elif mode == PensionDrawdownMode.UFULS:
        # UFPLS: each withdrawal is 25% tax-free, but limited by remaining allowance
        tax_free_allowed = min(
            pension_balance * 0.25,
            remaining_tax_free_cash,
            lump_sum_allowance - (lump_sum_allowance - remaining_tax_free_cash),
        )
        # Simplified: use remaining allowance as the cap
        actual_tax_free = min(pension_balance * 0.25, remaining_tax_free_cash)
        taxable = pension_balance - actual_tax_free

        # If we can't take the full target, reduce withdrawal
        if actual_tax_free < pension_balance * 0.25:
            # Remaining tax-free is exhausted; switch to fully taxable
            taxable = pension_balance
            actual_tax_free = 0.0
            remaining_after = 0.0
        else:
            remaining_after = remaining_tax_free_cash - actual_tax_free

        # Calculate tax on taxable portion
        total_taxable = other_taxable_income + taxable
        total_tax = calculate_income_tax(taxable_income=total_taxable, bands=bands)
        base_tax = calculate_income_tax(taxable_income=other_taxable_income, bands=bands)
        pension_tax = max(0.0, total_tax - base_tax)

        net = pension_balance - pension_tax
        gross = pension_balance

        # MPAA triggered if taxable withdrawal > 0
        mpaa_triggered = taxable > 0 and not mpaa_active

        return PensionDrawdownModeResult(
            gross_withdrawal=gross,
            tax_free_amount=actual_tax_free,
            taxable_amount=taxable,
            tax_paid=pension_tax,
            net_income=net,
            mpaa_triggered=mpaa_triggered,
            remaining_tax_free=remaining_after,
        )

    elif mode == PensionDrawdownMode.PCLS_THEN_DRAWDOWN:
        # PCLS taken upfront, remaining is fully taxable drawdown
        # This mode assumes PCLS was taken at retirement; all subsequent withdrawals are taxable
        result = calculate_pension_drawdown(
            target_net_income=target_net_income,
            other_taxable_income=other_taxable_income + pension_balance * 0.75,
            pension_balance=pension_balance,
            bands=bands,
        )
        # All of the withdrawal is taxable (PCLS already taken)
        taxable = result.gross_withdrawal
        tax_free = 0.0

        total_taxable = other_taxable_income + taxable
        total_tax = calculate_income_tax(taxable_income=total_taxable, bands=bands)
        base_tax = calculate_income_tax(taxable_income=other_taxable_income, bands=bands)
        pension_tax = max(0.0, total_tax - base_tax)

        net = result.gross_withdrawal - pension_tax
        mpaa_triggered = False  # MPAA already triggered at PCLS

        return PensionDrawdownModeResult(
            gross_withdrawal=result.gross_withdrawal,
            tax_free_amount=tax_free,
            taxable_amount=taxable,
            tax_paid=pension_tax,
            net_income=net,
            mpaa_triggered=mpaa_triggered,
            remaining_tax_free=0.0,  # PCLS already taken
        )

    elif mode == PensionDrawdownMode.FULLY_TAXABLE:
        # All withdrawals are taxable income
        result = calculate_pension_drawdown(
            target_net_income=target_net_income,
            other_taxable_income=other_taxable_income,
            pension_balance=pension_balance,
            bands=bands,
        )
        taxable = result.gross_withdrawal
        tax_free = 0.0

        total_taxable = other_taxable_income + taxable
        total_tax = calculate_income_tax(taxable_income=total_taxable, bands=bands)
        base_tax = calculate_income_tax(taxable_income=other_taxable_income, bands=bands)
        pension_tax = max(0.0, total_tax - base_tax)

        net = result.gross_withdrawal - pension_tax

        return PensionDrawdownModeResult(
            gross_withdrawal=result.gross_withdrawal,
            tax_free_amount=tax_free,
            taxable_amount=taxable,
            tax_paid=pension_tax,
            net_income=net,
            mpaa_triggered=False,
            remaining_tax_free=0.0,
        )

    # Fallback to simple mode
    result = calculate_pension_drawdown(
        target_net_income=target_net_income,
        other_taxable_income=other_taxable_income,
        pension_balance=pension_balance,
        bands=bands,
    )
    return PensionDrawdownModeResult(
        gross_withdrawal=result.gross_withdrawal,
        tax_free_amount=result.tax_free_amount,
        taxable_amount=result.taxable_amount,
        tax_paid=result.tax_paid,
        net_income=result.net_income,
        mpaa_triggered=False,
        remaining_tax_free=remaining_tax_free_cash,
    )
