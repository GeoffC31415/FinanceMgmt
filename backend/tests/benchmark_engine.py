#!/usr/bin/env python3
"""
Benchmark script for the Numba simulation engine.

Usage:
    python -m backend.tests.benchmark_engine
    python -m backend.tests.benchmark_engine --iterations 1000 --warmup 2
"""
from __future__ import annotations

import argparse
import time
from datetime import date
from typing import Callable

import numpy as np

from backend.simulation.engine import (
    SimulationAssumptions,
    SimulationRunMatrices,
    SimulationScenario,
)
from backend.simulation.engine_fast import run_simulation
from backend.simulation.entities import (
    ExpenseItem,
    GiftIncome,
    PensionPot,
    PersonEntity,
    RentalIncome,
    SalaryIncome,
)
from backend.simulation.entities.asset import AssetAccount
from backend.simulation.entities.property import PropertyEntity
from backend.simulation.returns_cache import generate_returns_matrix


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

    expenses = [
        ExpenseItem(
            name=f"Expense{i+1}",
            annual_amount=6_000.0 + i * 2_000.0,
            is_inflation_linked=True,
        )
        for i in range(n_expenses)
    ]

    rental_incomes = [
        RentalIncome(gross_annual=12_000.0, annual_growth_rate=0.02)
    ]

    gift_incomes = [
        GiftIncome(gross_annual=5_000.0, annual_growth_rate=0.0, start_year=2025, end_year=2030)
    ]

    properties = [
        PropertyEntity(
            name="Benchmark Property",
            person_key="person1",
            withdrawal_priority=15,
            value=300_000.0,
            appreciation_rate_mean=0.03,
            appreciation_rate_std=0.08,
            monthly_rental_income=1_500.0,
            rental_growth_rate=0.02,
            occupancy_rate=0.95,
            annual_maintenance_cost=2_000.0,
            mortgage_ltv=0.75,
            mortgage_rate=0.04,
            mortgage_term_years=25,
            cost_basis=300_000.0,
        )
    ]

    return SimulationScenario(
        start_year=start_year,
        end_year=end_year,
        people=people,
        salary_by_person=salary_by_person,
        pension_by_person=pension_by_person,
        assets=assets,
        properties=properties,
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
    """Run benchmarks for the Numba engine."""
    print("=" * 50)
    print("SIMULATION ENGINE BENCHMARK")
    print("=" * 50)
    print(f"Scenario: {n_years} years, 2 people, 5 assets, 4 expenses")
    print(f"Warmup runs: {warmup_runs}, Timing runs: {timing_runs}")
    print("=" * 50)
    print()

    scenario = create_benchmark_scenario(n_years=n_years)

    print(f"{'Iterations':>12} │ {'Time':>12}")
    print("─" * 12 + "─┼─" + "─" * 12)

    for iterations in iterations_list:
        returns = generate_returns_matrix(
            scenario=scenario,
            iterations=iterations,
            seed=42,
        )

        # Warmup (includes JIT compilation on first run)
        for _ in range(warmup_runs + 1):
            run_simulation(scenario=scenario, returns=returns)

        # Time
        _, mean_time, _ = time_function(
            lambda: run_simulation(scenario=scenario, returns=returns),
            n_runs=timing_runs,
        )

        print(f"{iterations:>12,} │ {format_time(mean_time):>12}")

    print()
    print("=" * 50)


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark simulation engine")
    parser.add_argument(
        "--iterations", type=str, default="50,100,200,500,1000",
        help="Comma-separated list of iteration counts to benchmark",
    )
    parser.add_argument("--years", type=int, default=40, help="Number of simulation years")
    parser.add_argument("--warmup", type=int, default=1, help="Number of warmup runs")
    parser.add_argument("--timing-runs", type=int, default=3, help="Number of timing runs")

    args = parser.parse_args()
    iterations_list = [int(x.strip()) for x in args.iterations.split(",")]

    run_benchmark(
        iterations_list=iterations_list,
        n_years=args.years,
        warmup_runs=args.warmup,
        timing_runs=args.timing_runs,
    )


if __name__ == "__main__":
    main()
