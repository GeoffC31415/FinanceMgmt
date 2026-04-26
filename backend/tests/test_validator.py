"""Tests for the simulation scenario validator."""

from dataclasses import replace
from datetime import date

import pytest

from backend.simulation.engine import SimulationAssumptions, SimulationScenario
from backend.simulation.entities import PensionPot, SalaryIncome
from backend.simulation.validator import validate_scenario


def _make_person(key="Alice", birth_date=date(1990, 1, 15),
                 planned_retirement_age=67, state_pension_age=67,
                 is_child=False):
    """Create a mock PersonEntity."""
    return type("PersonEntity", (), {
        "key": key,
        "birth_date": birth_date,
        "planned_retirement_age": planned_retirement_age,
        "state_pension_age": state_pension_age,
        "is_child": is_child,
        "annual_cost": 0.0,
        "leaves_household_age": 18,
    })()


def _make_asset(name="ISA", asset_type="ISA", balance=10000.0,
                growth_rate_mean=0.05, growth_rate_std=0.10,
                withdrawal_priority=50, bond_allocation=0.0):
    """Create a mock AssetAccount."""
    return type("AssetAccount", (), {
        "name": name,
        "asset_type": asset_type,
        "withdrawal_priority": withdrawal_priority,
        "balance": balance,
        "annual_contribution": 5000.0,
        "growth_rate_mean": growth_rate_mean,
        "growth_rate_std": growth_rate_std,
        "contributions_end_at_retirement": False,
        "bond_allocation": bond_allocation,
    })()


def _make_property(name="Flat", value=250000.0, **kwargs):
    """Create a mock PropertyEntity."""
    defaults = {
        "name": name,
        "value": value,
        "appreciation_rate_mean": 0.03,
        "appreciation_rate_std": 0.08,
        "monthly_rental_income": 1500.0,
        "rental_growth_rate": 0.02,
        "occupancy_rate": 0.95,
        "mortgage_ltv": 0.8,
        "mortgage_rate": 0.04,
        "mortgage_term_years": 25,
        "annual_maintenance_cost": 1500.0,
        "maintenance_is_inflation_linked": True,
        "withdrawal_priority": 15,
    }
    defaults.update(kwargs)
    return type("PropertyEntity", (), defaults)()


def _make_scenario(
    start_year: int = 2025,
    end_year: int = 2065,
    people: list | None = None,
    assets: list | None = None,
    properties: list | None = None,
    salary_by_person: dict | None = None,
    pension_by_person: dict | None = None,
) -> SimulationScenario:
    """Create a minimal valid SimulationScenario for testing."""
    if people is None:
        people = [_make_person()]
    if assets is None:
        assets = [_make_asset()]
    return SimulationScenario(
        start_year=start_year,
        end_year=end_year,
        people=people,
        salary_by_person=salary_by_person if salary_by_person is not None else {"Alice": []},
        pension_by_person=pension_by_person if pension_by_person is not None else {},
        assets=assets,
        expenses=[],
        properties=properties or [],
        rental_incomes=[],
        gift_incomes=[],
        annual_spend_target=0.0,
        planned_retirement_age_by_person={"Alice": 65},
        pension_withdrawal_priority=100,
        assumptions=SimulationAssumptions(),
    )


def test_valid_scenario_has_no_errors():
    report = validate_scenario(_make_scenario())
    assert report.is_valid
    assert report.error_count == 0
    assert report.warning_count == 0


def test_invalid_start_year_after_end_year():
    scenario = _make_scenario(start_year=2030, end_year=2025)
    report = validate_scenario(scenario)
    assert not report.is_valid
    assert report.error_count == 1
    assert report.warning_count == 0


def test_no_people():
    scenario = _make_scenario(people=[])
    report = validate_scenario(scenario)
    assert not report.is_valid
    assert report.error_count == 1


def test_negative_asset_balance():
    asset = _make_asset(name="Broken", balance=-100.0)
    scenario = _make_scenario(assets=[asset])
    report = validate_scenario(scenario)
    assert not report.is_valid
    assert report.error_count == 1


def test_negative_growth_rate_std():
    asset = _make_asset(name="BadVol", growth_rate_std=-0.10)
    scenario = _make_scenario(assets=[asset])
    report = validate_scenario(scenario)
    assert not report.is_valid
    assert report.error_count == 1


def test_zero_volatility_warning():
    asset = _make_asset(name="Deterministic", growth_rate_std=0.0,
                        growth_rate_mean=0.05)
    scenario = _make_scenario(assets=[asset])
    report = validate_scenario(scenario)
    assert report.warning_count == 1


def test_negative_property_value():
    prop = _make_property(name="BadProperty", value=-50000.0)
    scenario = _make_scenario(properties=[prop])
    report = validate_scenario(scenario)
    assert not report.is_valid
    assert report.error_count == 1


def test_salary_employee_pension_contribution_requires_matching_pension_pot():
    salary = SalaryIncome(
        gross_annual=50_000.0,
        annual_growth_rate=0.02,
        employee_pension_pct=0.05,
        employer_pension_pct=0.0,
    )
    scenario = _make_scenario(salary_by_person={"Alice": [salary]}, pension_by_person={})

    report = validate_scenario(scenario)

    assert not report.is_valid
    assert report.error_count == 1
    assert "no pension asset/pot" in report.issues[0].message


def test_salary_employer_pension_contribution_requires_matching_pension_pot():
    salary = SalaryIncome(
        gross_annual=50_000.0,
        annual_growth_rate=0.02,
        employee_pension_pct=0.0,
        employer_pension_pct=0.03,
    )
    scenario = _make_scenario(salary_by_person={"Alice": [salary]}, pension_by_person={})

    report = validate_scenario(scenario)

    assert not report.is_valid
    assert report.error_count == 1
    assert "employee 0.00%, employer 3.00%" in report.issues[0].message


def test_salary_pension_contribution_with_matching_pension_pot_is_valid():
    salary = SalaryIncome(
        gross_annual=50_000.0,
        annual_growth_rate=0.02,
        employee_pension_pct=0.05,
        employer_pension_pct=0.03,
    )
    pension = PensionPot(balance=10_000.0, growth_rate_mean=0.05, growth_rate_std=0.10)
    scenario = _make_scenario(
        salary_by_person={"Alice": [salary]},
        pension_by_person={"Alice": pension},
    )

    report = validate_scenario(scenario)

    assert report.is_valid
    assert report.error_count == 0


def test_salary_pension_contribution_requires_pension_for_same_person():
    salary = SalaryIncome(
        gross_annual=50_000.0,
        annual_growth_rate=0.02,
        employee_pension_pct=0.05,
        employer_pension_pct=0.03,
    )
    pension = PensionPot(balance=10_000.0, growth_rate_mean=0.05, growth_rate_std=0.10)
    scenario = _make_scenario(
        people=[_make_person("Alice"), _make_person("Bob")],
        salary_by_person={"Bob": [salary]},
        pension_by_person={"Alice": pension},
    )

    report = validate_scenario(scenario)

    assert not report.is_valid
    assert report.error_count == 1
    assert report.issues[0].field == "salary.Bob.0.pension_contributions"
