from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.dependencies import get_db_session
from backend.models import Asset, Expense, Income, Person, Property, Scenario
from backend.schemas.scenario import ScenarioCloneRequest, ScenarioCloneResponse, ScenarioCreate, ScenarioRead

router = APIRouter()


@router.get("/health", summary="Health check", description="Returns 200 OK if the service is running.")
async def config_health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/tax-years", summary="List available UK tax year presets", description="Returns the available UK tax year configurations (personal allowance, NI thresholds, tax bands).")
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


@router.get("/scenarios", summary="List all scenarios", response_model=list[ScenarioRead], description="Returns all saved retirement planning scenarios with their people, incomes, assets, properties, and expenses.")
async def list_scenarios(session: AsyncSession = Depends(get_db_session)) -> list[Scenario]:
    result = await session.execute(_scenario_query().order_by(Scenario.created_at.desc()))
    return list(result.scalars().unique().all())


@router.get("/scenarios/{scenario_id}", summary="Get a scenario by ID", response_model=ScenarioRead, description="Returns a single scenario with all its child records (people, incomes, assets, properties, expenses).")
async def get_scenario(scenario_id: str, session: AsyncSession = Depends(get_db_session)) -> Scenario:
    result = await session.execute(_scenario_query().where(Scenario.id == scenario_id))
    scenario = result.scalars().unique().first()
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


@router.post("/scenarios", summary="Create a new scenario", response_model=ScenarioRead, status_code=201, description="Create a new retirement planning scenario with a nested tree of people, incomes, assets, properties, and expenses.")
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


@router.put("/scenarios/{scenario_id}", summary="Update a scenario", response_model=ScenarioRead, description="Full replacement update of a scenario. Sends the complete nested tree of children.")
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


@router.post("/scenarios/{scenario_id}/clone", summary="Clone a scenario", response_model=ScenarioCloneResponse, description="Deep-copy a scenario with all its children, creating a variant for comparison.")
async def clone_scenario(
    scenario_id: str,
    payload: ScenarioCloneRequest,
    session: AsyncSession = Depends(get_db_session),
) -> ScenarioCloneResponse:
    """Clone a scenario with all its children, generating new IDs."""
    result = await session.execute(_scenario_query().where(Scenario.id == scenario_id))
    source = result.scalars().unique().first()
    if source is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    new_name = payload.new_name or f"{source.name} (copy)"
    new_scenario = Scenario(name=new_name, assumptions=dict(source.assumptions))
    session.add(new_scenario)
    await session.flush()

    # Deep-copy all children with new IDs
    people = [
        Person(
            scenario_id=new_scenario.id,
            label=person.label,
            birth_date=person.birth_date,
            planned_retirement_age=person.planned_retirement_age,
            state_pension_age=person.state_pension_age,
            is_child=person.is_child,
            annual_cost=person.annual_cost,
            leaves_household_age=person.leaves_household_age,
        )
        for person in source.people
    ]
    session.add_all(people)
    await session.flush()

    # Map old person IDs to new ones for child references
    old_to_new_person: dict[str, str] = {}
    for old_p, new_p in zip(source.people, people):
        old_to_new_person[old_p.id] = new_p.id

    session.add_all(
        [
            Income(
                scenario_id=new_scenario.id,
                person_id=old_to_new_person.get(income.person_id),
                kind=income.kind,
                gross_annual=income.gross_annual,
                annual_growth_rate=income.annual_growth_rate,
                employee_pension_pct=income.employee_pension_pct,
                employer_pension_pct=income.employer_pension_pct,
                start_year=income.start_year,
                end_year=income.end_year,
            )
            for income in source.incomes
        ]
    )

    session.add_all(
        [
            Asset(
                scenario_id=new_scenario.id,
                person_id=old_to_new_person.get(asset.person_id),
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
            for asset in source.assets
        ]
    )

    session.add_all(
        [
            Property(
                scenario_id=new_scenario.id,
                person_id=old_to_new_person.get(prop.person_id),
                name=prop.name,
                value=prop.value,
                appreciation_rate_mean=prop.appreciation_rate_mean,
                appreciation_rate_std=prop.appreciation_rate_std,
                monthly_rental_income=prop.monthly_rental_income,
                rental_growth_rate=prop.rental_growth_rate,
                occupancy_rate=prop.occupancy_rate,
                mortgage_ltv=prop.mortgage_ltv,
                mortgage_rate=prop.mortgage_rate,
                mortgage_term_years=prop.mortgage_term_years,
                annual_maintenance_cost=prop.annual_maintenance_cost,
                maintenance_is_inflation_linked=prop.maintenance_is_inflation_linked,
                withdrawal_priority=prop.withdrawal_priority,
            )
            for prop in source.properties
        ]
    )

    session.add_all(
        [
            Expense(
                scenario_id=new_scenario.id,
                name=expense.name,
                monthly_amount=expense.monthly_amount,
                start_year=expense.start_year,
                end_year=expense.end_year,
                is_inflation_linked=expense.is_inflation_linked,
            )
            for expense in source.expenses
        ]
    )

    await session.commit()
    return ScenarioCloneResponse(
        id=new_scenario.id,
        name=new_name,
        message=f"Scenario cloned as '{new_name}'",
    )


@router.delete("/scenarios/{scenario_id}", summary="Delete a scenario", status_code=204, response_class=Response, description="Delete a scenario and all its child records (people, incomes, assets, properties, expenses).")
async def delete_scenario(scenario_id: str, session: AsyncSession = Depends(get_db_session)) -> Response:
    result = await session.execute(select(Scenario).where(Scenario.id == scenario_id))
    scenario = result.scalars().first()
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    await session.delete(scenario)
    await session.commit()
    return Response(status_code=204)

