"""Simulation service — scenario building, validation, and response formatting.

Extracted from routers/simulation.py to make the engine testable without HTTP
fixtures and to reduce the router from 1,072 lines to a thin routing layer.
"""
from __future__ import annotations

from datetime import date

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models import Scenario
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
from backend.simulation.engine import SimulationAssumptions, SimulationScenario
from backend.simulation.engine_fast import run_simulation
from backend.simulation.returns_cache import (
    ReturnsMatrix,
    generate_returns_matrix,
)
from backend.simulation.validator import validate_scenario


class ScenarioBuilder:
    """Convert a DB Scenario → SimulationScenario (entity model)."""

    def __init__(self, db_session: AsyncSession):
        self.db_session = db_session

    async def load_scenario(self, scenario_id: str) -> Scenario:
        """Load a scenario from the DB with all child collections eagerly loaded."""
        query = (
            select(Scenario)
            .options(selectinload(Scenario.people))
            .options(selectinload(Scenario.incomes))
            .options(selectinload(Scenario.assets))
            .options(selectinload(Scenario.properties))
            .options(selectinload(Scenario.expenses))
            .where(Scenario.id == scenario_id)
        )
        result = await self.db_session.execute(query)
        scenario = result.scalars().unique().first()
        if scenario is None:
            return None  # type: ignore[return-value]
        return scenario

    @staticmethod
    def _coerce_int(value: object, default: int) -> int:
        try:
            return int(value)  # type: ignore[arg-type]
        except Exception:
            return default

    @staticmethod
    def _coerce_float(value: object, default: float) -> float:
        try:
            return float(value)  # type: ignore[arg-type]
        except Exception:
            return default

    def build(
        self,
        scenario: Scenario,
        *,
        annual_spend_target_override: float | None = None,
        end_year_override: int | None = None,
    ) -> SimulationScenario:
        """Build a SimulationScenario from a DB Scenario with optional overrides."""
        assumptions_json = scenario.assumptions or {}

        from backend.simulation.tax.tax_config import tax_config_from_assumptions
        tax_cfg = tax_config_from_assumptions(assumptions_json)

        return_model = str(assumptions_json.get("return_model", "parametric"))
        if return_model not in ("parametric", "historical_bootstrap"):
            return_model = "parametric"

        assumptions = SimulationAssumptions(
            return_model=return_model,
            inflation_rate=self._coerce_float(assumptions_json.get("inflation_rate"), 0.02),
            isa_annual_limit=self._coerce_float(assumptions_json.get("isa_annual_limit"), 20_000.0),
            state_pension_annual=self._coerce_float(assumptions_json.get("state_pension_annual"), 11_500.0),
            cgt_annual_allowance=self._coerce_float(assumptions_json.get("cgt_annual_allowance"), 3_000.0),
            emergency_fund_months=self._coerce_float(assumptions_json.get("emergency_fund_months"), 6.0),
            pension_access_age=self._coerce_int(assumptions_json.get("pension_access_age"), 55),
            debt_interest_rate=self._coerce_float(assumptions_json.get("debt_interest_rate"), 0.08),
            bankruptcy_threshold=self._coerce_float(assumptions_json.get("bankruptcy_threshold"), -100_000.0),
            personal_allowance=tax_cfg.personal_allowance,
            basic_rate_limit=tax_cfg.basic_rate_limit,
            higher_rate_limit=tax_cfg.higher_rate_limit,
            basic_rate=tax_cfg.basic_rate,
            higher_rate=tax_cfg.higher_rate,
            additional_rate=tax_cfg.additional_rate,
            ni_primary_threshold=tax_cfg.ni_primary_threshold,
            ni_upper_earnings_limit=tax_cfg.ni_upper_earnings_limit,
            ni_main_rate=tax_cfg.ni_main_rate,
            ni_upper_rate=tax_cfg.ni_upper_rate,
        )

        start_year = self._coerce_int(assumptions_json.get("start_year"), date.today().year)
        end_year_default = self._coerce_int(assumptions_json.get("end_year"), start_year + 60)
        end_year = end_year_override if end_year_override is not None else end_year_default

        annual_spend_default = self._coerce_float(assumptions_json.get("annual_spend_target"), 0.0)
        annual_spend_target = annual_spend_target_override if annual_spend_target_override is not None else annual_spend_default

        people = [
            PersonEntity(
                key=person.label,
                birth_date=person.birth_date,
                planned_retirement_age=person.planned_retirement_age,
                state_pension_age=person.state_pension_age,
                is_child=getattr(person, "is_child", False),
                annual_cost=getattr(person, "annual_cost", 0.0) or 0.0,
                leaves_household_age=getattr(person, "leaves_household_age", 18) or 18,
            )
            for person in scenario.people
        ]

        salary_by_person: dict[str, list[SalaryIncome]] = {}
        rental_incomes: list[RentalIncome] = []
        gift_incomes: list[GiftIncome] = []

        for income in scenario.incomes:
            if income.kind == "salary":
                person_key = next(
                    (p.label for p in scenario.people if p.id == income.person_id),
                    scenario.people[0].label,
                )
                salary_by_person.setdefault(person_key, []).append(
                    SalaryIncome(
                        gross_annual=income.gross_annual,
                        annual_growth_rate=income.annual_growth_rate,
                        employee_pension_pct=income.employee_pension_pct,
                        employer_pension_pct=income.employer_pension_pct,
                        start_year=income.start_year,
                        end_year=income.end_year,
                    )
                )
            elif income.kind == "rental":
                person_key = next(
                    (p.label for p in scenario.people if p.id == income.person_id),
                    scenario.people[0].label,
                )
                rental_incomes.append(
                    RentalIncome(
                        gross_annual=income.gross_annual,
                        annual_growth_rate=income.annual_growth_rate,
                        start_year=income.start_year,
                        end_year=income.end_year,
                        person_key=person_key,
                    )
                )
            elif income.kind == "gift":
                person_key = next(
                    (p.label for p in scenario.people if p.id == income.person_id),
                    scenario.people[0].label,
                )
                gift_incomes.append(
                    GiftIncome(
                        gross_annual=income.gross_annual,
                        annual_growth_rate=income.annual_growth_rate,
                        start_year=income.start_year,
                        end_year=income.end_year,
                        person_key=person_key,
                    )
                )

        pension_by_person: dict[str, PensionPot] = {}
        assets: list[AssetAccount] = []
        properties: list[PropertyEntity] = []
        pension_withdrawal_priority = 100

        for asset in scenario.assets:
            asset_type = getattr(asset, "asset_type", None) or (
                "PENSION" if "pension" in asset.name.lower() else "GIA"
            )
            withdrawal_priority = getattr(asset, "withdrawal_priority", 100)
            bond_allocation = float(getattr(asset, "bond_allocation", 0.0) or 0.0)

            if asset_type == "PENSION":
                if asset.person_id:
                    person_key = next(
                        (p.label for p in scenario.people if p.id == asset.person_id),
                        scenario.people[0].label,
                    )
                else:
                    person_key = scenario.people[0].label

                if person_key not in pension_by_person:
                    pension_by_person[person_key] = PensionPot(
                        balance=asset.balance,
                        growth_rate_mean=asset.growth_rate_mean,
                        growth_rate_std=asset.growth_rate_std,
                        bond_allocation=bond_allocation,
                    )
                else:
                    pension_by_person[person_key].balance += asset.balance
                pension_withdrawal_priority = min(pension_withdrawal_priority, int(withdrawal_priority))
                continue

            if asset.person_id:
                person_key = next(
                    (p.label for p in scenario.people if p.id == asset.person_id),
                    scenario.people[0].label,
                )
            else:
                person_key = scenario.people[0].label

            assets.append(
                AssetAccount(
                    name=asset.name,
                    asset_type=asset_type,
                    withdrawal_priority=withdrawal_priority,
                    balance=asset.balance,
                    annual_contribution=asset.annual_contribution,
                    growth_rate_mean=asset.growth_rate_mean,
                    growth_rate_std=asset.growth_rate_std,
                    contributions_end_at_retirement=asset.contributions_end_at_retirement,
                    bond_allocation=bond_allocation,
                    person_key=person_key,
                    cost_basis=asset.balance,
                )
            )

        for property_ in scenario.properties:
            if property_.person_id:
                person_key = next(
                    (p.label for p in scenario.people if p.id == property_.person_id),
                    scenario.people[0].label,
                )
            else:
                person_key = scenario.people[0].label

            properties.append(
                PropertyEntity(
                    name=property_.name,
                    person_key=person_key,
                    withdrawal_priority=int(getattr(property_, "withdrawal_priority", 15)),
                    value=property_.value,
                    appreciation_rate_mean=property_.appreciation_rate_mean,
                    appreciation_rate_std=property_.appreciation_rate_std,
                    monthly_rental_income=property_.monthly_rental_income,
                    rental_growth_rate=property_.rental_growth_rate,
                    occupancy_rate=property_.occupancy_rate,
                    annual_maintenance_cost=property_.annual_maintenance_cost,
                    mortgage_ltv=float(getattr(property_, "mortgage_ltv", 0.0) or 0.0),
                    mortgage_rate=float(getattr(property_, "mortgage_rate", 0.0) or 0.0),
                    mortgage_term_years=int(getattr(property_, "mortgage_term_years", 0) or 0),
                    maintenance_is_inflation_linked=property_.maintenance_is_inflation_linked,
                    cost_basis=property_.value,
                )
            )

        expenses = [
            ExpenseItem(
                name=expense.name,
                annual_amount=expense.monthly_amount * 12.0,
                is_inflation_linked=expense.is_inflation_linked,
            )
            for expense in scenario.expenses
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
            annual_spend_target=annual_spend_target,
            planned_retirement_age_by_person={
                p.key: p.planned_retirement_age
                for p in people
                if not p.is_child and p.planned_retirement_age is not None
            },
            pension_withdrawal_priority=pension_withdrawal_priority,
            assumptions=assumptions,
        )

    @staticmethod
    def build_variant(
        base: SimulationScenario,
        *,
        annual_spend_target: float,
        retirement_age_offset: int = 0,
    ) -> SimulationScenario:
        """Build a scenario variant from a cached base with spend/retirement overrides."""
        people = [
            PersonEntity(
                key=p.key,
                birth_date=p.birth_date,
                planned_retirement_age=(
                    max(0, int(p.planned_retirement_age) + retirement_age_offset)
                    if p.planned_retirement_age is not None else None
                ),
                state_pension_age=p.state_pension_age,
                is_child=p.is_child,
                annual_cost=p.annual_cost,
                leaves_household_age=p.leaves_household_age,
            )
            for p in base.people
        ]

        return SimulationScenario(
            start_year=base.start_year,
            end_year=base.end_year,
            people=people,
            salary_by_person=base.salary_by_person,
            pension_by_person=base.pension_by_person,
            assets=base.assets,
            properties=base.properties,
            expenses=base.expenses,
            rental_incomes=base.rental_incomes,
            gift_incomes=base.gift_incomes,
            annual_spend_target=annual_spend_target,
            planned_retirement_age_by_person={
                p.key: p.planned_retirement_age
                for p in people
                if not p.is_child and p.planned_retirement_age is not None
            },
            pension_withdrawal_priority=base.pension_withdrawal_priority,
            assumptions=base.assumptions,
        )


class ResponseFormatter:
    """Format SimulationRunMatrices → SimulationResponse Pydantic model."""

    @staticmethod
    def _retirement_years_from_people(*, people: list[PersonEntity]) -> list[int]:
        return sorted({
            p.birth_date.year + p.planned_retirement_age
            for p in people
            if not p.is_child and p.planned_retirement_age is not None
        })

    @staticmethod
    def format(
        *,
        years: list[int],
        mats: dict[str, np.ndarray],
        people: list[PersonEntity],
        inflation_rate: float,
        start_year: int,
        pct: int = 50,
    ) -> dict:
        """Format matrices into a dict ready for SimulationResponse.

        Returns a dict (not SimulationResponse directly) so the caller can
        pass it through any response model wrapper (e.g. SimulationInitResponse).
        """
        nw = mats.get("net_worth")
        if nw is not None and nw.size:
            final_nw = nw[:, -1]
            sorted_indices = np.argsort(final_nw)
            target_idx = int(np.clip(len(sorted_indices) * pct / 100, 0, len(sorted_indices) - 1))
            rep_iter = sorted_indices[target_idx]
        else:
            rep_iter = 0

        def _from_iter(field_name: str) -> list[float]:
            m = mats.get(field_name)
            if m is None or not m.size:
                return [0.0] * len(years)
            return m[rep_iter, :].tolist()

        def _at_pct(field_name: str, p: int) -> list[float]:
            m = mats.get(field_name)
            if m is None or not m.size:
                return [0.0] * len(years)
            return np.percentile(m, p, axis=0).tolist()

        def _percentage(field_name: str) -> list[float]:
            m = mats.get(field_name)
            if m is None or not m.size:
                return [0.0] * len(years)
            return (np.mean(m, axis=0) * 100).tolist()

        return {
            # Net worth bands
            "years": years,
            "net_worth_p10": _at_pct("net_worth", 10),
            "net_worth_median": _from_iter("net_worth"),
            "net_worth_p90": _at_pct("net_worth", 90),
            "income_median": _from_iter("total_income"),
            "spend_median": _from_iter("total_expenses"),
            "retirement_years": ResponseFormatter._retirement_years_from_people(people=people),
            "inflation_rate": inflation_rate,
            "start_year": start_year,
            # Incomes
            "salary_gross_median": _from_iter("salary_gross"),
            "salary_net_median": _from_iter("salary_net"),
            "rental_income_median": _from_iter("rental_income"),
            "gift_income_median": _from_iter("gift_income"),
            "pension_income_median": _from_iter("pension_income"),
            "state_pension_income_median": _from_iter("state_pension_income"),
            "investment_returns_median": _from_iter("investment_returns"),
            "total_income_median": _from_iter("total_income"),
            # Expenses
            "total_expenses_median": _from_iter("total_expenses"),
            "mortgage_payment_median": _from_iter("mortgage_payment"),
            "pension_contributions_median": _from_iter("pension_contributions"),
            "fun_fund_median": _from_iter("fun_fund"),
            # Tax
            "income_tax_paid_median": _from_iter("income_tax_paid"),
            "state_pension_tax_paid_median": _from_iter("state_pension_tax_paid"),
            "ni_paid_median": _from_iter("ni_paid"),
            "total_tax_median": _from_iter("total_tax"),
            # P1.1: Structured tax breakdown
            "salary_income_tax_paid_median": _from_iter("salary_income_tax_paid"),
            "rental_income_tax_paid_median": _from_iter("rental_income_tax_paid"),
            "pension_drawdown_tax_paid_median": _from_iter("pension_drawdown_tax_paid"),
            "capital_gains_tax_paid_median": _from_iter("capital_gains_tax_paid"),
            "gia_cgt_paid_median": _from_iter("gia_cgt_paid"),
            "property_cgt_paid_median": _from_iter("property_cgt_paid"),
            "salary_income_tax_personal_allowance_used_median": _from_iter("salary_income_tax_personal_allowance_used"),
            "salary_income_tax_personal_allowance_lost_median": _from_iter("salary_income_tax_personal_allowance_lost"),
            "salary_income_tax_basic_band_amount_median": _from_iter("salary_income_tax_basic_band_amount"),
            "salary_income_tax_basic_band_tax_median": _from_iter("salary_income_tax_basic_band_tax"),
            "salary_income_tax_higher_band_amount_median": _from_iter("salary_income_tax_higher_band_amount"),
            "salary_income_tax_higher_band_tax_median": _from_iter("salary_income_tax_higher_band_tax"),
            "salary_income_tax_additional_band_amount_median": _from_iter("salary_income_tax_additional_band_amount"),
            "salary_income_tax_additional_band_tax_median": _from_iter("salary_income_tax_additional_band_tax"),
            "salary_income_tax_allowance_taper_tax_median": _from_iter("salary_income_tax_allowance_taper_tax"),
            # Assets
            "isa_balance_median": _from_iter("isa_balance"),
            "pension_balance_median": _from_iter("pension_balance"),
            "cash_balance_median": _from_iter("cash_balance"),
            "gia_balance_median": _from_iter("gia_balance"),
            "property_value_median": _from_iter("property_value"),
            "total_assets_median": _from_iter("total_assets"),
            # Per-type returns
            "isa_returns_median": _from_iter("isa_returns"),
            "gia_returns_median": _from_iter("gia_returns"),
            "cash_returns_median": _from_iter("cash_returns"),
            "pension_returns_median": _from_iter("pension_returns"),
            "property_returns_median": _from_iter("property_returns"),
            # Per-type contributions
            "isa_contributions_median": _from_iter("isa_contributions"),
            "gia_contributions_median": _from_iter("gia_contributions"),
            # Per-type withdrawals
            "isa_withdrawals_median": _from_iter("isa_withdrawals"),
            "gia_withdrawals_median": _from_iter("gia_withdrawals"),
            "pension_withdrawals_median": _from_iter("pension_withdrawals"),
            "property_rental_income_median": _from_iter("property_rental_income"),
            "property_maintenance_median": _from_iter("property_maintenance"),
            # Liabilities
            "mortgage_balance_median": _from_iter("mortgage_balance"),
            "total_liabilities_median": _from_iter("total_liabilities"),
            # Other
            "mortgage_paid_off_median": _percentage("mortgage_paid_off"),
            "is_depleted_median": _percentage("is_depleted"),
            "is_bankrupt_median": _percentage("is_bankrupt"),
            "debt_balance_median": _from_iter("debt_balance"),
            "debt_interest_paid_median": _from_iter("debt_interest_paid"),
        }


class SimulationScenarioValidator:
    """Validate a SimulationScenario and raise HTTPException if errors found."""

    @staticmethod
    def validate(sim_scenario: SimulationScenario) -> None:
        report = validate_scenario(sim_scenario)
        if report.error_count > 0:
            errors = [
                f"{issue.field}: {issue.message}"
                for issue in report.issues
                if issue.severity == "error"
            ]
            warnings = [
                f"{issue.field}: {issue.message}"
                for issue in report.issues
                if issue.severity == "warning"
            ]
            detail = {"errors": errors}
            if warnings:
                detail["warnings"] = warnings
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=detail)


class SimulationService:
    """Orchestrates the simulation pipeline: load → build → validate → run → format.

    Usage in routes:
        service = SimulationService(db_session)
        scenario = await service.load_scenario(scenario_id)
        sim_scenario = service.scenario_builder.build(scenario)
        service.scenario_validator.validate(sim_scenario)
        returns = generate_returns_matrix(sim_scenario, ...)
        mats = run_simulation(sim_scenario, returns)
        response = SimulationResponse(**service.response_formatter.format(...))
    """

    def __init__(self, db_session: AsyncSession):
        self.db_session = db_session
        self.scenario_builder = ScenarioBuilder(db_session)
        self.response_formatter = ResponseFormatter()
        self.scenario_validator = SimulationScenarioValidator()

    def run_simulation(
        self,
        sim_scenario: SimulationScenario,
        returns: ReturnsMatrix,
        pct: int = 50,
    ) -> dict:
        """Run the engine and return formatted response dict."""
        mats = run_simulation(scenario=sim_scenario, returns=returns)
        return self.response_formatter.format(
            years=mats.years,
            mats=mats.fields,
            people=sim_scenario.people,
            inflation_rate=sim_scenario.assumptions.inflation_rate,
            start_year=sim_scenario.start_year,
            pct=pct,
        )
