"""
Schema validation tests: ensure Pydantic schemas reject invalid inputs
(negative balances, impossible dates, missing required fields, etc.).
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.schemas.assets import AssetCreate, AssetType
from backend.schemas.expenses import ExpenseCreate
from backend.schemas.income import IncomeCreate
from backend.schemas.person import PersonCreate
from backend.schemas.property import PropertyCreate
from backend.schemas.scenario import ScenarioCreate
from backend.schemas.simulation import SimulationRequest, SimulationRecalcRequest


# ────────────────────────────── PersonCreate ──────────────────────────────


class TestPersonSchema:
    def test_valid_adult(self):
        p = PersonCreate(label="Alice", birth_date="1990-01-01", planned_retirement_age=65)
        assert p.label == "Alice"
        assert p.planned_retirement_age == 65

    def test_adult_requires_retirement_age(self):
        """Adults (is_child=False) must have planned_retirement_age."""
        with pytest.raises(ValidationError, match="planned retirement age"):
            PersonCreate(label="Bob", birth_date="1990-01-01")

    def test_valid_child(self):
        p = PersonCreate(
            label="Child", birth_date="2020-01-01",
            is_child=True, annual_cost=5_000, leaves_household_age=18,
        )
        assert p.is_child is True
        assert p.annual_cost == 5_000.0

    def test_child_defaults_annual_cost(self):
        """Children without annual_cost default to 0."""
        p = PersonCreate(label="Child", birth_date="2020-01-01", is_child=True)
        assert p.annual_cost == 0.0

    def test_empty_label_rejected(self):
        with pytest.raises(ValidationError):
            PersonCreate(label="", birth_date="1990-01-01", planned_retirement_age=65)

    def test_retirement_age_out_of_range(self):
        with pytest.raises(ValidationError):
            PersonCreate(label="X", birth_date="1990-01-01", planned_retirement_age=200)

    def test_negative_retirement_age_rejected(self):
        with pytest.raises(ValidationError):
            PersonCreate(label="X", birth_date="1990-01-01", planned_retirement_age=-5)


# ────────────────────────────── AssetCreate ──────────────────────────────


class TestAssetSchema:
    def test_valid_asset(self):
        a = AssetCreate(name="ISA", balance=10_000.0, asset_type=AssetType.ISA)
        assert a.name == "ISA"
        assert a.asset_type == AssetType.ISA

    def test_negative_balance_rejected(self):
        with pytest.raises(ValidationError):
            AssetCreate(name="ISA", balance=-100.0)

    def test_negative_growth_std_rejected(self):
        with pytest.raises(ValidationError):
            AssetCreate(name="ISA", growth_rate_std=-0.05)

    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError):
            AssetCreate(name="", balance=1_000.0)

    def test_default_values(self):
        a = AssetCreate(name="Test")
        assert a.balance == 0.0
        assert a.annual_contribution == 0.0
        assert a.growth_rate_mean == 0.0
        assert a.growth_rate_std == 0.0
        assert a.asset_type == AssetType.GIA
        assert a.withdrawal_priority == 100

    def test_withdrawal_priority_range(self):
        """Priority must be 0-10000."""
        with pytest.raises(ValidationError):
            AssetCreate(name="X", withdrawal_priority=-1)
        with pytest.raises(ValidationError):
            AssetCreate(name="X", withdrawal_priority=10_001)


# ────────────────────────────── IncomeCreate ──────────────────────────────


class TestIncomeSchema:
    def test_valid_salary(self):
        i = IncomeCreate(kind="salary", gross_annual=50_000.0, annual_growth_rate=0.03)
        assert i.kind == "salary"

    def test_negative_gross_rejected(self):
        with pytest.raises(ValidationError):
            IncomeCreate(kind="salary", gross_annual=-1.0)

    def test_growth_rate_bounds(self):
        """Growth rate must be between -1.0 and 10.0."""
        with pytest.raises(ValidationError):
            IncomeCreate(kind="salary", gross_annual=1.0, annual_growth_rate=-1.5)
        with pytest.raises(ValidationError):
            IncomeCreate(kind="salary", gross_annual=1.0, annual_growth_rate=11.0)

    def test_pension_pct_bounds(self):
        """Pension percentages must be 0-1."""
        with pytest.raises(ValidationError):
            IncomeCreate(kind="salary", gross_annual=1.0, employee_pension_pct=1.5)
        with pytest.raises(ValidationError):
            IncomeCreate(kind="salary", gross_annual=1.0, employer_pension_pct=-0.1)


# ────────────────────────────── PropertyCreate ──────────────────────────────


class TestPropertySchema:
    def test_valid_property_mortgage_fields(self):
        p = PropertyCreate(
            name="Flat",
            value=200_000.0,
            mortgage_ltv=0.75,
            mortgage_rate=0.04,
            mortgage_term_years=25,
        )
        assert p.mortgage_ltv == 0.75
        assert p.mortgage_rate == 0.04
        assert p.mortgage_term_years == 25

    def test_negative_property_value_rejected(self):
        with pytest.raises(ValidationError):
            PropertyCreate(name="Flat", value=-1.0)

    def test_mortgage_ltv_bounds(self):
        with pytest.raises(ValidationError):
            PropertyCreate(name="Flat", mortgage_ltv=-0.01)
        with pytest.raises(ValidationError):
            PropertyCreate(name="Flat", mortgage_ltv=1.5)

    def test_mortgage_rate_bounds(self):
        with pytest.raises(ValidationError):
            PropertyCreate(name="Flat", mortgage_rate=-0.01)
        with pytest.raises(ValidationError):
            PropertyCreate(name="Flat", mortgage_rate=1.5)

    def test_negative_term_rejected(self):
        with pytest.raises(ValidationError):
            PropertyCreate(name="Flat", mortgage_term_years=-1)


# ────────────────────────────── ExpenseCreate ──────────────────────────────


class TestExpenseSchema:
    def test_valid_expense(self):
        e = ExpenseCreate(name="Rent", monthly_amount=1_500.0)
        assert e.name == "Rent"
        assert e.is_inflation_linked is True  # default

    def test_negative_amount_rejected(self):
        with pytest.raises(ValidationError):
            ExpenseCreate(name="X", monthly_amount=-100.0)

    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError):
            ExpenseCreate(name="", monthly_amount=100.0)


# ────────────────────────────── ScenarioCreate ──────────────────────────────


class TestScenarioSchema:
    def test_valid_minimal_scenario(self):
        s = ScenarioCreate(name="Test")
        assert s.name == "Test"
        assert s.people == []
        assert s.properties == []

    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError):
            ScenarioCreate(name="")

    def test_name_too_long(self):
        with pytest.raises(ValidationError):
            ScenarioCreate(name="x" * 201)

    def test_full_scenario(self):
        s = ScenarioCreate(
            name="Full",
            assumptions={"inflation_rate": 0.02},
            people=[
                PersonCreate(label="Alice", birth_date="1990-01-01", planned_retirement_age=65),
            ],
            incomes=[
                IncomeCreate(kind="salary", gross_annual=50_000.0),
            ],
            assets=[
                AssetCreate(name="ISA", balance=10_000.0),
            ],
            properties=[
                PropertyCreate(
                    name="Flat",
                    value=250_000.0,
                    mortgage_ltv=0.8,
                    mortgage_rate=0.04,
                    mortgage_term_years=25,
                ),
            ],
            expenses=[
                ExpenseCreate(name="Living", monthly_amount=2_000.0),
            ],
        )
        assert len(s.people) == 1
        assert len(s.incomes) == 1
        assert len(s.assets) == 1
        assert len(s.properties) == 1
        assert len(s.expenses) == 1


# ────────────────────────────── SimulationRequest ──────────────────────────────


class TestSimulationRequestSchema:
    def test_valid_request(self):
        r = SimulationRequest(scenario_id="abc-123")
        assert r.iterations == 2000  # default
        assert r.seed == 0  # default

    def test_iterations_bounds(self):
        with pytest.raises(ValidationError):
            SimulationRequest(scenario_id="x", iterations=5)
        with pytest.raises(ValidationError):
            SimulationRequest(scenario_id="x", iterations=25_000)

    def test_negative_spend_rejected(self):
        with pytest.raises(ValidationError):
            SimulationRequest(scenario_id="x", annual_spend_target=-1.0)


class TestSimulationRecalcRequestSchema:
    def test_valid_request(self):
        r = SimulationRecalcRequest(session_id="sess-1")
        assert r.retirement_age_offset == 0

    def test_retirement_offset_bounds(self):
        with pytest.raises(ValidationError):
            SimulationRecalcRequest(session_id="x", retirement_age_offset=-31)
        with pytest.raises(ValidationError):
            SimulationRecalcRequest(session_id="x", retirement_age_offset=31)

    def test_percentile_bounds(self):
        with pytest.raises(ValidationError):
            SimulationRecalcRequest(session_id="x", percentile=0)
        with pytest.raises(ValidationError):
            SimulationRecalcRequest(session_id="x", percentile=100)
