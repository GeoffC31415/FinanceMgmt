from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.dependencies import get_db_session
from backend.models import Asset, Expense, Income, Person, Property, Scenario
from backend.schemas.scenario import ScenarioCreate, ScenarioRead

router = APIRouter()


@router.get("/health")
async def config_health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/tax-years")
async def list_tax_years() -> list[dict]:
    """Return available tax year presets with their band values."""
    from backend.simulation.tax.tax_config import TAX_YEAR_PRESETS, get_available_tax_years
    result = []
    for year in get_available_tax_years():
        cfg = TAX_YEAR_PRESETS[year]
        result.append({
            "tax_year": year,
            "personal_allowance": cfg.personal_allowance,
            "basic_rate_limit": cfg.basic_rate_limit,
            "higher_rate_limit": cfg.higher_rate_limit,
            "basic_rate": cfg.basic_rate,
            "higher_rate": cfg.higher_rate,
            "additional_rate": cfg.additional_rate,
            "ni_primary_threshold": cfg.ni_primary_threshold,
            "ni_upper_earnings_limit": cfg.ni_upper_earnings_limit,
            "ni_main_rate": cfg.ni_main_rate,
            "ni_upper_rate": cfg.ni_upper_rate,
        })
    return result


def _scenario_query():
    return (
        select(Scenario)
        .options(selectinload(Scenario.people))
        .options(selectinload(Scenario.incomes))
        .options(selectinload(Scenario.assets))
        .options(selectinload(Scenario.properties))
        .options(selectinload(Scenario.expenses))
    )


@router.get("/scenarios", response_model=list[ScenarioRead])
async def list_scenarios(session: AsyncSession = Depends(get_db_session)) -> list[Scenario]:
    result = await session.execute(_scenario_query().order_by(Scenario.created_at.desc()))
    return list(result.scalars().unique().all())


@router.get("/scenarios/{scenario_id}", response_model=ScenarioRead)
async def get_scenario(scenario_id: str, session: AsyncSession = Depends(get_db_session)) -> Scenario:
    result = await session.execute(_scenario_query().where(Scenario.id == scenario_id))
    scenario = result.scalars().unique().first()
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


@router.post("/scenarios", response_model=ScenarioRead, status_code=201)
async def create_scenario(payload: ScenarioCreate, session: AsyncSession = Depends(get_db_session)) -> Scenario:
    scenario = Scenario(name=payload.name, assumptions=payload.assumptions)
    session.add(scenario)
    await session.flush()

    people = [
        Person(
            id=person.id or None,
            scenario_id=scenario.id,
            label=person.label,
            birth_date=person.birth_date,
            planned_retirement_age=person.planned_retirement_age,
            state_pension_age=person.state_pension_age,
            is_child=person.is_child,
            annual_cost=person.annual_cost,
            leaves_household_age=person.leaves_household_age,
        )
        for person in payload.people
    ]
    session.add_all(people)
    await session.flush()
    label_to_person_id = {person.label: person.id for person in people}

    session.add_all(
        [
            Income(
                scenario_id=scenario.id,
                person_id=income.person_id or label_to_person_id.get(income.person_label or ""),
                kind=income.kind,
                gross_annual=income.gross_annual,
                annual_growth_rate=income.annual_growth_rate,
                employee_pension_pct=income.employee_pension_pct,
                employer_pension_pct=income.employer_pension_pct,
                start_year=income.start_year,
                end_year=income.end_year,
            )
            for income in payload.incomes
        ]
    )

    session.add_all(
        [
            Asset(
                scenario_id=scenario.id,
                person_id=asset.person_id or label_to_person_id.get(asset.person_label or ""),
                name=asset.name,
                balance=asset.balance,
                annual_contribution=asset.annual_contribution,
                growth_rate_mean=asset.growth_rate_mean,
                growth_rate_std=asset.growth_rate_std,
                contributions_end_at_retirement=asset.contributions_end_at_retirement,
                asset_type=asset.asset_type,
                withdrawal_priority=asset.withdrawal_priority,
                bond_allocation=asset.bond_allocation,
            )
            for asset in payload.assets
        ]
    )

    session.add_all(
        [
            Property(
                scenario_id=scenario.id,
                person_id=property_.person_id or label_to_person_id.get(property_.person_label or ""),
                name=property_.name,
                value=property_.value,
                appreciation_rate_mean=property_.appreciation_rate_mean,
                appreciation_rate_std=property_.appreciation_rate_std,
                monthly_rental_income=property_.monthly_rental_income,
                rental_growth_rate=property_.rental_growth_rate,
                occupancy_rate=property_.occupancy_rate,
                mortgage_ltv=property_.mortgage_ltv,
                mortgage_rate=property_.mortgage_rate,
                mortgage_term_years=property_.mortgage_term_years,
                annual_maintenance_cost=property_.annual_maintenance_cost,
                maintenance_is_inflation_linked=property_.maintenance_is_inflation_linked,
                withdrawal_priority=property_.withdrawal_priority,
            )
            for property_ in payload.properties
        ]
    )

    session.add_all(
        [
            Expense(
                scenario_id=scenario.id,
                name=expense.name,
                monthly_amount=expense.monthly_amount,
                start_year=expense.start_year,
                end_year=expense.end_year,
                is_inflation_linked=expense.is_inflation_linked,
            )
            for expense in payload.expenses
        ]
    )

    await session.commit()
    result = await session.execute(_scenario_query().where(Scenario.id == scenario.id))
    return result.scalars().unique().one()


@router.put("/scenarios/{scenario_id}", response_model=ScenarioRead)
async def update_scenario(
    scenario_id: str,
    payload: ScenarioCreate,
    session: AsyncSession = Depends(get_db_session),
) -> Scenario:
    result = await session.execute(_scenario_query().where(Scenario.id == scenario_id))
    scenario = result.scalars().unique().first()
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    scenario.name = payload.name
    scenario.assumptions = payload.assumptions

    # Keep person IDs stable across edits, otherwise income/asset assignment breaks.
    existing_people_by_id = {person.id: person for person in scenario.people}
    keep_ids: set[str] = set()
    created_people: list[Person] = []
    for person in payload.people:
        if person.id and person.id in existing_people_by_id:
            existing = existing_people_by_id[person.id]
            existing.label = person.label
            existing.birth_date = person.birth_date
            existing.planned_retirement_age = person.planned_retirement_age
            existing.state_pension_age = person.state_pension_age
            existing.is_child = person.is_child
            existing.annual_cost = person.annual_cost
            existing.leaves_household_age = person.leaves_household_age
            keep_ids.add(existing.id)
        else:
            created = Person(
                scenario_id=scenario.id,
                label=person.label,
                birth_date=person.birth_date,
                planned_retirement_age=person.planned_retirement_age,
                state_pension_age=person.state_pension_age,
                is_child=person.is_child,
                annual_cost=person.annual_cost,
                leaves_household_age=person.leaves_household_age,
            )
            scenario.people.append(created)
            created_people.append(created)
    await session.flush()
    for created in created_people:
        keep_ids.add(created.id)

    for person in list(scenario.people):
        if person.id not in keep_ids:
            scenario.people.remove(person)

    label_to_person_id = {person.label: person.id for person in scenario.people}

    # Replace remaining nested collections deterministically.
    scenario.incomes.clear()
    scenario.assets.clear()
    scenario.properties.clear()
    scenario.expenses.clear()

    scenario.incomes.extend(
        [
            Income(
                scenario_id=scenario.id,
                person_id=income.person_id or label_to_person_id.get(income.person_label or ""),
                kind=income.kind,
                gross_annual=income.gross_annual,
                annual_growth_rate=income.annual_growth_rate,
                employee_pension_pct=income.employee_pension_pct,
                employer_pension_pct=income.employer_pension_pct,
                start_year=income.start_year,
                end_year=income.end_year,
            )
            for income in payload.incomes
        ]
    )

    scenario.assets.extend(
        [
            Asset(
                scenario_id=scenario.id,
                person_id=asset.person_id or label_to_person_id.get(asset.person_label or ""),
                name=asset.name,
                balance=asset.balance,
                annual_contribution=asset.annual_contribution,
                growth_rate_mean=asset.growth_rate_mean,
                growth_rate_std=asset.growth_rate_std,
                contributions_end_at_retirement=asset.contributions_end_at_retirement,
                asset_type=asset.asset_type,
                withdrawal_priority=asset.withdrawal_priority,
                bond_allocation=asset.bond_allocation,
            )
            for asset in payload.assets
        ]
    )

    scenario.properties.extend(
        [
            Property(
                scenario_id=scenario.id,
                person_id=property_.person_id or label_to_person_id.get(property_.person_label or ""),
                name=property_.name,
                value=property_.value,
                appreciation_rate_mean=property_.appreciation_rate_mean,
                appreciation_rate_std=property_.appreciation_rate_std,
                monthly_rental_income=property_.monthly_rental_income,
                rental_growth_rate=property_.rental_growth_rate,
                occupancy_rate=property_.occupancy_rate,
                mortgage_ltv=property_.mortgage_ltv,
                mortgage_rate=property_.mortgage_rate,
                mortgage_term_years=property_.mortgage_term_years,
                annual_maintenance_cost=property_.annual_maintenance_cost,
                maintenance_is_inflation_linked=property_.maintenance_is_inflation_linked,
                withdrawal_priority=property_.withdrawal_priority,
            )
            for property_ in payload.properties
        ]
    )

    scenario.expenses.extend(
        [
            Expense(
                scenario_id=scenario.id,
                name=expense.name,
                monthly_amount=expense.monthly_amount,
                start_year=expense.start_year,
                end_year=expense.end_year,
                is_inflation_linked=expense.is_inflation_linked,
            )
            for expense in payload.expenses
        ]
    )

    await session.commit()
    result = await session.execute(_scenario_query().where(Scenario.id == scenario.id))
    return result.scalars().unique().one()


@router.delete("/scenarios/{scenario_id}", status_code=204, response_class=Response)
async def delete_scenario(scenario_id: str, session: AsyncSession = Depends(get_db_session)) -> Response:
    result = await session.execute(select(Scenario).where(Scenario.id == scenario_id))
    scenario = result.scalars().first()
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    await session.delete(scenario)
    await session.commit()
    return Response(status_code=204)

