"""
Test that the Numba-accelerated simulation engine produces equivalent results
to the pure Python implementation.
"""
from datetime import date

import numpy as np
import pytest

from backend.simulation.engine import (
    SimulationAssumptions,
    SimulationScenario,
    run_with_cached_returns,
)
from backend.simulation.engine_fast import (
    FastEngineConfig,
    _HAS_NUMBA,
    run_with_cached_returns_fast,
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
        cost_basis=20_000.0,  # Has unrealized gains
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


@pytest.mark.skipif(not _HAS_NUMBA, reason="Numba not installed")
class TestEngineEquivalence:
    """Test that Python and Numba engines produce equivalent results."""

    def test_simple_scenario_equivalence(self):
        """Test equivalence on a simple scenario."""
        scenario = _make_simple_scenario()
        iterations = 50
        seed = 42

        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=iterations,
            seed=seed,
        )

        # Run Python engine
        python_result = run_with_cached_returns(scenario=scenario, returns=returns)

        # Run Numba engine (force enable)
        numba_result = run_with_cached_returns_fast(
            scenario=scenario,
            returns=returns,
            config=FastEngineConfig(enable_numba=True),
        )

        # Compare years
        assert python_result.years == numba_result.years

        # Compare all fields
        for field_name in python_result.fields.keys():
            python_vals = python_result.fields[field_name]
            numba_vals = numba_result.fields.get(field_name)
            
            assert numba_vals is not None, f"Missing field: {field_name}"
            
            # Allow small numerical tolerance
            np.testing.assert_allclose(
                python_vals,
                numba_vals,
                rtol=1e-4,
                atol=1.0,  # Allow £1 absolute difference
                err_msg=f"Mismatch in field: {field_name}",
            )

    def test_full_scenario_equivalence(self):
        """Test equivalence on a full scenario with all features."""
        scenario = _make_test_scenario()
        iterations = 100
        seed = 123

        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=iterations,
            seed=seed,
        )

        # Run Python engine
        python_result = run_with_cached_returns(scenario=scenario, returns=returns)

        # Run Numba engine
        numba_result = run_with_cached_returns_fast(
            scenario=scenario,
            returns=returns,
            config=FastEngineConfig(enable_numba=True),
        )

        # Compare years
        assert python_result.years == numba_result.years

        # Compare key financial metrics with tolerance
        key_fields = [
            "net_worth",
            "salary_gross",
            "salary_net",
            "pension_balance",
            "isa_balance",
            "cash_balance",
            "total_assets",
            "mortgage_balance",
            "total_expenses",
        ]

        for field_name in key_fields:
            python_vals = python_result.fields[field_name]
            numba_vals = numba_result.fields.get(field_name)
            
            assert numba_vals is not None, f"Missing field: {field_name}"
            
            # Use relative tolerance for large values
            np.testing.assert_allclose(
                python_vals,
                numba_vals,
                rtol=0.01,  # 1% relative tolerance
                atol=10.0,  # £10 absolute tolerance
                err_msg=f"Mismatch in field: {field_name}",
            )

    def test_retirement_year_transition(self):
        """Test that retirement transitions are handled consistently."""
        # Create scenario where retirement happens mid-simulation
        scenario = _make_test_scenario(
            start_year=2038,  # person1 turns 58
            end_year=2045,    # person1 turns 65 (retired at 60)
            annual_spend_target=40_000.0,
        )
        iterations = 30
        seed = 456

        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=iterations,
            seed=seed,
        )

        python_result = run_with_cached_returns(scenario=scenario, returns=returns)
        numba_result = run_with_cached_returns_fast(
            scenario=scenario,
            returns=returns,
            config=FastEngineConfig(enable_numba=True),
        )

        # Salary should drop to zero after retirement
        python_salary = python_result.fields["salary_gross"]
        numba_salary = numba_result.fields["salary_gross"]

        np.testing.assert_allclose(
            python_salary,
            numba_salary,
            rtol=0.01,
            atol=10.0,
            err_msg="Salary mismatch around retirement",
        )

    def test_deterministic_with_same_returns(self):
        """Test that both engines are deterministic with the same cached returns."""
        scenario = _make_simple_scenario()
        iterations = 20
        seed = 789

        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=iterations,
            seed=seed,
        )

        # Run Numba engine twice
        result1 = run_with_cached_returns_fast(
            scenario=scenario,
            returns=returns,
            config=FastEngineConfig(enable_numba=True),
        )
        result2 = run_with_cached_returns_fast(
            scenario=scenario,
            returns=returns,
            config=FastEngineConfig(enable_numba=True),
        )

        # Should be exactly equal
        for field_name in result1.fields.keys():
            np.testing.assert_array_equal(
                result1.fields[field_name],
                result2.fields[field_name],
                err_msg=f"Non-deterministic in field: {field_name}",
            )

    def test_fallback_when_disabled(self):
        """Test that disabling numba falls back to Python engine."""
        scenario = _make_simple_scenario()
        iterations = 10
        seed = 111

        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=iterations,
            seed=seed,
        )

        # Run with numba disabled
        disabled_result = run_with_cached_returns_fast(
            scenario=scenario,
            returns=returns,
            config=FastEngineConfig(enable_numba=False),
        )

        # Run Python directly
        python_result = run_with_cached_returns(scenario=scenario, returns=returns)

        # Should be exactly equal (same code path)
        for field_name in python_result.fields.keys():
            np.testing.assert_array_equal(
                python_result.fields[field_name],
                disabled_result.fields[field_name],
                err_msg=f"Fallback mismatch in field: {field_name}",
            )


class TestEnginePerformance:
    """Performance-related tests (not strict equivalence)."""

    @pytest.mark.skipif(not _HAS_NUMBA, reason="Numba not installed")
    def test_numba_compilation_succeeds(self):
        """Test that the Numba kernel compiles successfully."""
        scenario = _make_simple_scenario()
        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=10,
            seed=0,
        )

        # This should not raise
        result = run_with_cached_returns_fast(
            scenario=scenario,
            returns=returns,
            config=FastEngineConfig(enable_numba=True),
        )

        assert len(result.years) > 0
        assert "net_worth" in result.fields

    @pytest.mark.skipif(not _HAS_NUMBA, reason="Numba not installed")
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

        result = run_with_cached_returns_fast(
            scenario=scenario,
            returns=returns,
            config=FastEngineConfig(enable_numba=True),
        )

        # Check shape
        assert result.fields["net_worth"].shape == (iterations, len(result.years))


class TestTaxCalculations:
    """Test tax calculation equivalence."""

    @pytest.mark.skipif(not _HAS_NUMBA, reason="Numba not installed")
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
            numba_tax = fast_income_tax(float(income))
            
            np.testing.assert_allclose(
                python_tax,
                numba_tax,
                rtol=1e-6,
                atol=0.01,
                err_msg=f"Tax mismatch for income {income}",
            )
