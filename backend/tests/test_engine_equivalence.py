"""
Tests for the Numba-accelerated simulation engine.
"""
from datetime import date

import numpy as np
import pytest

from backend.simulation.engine import (
    SimulationAssumptions,
    SimulationScenario,
)
from backend.simulation.engine_fast import (
    run_simulation,
)
from backend.simulation.entities import (
    ExpenseItem,
    GiftIncome,
    MortgageAccount,
    PensionPot,
    PersonEntity,
    RentalIncome,
    SalaryIncome,
)
from backend.simulation.entities.asset import AssetAccount
from backend.simulation.returns_cache import generate_returns_matrix


def _make_test_scenario(
    *,
    start_year: int = 2024,
    end_year: int = 2034,
    annual_spend_target: float = 30_000.0,
) -> SimulationScenario:
    """Create a representative test scenario with diverse financial elements."""
    person1 = PersonEntity(
        key="person1",
        birth_date=date(1980, 6, 15),
        planned_retirement_age=60,
        state_pension_age=67,
    )
    person2 = PersonEntity(
        key="person2",
        birth_date=date(1982, 3, 20),
        planned_retirement_age=62,
        state_pension_age=67,
    )

    salary1 = SalaryIncome(
        gross_annual=75_000.0,
        annual_growth_rate=0.03,
        employee_pension_pct=0.05,
        employer_pension_pct=0.05,
        start_year=None,
        end_year=None,
    )
    salary2 = SalaryIncome(
        gross_annual=55_000.0,
        annual_growth_rate=0.02,
        employee_pension_pct=0.04,
        employer_pension_pct=0.04,
        start_year=None,
        end_year=None,
    )

    pension1 = PensionPot(
        balance=150_000.0,
        growth_rate_mean=0.05,
        growth_rate_std=0.10,
    )
    pension2 = PensionPot(
        balance=80_000.0,
        growth_rate_mean=0.05,
        growth_rate_std=0.10,
    )

    isa = AssetAccount(
        name="ISA",
        asset_type="ISA",
        withdrawal_priority=50,
        balance=50_000.0,
        annual_contribution=20_000.0,
        growth_rate_mean=0.05,
        growth_rate_std=0.10,
        contributions_end_at_retirement=False,
        cost_basis=50_000.0,
    )
    gia = AssetAccount(
        name="GIA",
        asset_type="GIA",
        withdrawal_priority=40,
        balance=30_000.0,
        annual_contribution=0.0,
        growth_rate_mean=0.05,
        growth_rate_std=0.10,
        contributions_end_at_retirement=False,
        cost_basis=20_000.0,
    )
    cash = AssetAccount(
        name="Cash",
        asset_type="CASH",
        withdrawal_priority=0,
        balance=10_000.0,
        annual_contribution=0.0,
        growth_rate_mean=0.0,
        growth_rate_std=0.0,
        contributions_end_at_retirement=False,
        cost_basis=10_000.0,
    )

    mortgage = MortgageAccount(
        balance=200_000.0,
        annual_interest_rate=0.04,
        monthly_payment=1_200.0,
    )

    expenses = [
        ExpenseItem(name="Living", annual_amount=24_000.0, is_inflation_linked=True),
        ExpenseItem(name="Insurance", annual_amount=2_400.0, is_inflation_linked=True),
    ]

    rental = RentalIncome(
        gross_annual=12_000.0,
        annual_growth_rate=0.02,
        start_year=None,
        end_year=None,
    )

    gift = GiftIncome(
        gross_annual=5_000.0,
        annual_growth_rate=0.0,
        start_year=2025,
        end_year=2027,
    )

    return SimulationScenario(
        start_year=start_year,
        end_year=end_year,
        people=[person1, person2],
        salary_by_person={"person1": [salary1], "person2": [salary2]},
        pension_by_person={"person1": pension1, "person2": pension2},
        assets=[isa, gia, cash],
        mortgage=mortgage,
        expenses=expenses,
        rental_incomes=[rental],
        gift_incomes=[gift],
        annual_spend_target=annual_spend_target,
        planned_retirement_age_by_person={"person1": 60, "person2": 62},
        pension_withdrawal_priority=100,
        assumptions=SimulationAssumptions(
            inflation_rate=0.02,
            isa_annual_limit=20_000.0,
            state_pension_annual=11_500.0,
            cgt_annual_allowance=3_000.0,
            cgt_rate=0.10,
            emergency_fund_months=6.0,
            pension_access_age=55,
        ),
    )


def _make_simple_scenario() -> SimulationScenario:
    """Create a minimal scenario for basic testing."""
    person = PersonEntity(
        key="person1",
        birth_date=date(1990, 1, 1),
        planned_retirement_age=65,
        state_pension_age=67,
    )

    salary = SalaryIncome(
        gross_annual=50_000.0,
        annual_growth_rate=0.02,
        employee_pension_pct=0.05,
        employer_pension_pct=0.03,
        start_year=None,
        end_year=None,
    )

    pension = PensionPot(
        balance=20_000.0,
        growth_rate_mean=0.05,
        growth_rate_std=0.08,
    )

    cash = AssetAccount(
        name="Cash",
        asset_type="CASH",
        withdrawal_priority=0,
        balance=5_000.0,
        annual_contribution=0.0,
        growth_rate_mean=0.0,
        growth_rate_std=0.0,
        contributions_end_at_retirement=False,
        cost_basis=5_000.0,
    )

    isa = AssetAccount(
        name="ISA",
        asset_type="ISA",
        withdrawal_priority=50,
        balance=10_000.0,
        annual_contribution=0.0,
        growth_rate_mean=0.05,
        growth_rate_std=0.08,
        contributions_end_at_retirement=False,
        cost_basis=10_000.0,
    )

    expenses = [
        ExpenseItem(name="Living", annual_amount=18_000.0, is_inflation_linked=True),
    ]

    return SimulationScenario(
        start_year=2024,
        end_year=2029,
        people=[person],
        salary_by_person={"person1": [salary]},
        pension_by_person={"person1": pension},
        assets=[cash, isa],
        mortgage=None,
        expenses=expenses,
        rental_incomes=[],
        gift_incomes=[],
        annual_spend_target=0.0,
        planned_retirement_age_by_person={"person1": 65},
        pension_withdrawal_priority=100,
        assumptions=SimulationAssumptions(),
    )


class TestEngine:
    """Test the Numba simulation engine."""

    def test_simple_scenario(self):
        """Test that a simple scenario runs and produces valid output."""
        scenario = _make_simple_scenario()
        iterations = 50
        seed = 42

        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=iterations,
            seed=seed,
        )

        result = run_simulation(scenario=scenario, returns=returns)

        assert len(result.years) == 6  # 2024-2029 inclusive
        assert "net_worth" in result.fields
        assert result.fields["net_worth"].shape == (iterations, 6)

    def test_full_scenario(self):
        """Test a full scenario with all features."""
        scenario = _make_test_scenario()
        iterations = 100
        seed = 123

        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=iterations,
            seed=seed,
        )

        result = run_simulation(scenario=scenario, returns=returns)

        assert len(result.years) == 11  # 2024-2034 inclusive
        key_fields = [
            "net_worth", "salary_gross", "salary_net",
            "pension_balance", "isa_balance", "cash_balance",
            "total_assets", "mortgage_balance", "total_expenses",
        ]
        for field_name in key_fields:
            assert field_name in result.fields, f"Missing field: {field_name}"
            assert result.fields[field_name].shape == (iterations, 11)

    def test_retirement_year_transition(self):
        """Test that retirement transitions are handled correctly."""
        scenario = _make_test_scenario(
            start_year=2038,
            end_year=2045,
            annual_spend_target=40_000.0,
        )
        iterations = 30
        seed = 456

        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=iterations,
            seed=seed,
        )

        result = run_simulation(scenario=scenario, returns=returns)
        salary = result.fields["salary_gross"]

        # Person1 retires at 60 (born 1980, so year 2040)
        # Person2 retires at 62 (born 1982, so year 2044)
        # After both retire, salary should be 0
        year_2045_idx = 2045 - 2038  # index 7
        assert np.all(salary[:, year_2045_idx] == 0.0), "Salary should be 0 after both retire"

    def test_deterministic_with_same_returns(self):
        """Test that the engine is deterministic with the same cached returns."""
        scenario = _make_simple_scenario()
        iterations = 20
        seed = 789

        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=iterations,
            seed=seed,
        )

        result1 = run_simulation(scenario=scenario, returns=returns)
        result2 = run_simulation(scenario=scenario, returns=returns)

        for field_name in result1.fields.keys():
            np.testing.assert_array_equal(
                result1.fields[field_name],
                result2.fields[field_name],
                err_msg=f"Non-deterministic in field: {field_name}",
            )

    def test_large_iteration_count(self):
        """Test that the engine handles large iteration counts."""
        scenario = _make_simple_scenario()
        iterations = 500
        seed = 999

        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=iterations,
            seed=seed,
        )

        result = run_simulation(scenario=scenario, returns=returns)
        assert result.fields["net_worth"].shape == (iterations, len(result.years))


class TestTaxCalculations:
    """Test tax calculation equivalence between Numba and Python implementations."""

    def test_tax_calculations_match(self):
        """Test that tax calculations match between implementations."""
        from backend.simulation.tax.income_tax import IncomeTaxBands, calculate_income_tax
        from backend.simulation.engine_fast import _calculate_income_tax as fast_income_tax

        bands = IncomeTaxBands()

        test_incomes = [
            0, 5_000, 12_570, 12_571, 25_000, 50_270, 50_271,
            75_000, 100_000, 125_140, 125_141, 200_000, 500_000,
        ]

        for income in test_incomes:
            python_tax = calculate_income_tax(taxable_income=float(income), bands=bands)
            numba_tax = fast_income_tax(
                float(income),
                bands.personal_allowance,
                bands.basic_rate_limit,
                bands.higher_rate_limit,
                bands.basic_rate,
                bands.higher_rate,
                bands.additional_rate,
            )

            np.testing.assert_allclose(
                python_tax,
                numba_tax,
                rtol=1e-6,
                atol=0.01,
                err_msg=f"Tax mismatch for income {income}",
            )

    def test_personal_allowance_tapering(self):
        """Test that PA tapering kicks in above 100k income."""
        from backend.simulation.tax.income_tax import IncomeTaxBands, calculate_income_tax
        from backend.simulation.engine_fast import _calculate_income_tax as fast_income_tax

        bands = IncomeTaxBands()

        # At 100k, full PA: tax on (100k - 12,570) = 87,430
        tax_100k = calculate_income_tax(taxable_income=100_000.0, bands=bands)

        # At 110k, PA reduced by (110k - 100k) / 2 = 5,000 -> PA = 7,570
        # Extra 5,000 at basic rate (20%) = 1,000 extra tax vs simple step
        tax_110k = calculate_income_tax(taxable_income=110_000.0, bands=bands)

        # At 125,140, PA = 0: all income taxed
        tax_125k = calculate_income_tax(taxable_income=125_140.0, bands=bands)

        # Verify marginal rate is effectively 60% in tapering range
        marginal_100_to_110 = (tax_110k - tax_100k) / 10_000.0
        assert marginal_100_to_110 > 0.55, f"Expected ~60% marginal rate, got {marginal_100_to_110:.1%}"
        assert marginal_100_to_110 < 0.65, f"Expected ~60% marginal rate, got {marginal_100_to_110:.1%}"

        # Numba should match
        numba_110k = fast_income_tax(
            110_000.0, bands.personal_allowance, bands.basic_rate_limit,
            bands.higher_rate_limit, bands.basic_rate, bands.higher_rate, bands.additional_rate,
        )
        np.testing.assert_allclose(tax_110k, numba_110k, rtol=1e-6, atol=0.01)


class TestFirstYearGrowth:
    """Test that the first-year growth bug is fixed."""

    def test_salary_uses_configured_value_in_year_one(self):
        """A salary of 50k with 2% growth should use 50k in year 1, not 51k."""
        person = PersonEntity(
            key="person1",
            birth_date=date(1990, 1, 1),
            planned_retirement_age=65,
            state_pension_age=67,
        )
        salary = SalaryIncome(
            gross_annual=50_000.0,
            annual_growth_rate=0.02,
            employee_pension_pct=0.0,
            employer_pension_pct=0.0,
        )
        pension = PensionPot(balance=0.0, growth_rate_mean=0.0, growth_rate_std=0.0)
        cash = AssetAccount(
            name="Cash", asset_type="CASH", withdrawal_priority=0,
            balance=100_000.0, annual_contribution=0.0,
            growth_rate_mean=0.0, growth_rate_std=0.0,
            contributions_end_at_retirement=False, cost_basis=100_000.0,
        )

        scenario = SimulationScenario(
            start_year=2024, end_year=2026,
            people=[person],
            salary_by_person={"person1": [salary]},
            pension_by_person={"person1": pension},
            assets=[cash],
            mortgage=None,
            expenses=[],
            assumptions=SimulationAssumptions(
                state_pension_annual=0.0,
                emergency_fund_months=0.0,
            ),
        )
        returns = generate_returns_matrix(scenario=scenario, iterations=1, seed=0)

        # Zero out returns so growth doesn't complicate things
        returns = type(returns)(
            years=returns.years,
            asset_names=returns.asset_names,
            asset_types=returns.asset_types,
            asset_withdrawal_priority=returns.asset_withdrawal_priority,
            initial_asset_balances=returns.initial_asset_balances,
            initial_asset_cost_bases=returns.initial_asset_cost_bases,
            asset_returns=np.zeros_like(returns.asset_returns),
            pension_keys=returns.pension_keys,
            initial_pension_balances=returns.initial_pension_balances,
            pension_returns=np.zeros_like(returns.pension_returns),
        )

        result = run_simulation(scenario=scenario, returns=returns)

        # Year 1 (2024): salary should be 50,000 (not 51,000)
        year1_salary = result.fields["salary_gross"][0, 0]
        assert abs(year1_salary - 50_000.0) < 1.0, f"Year 1 salary should be 50k, got {year1_salary:.0f}"

        # Year 2 (2025): salary should be 51,000 (50k * 1.02)
        year2_salary = result.fields["salary_gross"][0, 1]
        assert abs(year2_salary - 51_000.0) < 1.0, f"Year 2 salary should be 51k, got {year2_salary:.0f}"
