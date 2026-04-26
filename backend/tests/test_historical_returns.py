"""Tests for the historical returns loader and bootstrap return generation."""
from __future__ import annotations

import numpy as np
import pytest


class TestHistoricalReturnsLoader:
    def test_loads_returns_array(self):
        from backend.simulation.historical_returns import get_historical_returns

        returns = get_historical_returns()
        assert isinstance(returns, np.ndarray)
        assert returns.dtype == np.float64
        assert len(returns) >= 90  # at least 90 years of data

    def test_loads_years_array(self):
        from backend.simulation.historical_returns import get_historical_years

        years = get_historical_years()
        assert isinstance(years, np.ndarray)
        assert years.dtype == np.int32
        assert int(np.min(years)) == 1928

    def test_years_and_returns_same_length(self):
        from backend.simulation.historical_returns import get_historical_returns, get_historical_years

        years = get_historical_years()
        returns = get_historical_returns()
        assert len(years) == len(returns)

    def test_returns_in_reasonable_range(self):
        from backend.simulation.historical_returns import get_historical_returns

        returns = get_historical_returns()
        # All returns should be between -50% and +50%
        assert np.all(returns >= -0.50)
        assert np.all(returns <= 0.50)

    def test_stats(self):
        from backend.simulation.historical_returns import get_historical_stats

        stats = get_historical_stats()
        assert "count" in stats
        assert "mean" in stats
        assert "std" in stats
        assert "min" in stats
        assert "max" in stats
        assert "min_year" in stats
        assert "max_year" in stats
        assert "first_year" in stats
        assert "last_year" in stats

        assert stats["count"] >= 90
        assert stats["first_year"] == 1928
        # Mean historical S&P 500 return is roughly 8-12%
        assert 0.05 < stats["mean"] < 0.15
        # Std should be roughly 15-25%
        assert 0.10 < stats["std"] < 0.30

    def test_known_values(self):
        """Verify a few known historical returns are parsed correctly."""
        from backend.simulation.historical_returns import get_historical_returns, get_historical_years

        years = get_historical_years()
        returns = get_historical_returns()

        # 2008 crash: -38.49%
        idx_2008 = np.where(years == 2008)[0]
        assert len(idx_2008) == 1
        assert abs(returns[idx_2008[0]] - (-0.3849)) < 0.001

        # 1933 boom: +46.59%
        idx_1933 = np.where(years == 1933)[0]
        assert len(idx_1933) == 1
        assert abs(returns[idx_1933[0]] - 0.4659) < 0.001


class TestBootstrapReturnGeneration:
    def _make_scenario(self, return_model: str = "historical_bootstrap"):
        from backend.simulation.engine import SimulationAssumptions, SimulationScenario
        from backend.simulation.entities import PensionPot, PersonEntity
        from backend.simulation.entities.asset import AssetAccount

        assumptions = SimulationAssumptions(return_model=return_model)

        person = PersonEntity(
            key="alice",
            birth_date=__import__("datetime").date(1990, 1, 1),
            planned_retirement_age=65,
            state_pension_age=67,
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

        pension = PensionPot(
            balance=100_000.0,
            growth_rate_mean=0.05,
            growth_rate_std=0.10,
        )

        return SimulationScenario(
            start_year=2024,
            end_year=2034,
            people=[person],
            salary_by_person={},
            pension_by_person={"alice": pension},
            assets=[isa, cash],
            properties=[],
            expenses=[],
            assumptions=assumptions,
        )

    def test_bootstrap_returns_shape(self):
        from backend.simulation.returns_cache import generate_returns_matrix

        scenario = self._make_scenario("historical_bootstrap")
        matrix = generate_returns_matrix(scenario=scenario, iterations=100, seed=42)

        # 2 assets (ISA + Cash), 11 years (2024-2034 inclusive)
        assert matrix.asset_returns.shape == (100, 11, 2)
        # 1 pension
        assert matrix.pension_returns.shape == (100, 11, 1)

    def test_bootstrap_cash_always_zero(self):
        from backend.simulation.returns_cache import generate_returns_matrix

        scenario = self._make_scenario("historical_bootstrap")
        matrix = generate_returns_matrix(scenario=scenario, iterations=100, seed=42)

        # Cash is index 1 (ISA=0, Cash=1 based on scenario order)
        cash_idx = next(i for i, name in enumerate(matrix.asset_names) if name == "Cash")
        assert np.all(matrix.asset_returns[:, :, cash_idx] == 0.0)

    def test_bootstrap_equity_correlated_with_pension(self):
        from backend.simulation.returns_cache import generate_returns_matrix

        scenario = self._make_scenario("historical_bootstrap")
        matrix = generate_returns_matrix(scenario=scenario, iterations=100, seed=42)

        # ISA returns should equal pension returns (same shared market return)
        isa_idx = next(i for i, name in enumerate(matrix.asset_names) if name == "ISA")
        np.testing.assert_array_equal(
            matrix.asset_returns[:, :, isa_idx],
            matrix.pension_returns[:, :, 0],
        )

    def test_bootstrap_returns_from_historical_data(self):
        from backend.simulation.historical_returns import get_historical_returns
        from backend.simulation.returns_cache import generate_returns_matrix

        scenario = self._make_scenario("historical_bootstrap")
        matrix = generate_returns_matrix(scenario=scenario, iterations=500, seed=42)

        historical = set(get_historical_returns().tolist())
        isa_idx = next(i for i, name in enumerate(matrix.asset_names) if name == "ISA")

        # Every sampled return should be one of the historical values
        for ret in matrix.asset_returns[:, :, isa_idx].flat:
            assert ret in historical, f"Return {ret} not in historical data"

    def test_parametric_still_works(self):
        from backend.simulation.returns_cache import generate_returns_matrix

        scenario = self._make_scenario("parametric")
        matrix = generate_returns_matrix(scenario=scenario, iterations=100, seed=42)

        # Should still produce returns with the configured mean/std
        isa_idx = next(i for i, name in enumerate(matrix.asset_names) if name == "ISA")
        isa_returns = matrix.asset_returns[:, :, isa_idx].flatten()

        # With mean=0.05, std=0.10 over 1100 samples, mean should be close
        assert abs(np.mean(isa_returns) - 0.05) < 0.02

    def test_bootstrap_different_seeds_give_different_results(self):
        from backend.simulation.returns_cache import generate_returns_matrix

        scenario = self._make_scenario("historical_bootstrap")
        m1 = generate_returns_matrix(scenario=scenario, iterations=50, seed=1)
        m2 = generate_returns_matrix(scenario=scenario, iterations=50, seed=2)

        # Different seeds should produce different return sequences
        assert not np.array_equal(m1.asset_returns, m2.asset_returns)
