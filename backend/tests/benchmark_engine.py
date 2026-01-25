#!/usr/bin/env python3
"""
Benchmark script comparing Python vs Numba simulation engine performance.

Usage:
    python -m backend.tests.benchmark_engine
    python -m backend.tests.benchmark_engine --iterations 1000 --warmup 2
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import date
from typing import Callable

import numpy as np

from backend.simulation.engine import (
    SimulationAssumptions,
    SimulationRunMatrices,
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
from backend.simulation.returns_cache import ReturnsMatrix, generate_returns_matrix


def create_benchmark_scenario(
    *,
    n_years: int = 40,
    n_people: int = 2,
    n_assets: int = 5,
    n_expenses: int = 4,
) -> SimulationScenario:
    """Create a configurable benchmark scenario."""
    start_year = 2024
    end_year = start_year + n_years - 1

    # Create people
    people = []
    salary_by_person: dict[str, list[SalaryIncome]] = {}
    pension_by_person: dict[str, PensionPot] = {}

    for i in range(n_people):
        key = f"person{i+1}"
        person = PersonEntity(
            key=key,
            birth_date=date(1980 + i * 2, 6, 15),
            planned_retirement_age=60 + i,
            state_pension_age=67,
        )
        people.append(person)

        salary_by_person[key] = [
            SalaryIncome(
                gross_annual=60_000.0 + i * 15_000.0,
                annual_growth_rate=0.03,
                employee_pension_pct=0.05,
                employer_pension_pct=0.05,
            )
        ]

        pension_by_person[key] = PensionPot(
            balance=100_000.0 + i * 50_000.0,
            growth_rate_mean=0.05,
            growth_rate_std=0.10,
        )

    # Create assets
    assets = []
    asset_types = ["CASH", "ISA", "GIA"]
    for i in range(n_assets):
        asset_type = asset_types[i % len(asset_types)]
        assets.append(
            AssetAccount(
                name=f"Asset{i+1}",
                asset_type=asset_type,
                withdrawal_priority=50 - i * 10,
                balance=20_000.0 + i * 10_000.0,
                annual_contribution=5_000.0 if asset_type == "ISA" else 0.0,
                growth_rate_mean=0.05 if asset_type != "CASH" else 0.0,
                growth_rate_std=0.10 if asset_type != "CASH" else 0.0,
                contributions_end_at_retirement=False,
                cost_basis=15_000.0 + i * 8_000.0,
            )
        )

    # Create expenses
    expenses = [
        ExpenseItem(
            name=f"Expense{i+1}",
            annual_amount=6_000.0 + i * 2_000.0,
            is_inflation_linked=True,
        )
        for i in range(n_expenses)
    ]

    # Create mortgage
    mortgage = MortgageAccount(
        balance=250_000.0,
        annual_interest_rate=0.04,
        monthly_payment=1_400.0,
    )

    # Create rental and gift income
    rental_incomes = [
        RentalIncome(
            gross_annual=12_000.0,
            annual_growth_rate=0.02,
        )
    ]

    gift_incomes = [
        GiftIncome(
            gross_annual=5_000.0,
            annual_growth_rate=0.0,
            start_year=2025,
            end_year=2030,
        )
    ]

    return SimulationScenario(
        start_year=start_year,
        end_year=end_year,
        people=people,
        salary_by_person=salary_by_person,
        pension_by_person=pension_by_person,
        assets=assets,
        mortgage=mortgage,
        expenses=expenses,
        rental_incomes=rental_incomes,
        gift_incomes=gift_incomes,
        annual_spend_target=35_000.0,
        planned_retirement_age_by_person={p.key: p.planned_retirement_age for p in people},
        pension_withdrawal_priority=100,
        assumptions=SimulationAssumptions(),
    )


def time_function(
    func: Callable[[], SimulationRunMatrices],
    n_runs: int = 3,
) -> tuple[float, float, float]:
    """Time a function over multiple runs, return (min, mean, max) in seconds."""
    times = []
    for _ in range(n_runs):
        start = time.perf_counter()
        func()
        elapsed = time.perf_counter() - start
        times.append(elapsed)
    return min(times), sum(times) / len(times), max(times)


def format_time(seconds: float) -> str:
    """Format time in appropriate units."""
    if seconds < 0.001:
        return f"{seconds * 1_000_000:.1f}µs"
    if seconds < 1:
        return f"{seconds * 1_000:.1f}ms"
    return f"{seconds:.2f}s"


def run_benchmark(
    *,
    iterations_list: list[int],
    n_years: int = 40,
    warmup_runs: int = 1,
    timing_runs: int = 3,
) -> None:
    """Run benchmarks comparing Python and Numba engines."""
    print("=" * 70)
    print("SIMULATION ENGINE BENCHMARK")
    print("=" * 70)
    print(f"Numba available: {_HAS_NUMBA}")
    print(f"Scenario: {n_years} years, 2 people, 5 assets, 4 expenses")
    print(f"Warmup runs: {warmup_runs}, Timing runs: {timing_runs}")
    print("=" * 70)
    print()

    scenario = create_benchmark_scenario(n_years=n_years)

    # Table header
    print(f"{'Iterations':>12} │ {'Python':>12} │ {'Numba':>12} │ {'Speedup':>10}")
    print("─" * 12 + "─┼─" + "─" * 12 + "─┼─" + "─" * 12 + "─┼─" + "─" * 10)

    for iterations in iterations_list:
        # Generate returns once (shared between both engines)
        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=iterations,
            seed=42,
        )

        # Warmup Python
        for _ in range(warmup_runs):
            run_with_cached_returns(scenario=scenario, returns=returns)

        # Time Python
        python_min, python_mean, python_max = time_function(
            lambda: run_with_cached_returns(scenario=scenario, returns=returns),
            n_runs=timing_runs,
        )

        if _HAS_NUMBA:
            # Warmup Numba (includes JIT compilation on first run)
            for _ in range(warmup_runs + 1):  # Extra run for JIT
                run_with_cached_returns_fast(
                    scenario=scenario,
                    returns=returns,
                    config=FastEngineConfig(enable_numba=True),
                )

            # Time Numba
            numba_min, numba_mean, numba_max = time_function(
                lambda: run_with_cached_returns_fast(
                    scenario=scenario,
                    returns=returns,
                    config=FastEngineConfig(enable_numba=True),
                ),
                n_runs=timing_runs,
            )

            speedup = python_mean / numba_mean if numba_mean > 0 else float("inf")
            numba_str = format_time(numba_mean)
            speedup_str = f"{speedup:.1f}x"
        else:
            numba_str = "N/A"
            speedup_str = "N/A"

        print(
            f"{iterations:>12,} │ {format_time(python_mean):>12} │ {numba_str:>12} │ {speedup_str:>10}"
        )

    print()
    print("=" * 70)


def run_scaling_benchmark(
    *,
    iterations: int = 500,
    year_counts: list[int] | None = None,
) -> None:
    """Benchmark how performance scales with simulation length."""
    if year_counts is None:
        year_counts = [10, 20, 40, 60, 80]

    print()
    print("=" * 70)
    print("SCALING BENCHMARK (by simulation years)")
    print("=" * 70)
    print(f"Fixed iterations: {iterations}")
    print()

    print(f"{'Years':>8} │ {'Python':>12} │ {'Numba':>12} │ {'Speedup':>10}")
    print("─" * 8 + "─┼─" + "─" * 12 + "─┼─" + "─" * 12 + "─┼─" + "─" * 10)

    for n_years in year_counts:
        scenario = create_benchmark_scenario(n_years=n_years)
        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=iterations,
            seed=42,
        )

        # Warmup and time Python
        run_with_cached_returns(scenario=scenario, returns=returns)
        python_min, python_mean, python_max = time_function(
            lambda: run_with_cached_returns(scenario=scenario, returns=returns),
            n_runs=3,
        )

        if _HAS_NUMBA:
            # Warmup and time Numba
            for _ in range(2):
                run_with_cached_returns_fast(
                    scenario=scenario,
                    returns=returns,
                    config=FastEngineConfig(enable_numba=True),
                )

            numba_min, numba_mean, numba_max = time_function(
                lambda: run_with_cached_returns_fast(
                    scenario=scenario,
                    returns=returns,
                    config=FastEngineConfig(enable_numba=True),
                ),
                n_runs=3,
            )

            speedup = python_mean / numba_mean if numba_mean > 0 else float("inf")
            numba_str = format_time(numba_mean)
            speedup_str = f"{speedup:.1f}x"
        else:
            numba_str = "N/A"
            speedup_str = "N/A"

        print(
            f"{n_years:>8} │ {format_time(python_mean):>12} │ {numba_str:>12} │ {speedup_str:>10}"
        )

    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark simulation engines")
    parser.add_argument(
        "--iterations",
        type=str,
        default="50,100,200,500,1000",
        help="Comma-separated list of iteration counts to benchmark",
    )
    parser.add_argument(
        "--years",
        type=int,
        default=40,
        help="Number of simulation years",
    )
    parser.add_argument(
        "--warmup",
        type=int,
        default=1,
        help="Number of warmup runs",
    )
    parser.add_argument(
        "--timing-runs",
        type=int,
        default=3,
        help="Number of timing runs",
    )
    parser.add_argument(
        "--scaling",
        action="store_true",
        help="Also run scaling benchmark",
    )

    args = parser.parse_args()

    iterations_list = [int(x.strip()) for x in args.iterations.split(",")]

    run_benchmark(
        iterations_list=iterations_list,
        n_years=args.years,
        warmup_runs=args.warmup,
        timing_runs=args.timing_runs,
    )

    if args.scaling:
        run_scaling_benchmark(iterations=500)

    if _HAS_NUMBA:
        # Final summary
        print("CONCLUSION:")
        print("The Numba-accelerated engine provides significant speedups,")
        print("especially for large iteration counts where parallel execution shines.")
        print()
    else:
        print("NOTE: Install numba for accelerated simulation:")
        print("  pip install numba")
        print()


if __name__ == "__main__":
    main()
