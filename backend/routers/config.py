from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.dependencies import get_db_session
from backend.models import Asset, Expense, Income, Mortgage, Person, Scenario
from backend.schemas.scenario import ScenarioCreate, ScenarioRead

router = APIRouter()


@router.get("/health")
async def config_health() -> dict[str, str]:
    return {"status": "ok"}


def _scenario_query():
    return (
        select(Scenario)
        .options(selectinload(Scenario.people))
        .options(selectinload(Scenario.incomes))
        .options(selectinload(Scenario.assets))
        .options(selectinload(Scenario.mortgage))
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
            )
            for asset in payload.assets
        ]
    )

    if payload.mortgage is not None:
        session.add(
            Mortgage(
                scenario_id=scenario.id,
                balance=payload.mortgage.balance,
                annual_interest_rate=payload.mortgage.annual_interest_rate,
                monthly_payment=payload.mortgage.monthly_payment,
                months_remaining=payload.mortgage.months_remaining,
            )
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

    # Replace nested collections for simplicity and determinism.
    scenario.people.clear()
    scenario.incomes.clear()
    scenario.assets.clear()
    scenario.expenses.clear()

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
            keep_ids.add(existing.id)
        else:
            created = Person(
                scenario_id=scenario.id,
                label=person.label,
                birth_date=person.birth_date,
                planned_retirement_age=person.planned_retirement_age,
                state_pension_age=person.state_pension_age,
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
            )
            for asset in payload.assets
        ]
    )

    if payload.mortgage is None:
        if scenario.mortgage is not None:
            scenario.mortgage = None
    else:
        if scenario.mortgage is None:
            scenario.mortgage = Mortgage(
                scenario_id=scenario.id,
                balance=payload.mortgage.balance,
                annual_interest_rate=payload.mortgage.annual_interest_rate,
                monthly_payment=payload.mortgage.monthly_payment,
                months_remaining=payload.mortgage.months_remaining,
            )
        else:
            scenario.mortgage.balance = payload.mortgage.balance
            scenario.mortgage.annual_interest_rate = payload.mortgage.annual_interest_rate
            scenario.mortgage.monthly_payment = payload.mortgage.monthly_payment
            scenario.mortgage.months_remaining = payload.mortgage.months_remaining

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

