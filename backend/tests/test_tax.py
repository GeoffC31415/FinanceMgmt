"""
Unit tests for UK tax calculations: income tax, NI, pension drawdown, CGT withdrawals.

Tests are based on known 2024/25 UK tax year thresholds:
  Personal allowance: £12,570
  Basic rate (20%): £12,571 – £50,270
  Higher rate (40%): £50,271 – £125,140
  Additional rate (45%): £125,141+
  NI primary threshold: £12,570
  NI main rate: 8% up to £50,270, 2% above
"""
from __future__ import annotations

import pytest

from backend.simulation.tax.income_tax import IncomeTaxBands, calculate_income_tax
from backend.simulation.tax.national_insurance import NationalInsuranceBands, calculate_ni_class1
from backend.simulation.tax.calculator import TaxBreakdown, TaxCalculator
from backend.simulation.tax.pension_relief import apply_pension_contribution_relief, pension_tax_free_lump_sum
from backend.simulation.tax.pension_drawdown import calculate_pension_drawdown, PensionDrawdownResult
from backend.simulation.tax.withdrawals import (
    calculate_tax_free_withdrawal,
    calculate_gia_withdrawal,
    WithdrawalResult,
    GiaWithdrawalResult,
)


# ────────────────────────────── Income Tax ──────────────────────────────


class TestIncomeTax:
    """Test income tax band calculations against known worked examples."""

    bands = IncomeTaxBands()

    def test_zero_income(self):
        assert calculate_income_tax(taxable_income=0.0, bands=self.bands) == 0.0

    def test_negative_income(self):
        assert calculate_income_tax(taxable_income=-5_000.0, bands=self.bands) == 0.0

    def test_within_personal_allowance(self):
        """Income under £12,570 should pay no tax."""
        assert calculate_income_tax(taxable_income=12_000.0, bands=self.bands) == 0.0
        assert calculate_income_tax(taxable_income=12_570.0, bands=self.bands) == 0.0

    def test_basic_rate_boundary(self):
        """£12,571 = £1 in basic rate band → 20p tax."""
        tax = calculate_income_tax(taxable_income=12_571.0, bands=self.bands)
        assert tax == pytest.approx(0.20, abs=0.01)

    def test_basic_rate_example(self):
        """£30,000 salary → (30000 - 12570) * 0.20 = £3,486."""
        tax = calculate_income_tax(taxable_income=30_000.0, bands=self.bands)
        assert tax == pytest.approx(3_486.0, abs=1.0)

    def test_higher_rate_boundary(self):
        """At £50,270, all basic band is used. Tax = (50270 - 12570) * 0.20 = £7,540."""
        tax = calculate_income_tax(taxable_income=50_270.0, bands=self.bands)
        assert tax == pytest.approx(7_540.0, abs=1.0)

    def test_higher_rate_example(self):
        """£75,000: basic tax + (75000 - 50270) * 0.40."""
        basic_tax = (50_270 - 12_570) * 0.20  # £7,540
        higher_tax = (75_000 - 50_270) * 0.40  # £9,892
        expected = basic_tax + higher_tax  # £17,432
        tax = calculate_income_tax(taxable_income=75_000.0, bands=self.bands)
        assert tax == pytest.approx(expected, abs=1.0)

    def test_additional_rate_boundary(self):
        """At £125,140, PA is fully tapered to 0. All income is taxed."""
        # PA tapered to 0 at 125,140 (100k + 2*12,570)
        # basic_band = 50,270 - 12,570 = 37,700 (uses original PA for boundary)
        basic_tax = 37_700 * 0.20  # 7,540
        higher_tax = (125_140 - 50_270) * 0.40  # 29,948  (higher band from BRL to HRL)
        # remaining after basic+higher = 125,140 - 37,700 - 74,870 = 12,570 at additional rate
        additional_tax = 12_570 * 0.45  # 5,656.50
        expected = basic_tax + higher_tax + additional_tax
        tax = calculate_income_tax(taxable_income=125_140.0, bands=self.bands)
        assert tax == pytest.approx(expected, abs=1.0)

    def test_additional_rate_example(self):
        """£200,000: PA is 0 (tapered), all income taxed."""
        # PA tapered to 0 (200k > 125,140)
        basic_tax = 37_700 * 0.20  # 7,540
        higher_tax = 74_870 * 0.40  # 29,948 (50,270 to 125,140)
        additional_tax = (200_000 - 37_700 - 74_870) * 0.45  # remaining at 45%
        expected = basic_tax + higher_tax + additional_tax
        tax = calculate_income_tax(taxable_income=200_000.0, bands=self.bands)
        assert tax == pytest.approx(expected, abs=1.0)

    def test_personal_allowance_tapering_at_110k(self):
        """At £110k, PA reduced by (110k-100k)/2 = £5,000 to £7,570."""
        tax = calculate_income_tax(taxable_income=110_000.0, bands=self.bands)
        # effective_pa = 12,570 - 5,000 = 7,570
        # allowance portion: 7,570
        # remaining: 110,000 - 7,570 = 102,430
        # basic band: 37,700 -> tax = 7,540
        # remaining: 102,430 - 37,700 = 64,730
        # higher band: 74,870 -> min(64,730, 74,870) = 64,730 -> tax = 25,892
        expected = 37_700 * 0.20 + 64_730 * 0.40
        assert tax == pytest.approx(expected, abs=1.0)

    def test_personal_allowance_tapering_marginal_rate(self):
        """Effective marginal rate between 100k and 125,140 should be ~60%."""
        tax_100k = calculate_income_tax(taxable_income=100_000.0, bands=self.bands)
        tax_110k = calculate_income_tax(taxable_income=110_000.0, bands=self.bands)
        marginal = (tax_110k - tax_100k) / 10_000.0
        # Should be ~60% (40% higher rate + 20% from losing PA at 50p/£1)
        assert marginal == pytest.approx(0.60, abs=0.01)

    def test_no_tapering_below_100k(self):
        """Below 100k, PA should not be tapered."""
        tax = calculate_income_tax(taxable_income=99_999.0, bands=self.bands)
        # Full PA applies
        expected = (50_270 - 12_570) * 0.20 + (99_999 - 50_270) * 0.40
        assert tax == pytest.approx(expected, abs=1.0)

    def test_custom_bands(self):
        """Tax with non-default bands."""
        custom_bands = IncomeTaxBands(
            personal_allowance=10_000.0,
            basic_rate_limit=40_000.0,
            higher_rate_limit=100_000.0,
            basic_rate=0.25,
            higher_rate=0.50,
            additional_rate=0.55,
        )
        # £60,000: (40000-10000)*0.25 + (60000-40000)*0.50
        expected = 30_000 * 0.25 + 20_000 * 0.50
        tax = calculate_income_tax(taxable_income=60_000.0, bands=custom_bands)
        assert tax == pytest.approx(expected, abs=1.0)


# ────────────────────────────── National Insurance ──────────────────────────────


class TestNationalInsurance:
    """Test NI Class 1 calculations."""

    bands = NationalInsuranceBands()

    def test_zero_income(self):
        assert calculate_ni_class1(gross_annual=0.0, bands=self.bands) == 0.0

    def test_below_threshold(self):
        """Income at or below £12,570 pays no NI."""
        assert calculate_ni_class1(gross_annual=12_000.0, bands=self.bands) == 0.0
        assert calculate_ni_class1(gross_annual=12_570.0, bands=self.bands) == 0.0

    def test_main_rate_only(self):
        """£30,000: (30000 - 12570) * 0.08 = £1,394.40."""
        ni = calculate_ni_class1(gross_annual=30_000.0, bands=self.bands)
        expected = (30_000 - 12_570) * 0.08
        assert ni == pytest.approx(expected, abs=1.0)

    def test_upper_earnings_boundary(self):
        """£50,270: (50270 - 12570) * 0.08 = £3,016."""
        ni = calculate_ni_class1(gross_annual=50_270.0, bands=self.bands)
        expected = (50_270 - 12_570) * 0.08
        assert ni == pytest.approx(expected, abs=1.0)

    def test_above_upper_earnings(self):
        """£75,000: main + upper rate on excess."""
        main = (50_270 - 12_570) * 0.08
        upper = (75_000 - 50_270) * 0.02
        ni = calculate_ni_class1(gross_annual=75_000.0, bands=self.bands)
        assert ni == pytest.approx(main + upper, abs=1.0)


# ────────────────────────────── Pension Relief ──────────────────────────────


class TestPensionRelief:
    def test_positive_contribution_reduces_taxable_income(self):
        assert apply_pension_contribution_relief(employee_contribution=5_000.0) == 5_000.0

    def test_zero_contribution(self):
        assert apply_pension_contribution_relief(employee_contribution=0.0) == 0.0

    def test_negative_contribution_clamped(self):
        assert apply_pension_contribution_relief(employee_contribution=-100.0) == 0.0

    def test_tax_free_lump_sum(self):
        """25% of pension pot can be taken tax-free."""
        assert pension_tax_free_lump_sum(pension_pot_value=100_000.0) == 25_000.0

    def test_tax_free_lump_sum_zero(self):
        assert pension_tax_free_lump_sum(pension_pot_value=0.0) == 0.0

    def test_tax_free_lump_sum_negative(self):
        assert pension_tax_free_lump_sum(pension_pot_value=-10_000.0) == 0.0


# ────────────────────────────── Tax Calculator ──────────────────────────────


class TestTaxCalculator:
    """Test the full TaxCalculator which combines income tax, NI, and pension relief."""

    calc = TaxCalculator()

    def test_salary_with_no_pension(self):
        """£50,000 salary, no pension contribution."""
        result = self.calc.calculate_for_salary(
            gross_salary=50_000.0,
            employee_pension_contribution=0.0,
        )
        assert isinstance(result, TaxBreakdown)
        assert result.taxable_income == 50_000.0
        # Income tax on £50,000
        expected_tax = (50_000 - 12_570) * 0.20
        assert result.income_tax == pytest.approx(expected_tax, abs=1.0)
        # NI on £50,000
        expected_ni = (50_000 - 12_570) * 0.08
        assert result.national_insurance == pytest.approx(expected_ni, abs=1.0)
        assert result.total_tax == pytest.approx(expected_tax + expected_ni, abs=1.0)

    def test_salary_with_pension_reduces_tax(self):
        """Pension contributions reduce taxable income for income tax but not NI."""
        result_no_pension = self.calc.calculate_for_salary(
            gross_salary=50_000.0,
            employee_pension_contribution=0.0,
        )
        result_with_pension = self.calc.calculate_for_salary(
            gross_salary=50_000.0,
            employee_pension_contribution=5_000.0,
        )
        # Taxable income should be lower with pension
        assert result_with_pension.taxable_income == 45_000.0
        assert result_with_pension.income_tax < result_no_pension.income_tax
        # NI is based on gross salary, not affected by pension contributions
        assert result_with_pension.national_insurance == result_no_pension.national_insurance

    def test_marginal_tax_on_rental_income(self):
        """Additional income is taxed at marginal rate."""
        # Person earning £40,000 base with £10,000 rental income
        marginal_tax = self.calc.calculate_income_tax_on_additional_income(
            base_taxable_income=40_000.0,
            additional_income=10_000.0,
        )
        # Still in basic band, so marginal rate is 20%
        assert marginal_tax == pytest.approx(2_000.0, abs=1.0)

    def test_marginal_tax_crossing_higher_band(self):
        """Rental income that pushes into higher band."""
        marginal_tax = self.calc.calculate_income_tax_on_additional_income(
            base_taxable_income=45_000.0,
            additional_income=10_000.0,
        )
        # 45k to 50270 at 20%, 50270 to 55000 at 40%
        basic_portion = (50_270 - 45_000) * 0.20
        higher_portion = (55_000 - 50_270) * 0.40
        assert marginal_tax == pytest.approx(basic_portion + higher_portion, abs=1.0)

    def test_marginal_tax_zero_additional(self):
        assert self.calc.calculate_income_tax_on_additional_income(
            base_taxable_income=40_000.0,
            additional_income=0.0,
        ) == 0.0


# ────────────────────────────── Pension Drawdown ──────────────────────────────


class TestPensionDrawdown:
    """Test pension drawdown calculations."""

    def test_zero_target(self):
        result = calculate_pension_drawdown(
            target_net_income=0.0,
            other_taxable_income=0.0,
            pension_balance=100_000.0,
        )
        assert result.gross_withdrawal == 0.0
        assert result.net_income == 0.0

    def test_zero_balance(self):
        result = calculate_pension_drawdown(
            target_net_income=10_000.0,
            other_taxable_income=0.0,
            pension_balance=0.0,
        )
        assert result.gross_withdrawal == 0.0
        assert result.net_income == 0.0

    def test_tax_free_portion(self):
        """25% of gross withdrawal should be tax-free (PCLS)."""
        result = calculate_pension_drawdown(
            target_net_income=10_000.0,
            other_taxable_income=0.0,
            pension_balance=500_000.0,
        )
        assert result.tax_free_amount == pytest.approx(result.gross_withdrawal * 0.25, abs=1.0)
        assert result.taxable_amount == pytest.approx(result.gross_withdrawal * 0.75, abs=1.0)

    def test_net_income_approximately_meets_target(self):
        """The drawdown should approximately deliver the target net income."""
        target = 20_000.0
        result = calculate_pension_drawdown(
            target_net_income=target,
            other_taxable_income=0.0,
            pension_balance=500_000.0,
        )
        assert result.net_income == pytest.approx(target, rel=0.02)

    def test_net_income_with_other_income(self):
        """With existing taxable income, pension draws more to offset higher marginal tax."""
        result_no_other = calculate_pension_drawdown(
            target_net_income=20_000.0,
            other_taxable_income=0.0,
            pension_balance=500_000.0,
        )
        result_with_other = calculate_pension_drawdown(
            target_net_income=20_000.0,
            other_taxable_income=30_000.0,
            pension_balance=500_000.0,
        )
        # With other income filling up the allowance/basic band, pension needs to draw more gross
        assert result_with_other.gross_withdrawal >= result_no_other.gross_withdrawal
        assert result_with_other.tax_paid >= result_no_other.tax_paid

    def test_constrained_by_balance(self):
        """When pension balance is insufficient, cap at balance."""
        result = calculate_pension_drawdown(
            target_net_income=1_000_000.0,
            other_taxable_income=0.0,
            pension_balance=50_000.0,
        )
        assert result.gross_withdrawal <= 50_000.0
        assert result.net_income <= 50_000.0


# ────────────────────────────── Withdrawals ──────────────────────────────


class TestTaxFreeWithdrawal:
    def test_normal_withdrawal(self):
        result = calculate_tax_free_withdrawal(requested=5_000.0, balance=10_000.0)
        assert result.gross_withdrawal == 5_000.0
        assert result.tax_paid == 0.0
        assert result.net_withdrawal == 5_000.0

    def test_withdrawal_exceeds_balance(self):
        result = calculate_tax_free_withdrawal(requested=15_000.0, balance=10_000.0)
        assert result.gross_withdrawal == 10_000.0
        assert result.net_withdrawal == 10_000.0

    def test_zero_requested(self):
        result = calculate_tax_free_withdrawal(requested=0.0, balance=10_000.0)
        assert result.gross_withdrawal == 0.0

    def test_zero_balance(self):
        result = calculate_tax_free_withdrawal(requested=5_000.0, balance=0.0)
        assert result.gross_withdrawal == 0.0


class TestGiaWithdrawal:
    """Test GIA withdrawal with CGT calculations."""

    def test_no_gains(self):
        """When cost basis equals balance, no CGT."""
        result = calculate_gia_withdrawal(
            requested=5_000.0,
            balance=10_000.0,
            cost_basis=10_000.0,
            cgt_allowance_remaining=3_000.0,
            cgt_rate=0.10,
        )
        assert result.gross_withdrawal == 5_000.0
        assert result.gains_realized == 0.0
        assert result.tax_paid == 0.0
        assert result.net_withdrawal == 5_000.0

    def test_gains_within_allowance(self):
        """When gains are within CGT allowance, no tax."""
        result = calculate_gia_withdrawal(
            requested=5_000.0,
            balance=20_000.0,
            cost_basis=10_000.0,  # 50% gain ratio
            cgt_allowance_remaining=3_000.0,
            cgt_rate=0.10,
        )
        # gains_realized = 5000 * (10000/20000) = 2500
        assert result.gains_realized == pytest.approx(2_500.0, abs=1.0)
        assert result.tax_paid == 0.0  # Within allowance

    def test_gains_exceed_allowance(self):
        """When gains exceed CGT allowance, tax is paid on excess."""
        result = calculate_gia_withdrawal(
            requested=10_000.0,
            balance=20_000.0,
            cost_basis=10_000.0,  # 50% gain ratio
            cgt_allowance_remaining=3_000.0,
            cgt_rate=0.10,
        )
        # gains = 10000 * 0.5 = 5000
        assert result.gains_realized == pytest.approx(5_000.0, abs=1.0)
        # taxable = 5000 - 3000 = 2000
        # tax = 2000 * 0.10 = 200
        assert result.tax_paid == pytest.approx(200.0, abs=1.0)
        assert result.cgt_allowance_used == pytest.approx(3_000.0, abs=1.0)
        assert result.cgt_allowance_remaining == pytest.approx(0.0, abs=1.0)

    def test_zero_balance(self):
        result = calculate_gia_withdrawal(
            requested=5_000.0,
            balance=0.0,
            cost_basis=0.0,
            cgt_allowance_remaining=3_000.0,
            cgt_rate=0.10,
        )
        assert result.gross_withdrawal == 0.0

    def test_withdrawal_exceeds_balance(self):
        result = calculate_gia_withdrawal(
            requested=25_000.0,
            balance=20_000.0,
            cost_basis=15_000.0,
            cgt_allowance_remaining=3_000.0,
            cgt_rate=0.10,
        )
        assert result.gross_withdrawal == 20_000.0
