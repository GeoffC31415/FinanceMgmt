from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from backend.simulation.engine import SimulationScenario
from backend.simulation.returns_cache import ReturnsMatrix


@dataclass(frozen=True)
class ArrayAssumptions:
    inflation_rate: float
    isa_annual_limit: float
    state_pension_annual: float
    cgt_annual_allowance: float
    emergency_fund_months: float
    pension_access_age: int
    debt_interest_rate: float
    bankruptcy_threshold: float
    # P1.5/P1.6: Pension rules
    pension_annual_allowance: float = 60_000.0
    pension_lump_sum_allowance: float = 26_100.0
    pension_tapered_threshold: float = 260_000.0
    pension_tapered_reduction_rate: float = 0.5
    pension_minimum_allowance: float = 10_000.0
    mpaa_annual_allowance: float = 10_000.0
    # Configurable tax bands
    personal_allowance: float = 12_570.0
    basic_rate_limit: float = 50_270.0
    higher_rate_limit: float = 125_140.0
    basic_rate: float = 0.20
    higher_rate: float = 0.40
    additional_rate: float = 0.45
    ni_primary_threshold: float = 12_570.0
    ni_upper_earnings_limit: float = 50_270.0
    ni_main_rate: float = 0.08
    ni_upper_rate: float = 0.02


@dataclass(frozen=True)
class ArrayScenario:
    years: np.ndarray

    people_birth_years: np.ndarray
    people_retirement_ages: np.ndarray
    people_state_pension_ages: np.ndarray
    people_is_child: np.ndarray
    people_annual_cost: np.ndarray
    people_leaves_household_age: np.ndarray

    salary_person_idx: np.ndarray
    salary_gross_annual: np.ndarray
    salary_growth_rate: np.ndarray
    salary_employee_pct: np.ndarray
    salary_employer_pct: np.ndarray
    salary_start_year: np.ndarray
    salary_end_year: np.ndarray

    rental_person_idx: np.ndarray
    rental_gross_annual: np.ndarray
    rental_growth_rate: np.ndarray
    rental_start_year: np.ndarray
    rental_end_year: np.ndarray

    gift_person_idx: np.ndarray
    gift_gross_annual: np.ndarray
    gift_growth_rate: np.ndarray
    gift_start_year: np.ndarray
    gift_end_year: np.ndarray

    asset_types: np.ndarray
    asset_withdrawal_priority: np.ndarray
    asset_balances: np.ndarray
    asset_cost_bases: np.ndarray
    asset_annual_contrib: np.ndarray
    asset_contrib_end_retirement: np.ndarray
    asset_names: list[str]
    asset_gia_owner_idx: np.ndarray  # person index who owns each GIA asset, -1 if not GIA

    property_person_idx: np.ndarray
    property_withdrawal_priority: np.ndarray
    property_values: np.ndarray
    property_cost_bases: np.ndarray
    property_monthly_rental_income: np.ndarray
    property_rental_growth_rate: np.ndarray
    property_occupancy_rate: np.ndarray
    property_mortgage_balance: np.ndarray
    property_mortgage_rate: np.ndarray
    property_mortgage_monthly_payment: np.ndarray
    property_annual_maintenance_cost: np.ndarray
    property_maintenance_is_inflation_linked: np.ndarray
    property_names: list[str]

    pension_person_idx: np.ndarray
    pension_balances: np.ndarray
    pension_keys: list[str]

    expense_annual_amount: np.ndarray
    expense_is_inflation_linked: np.ndarray

    annual_spend_target: float
    pension_withdrawal_priority: int
    assumptions: ArrayAssumptions


def build_array_scenario(*, scenario: SimulationScenario, returns: ReturnsMatrix) -> ArrayScenario:
    years = np.asarray(returns.years, dtype=np.int32)

    people_birth_years = np.array([p.birth_date.year for p in scenario.people], dtype=np.int32)
    people_retirement_ages = np.array(
        [p.planned_retirement_age if p.planned_retirement_age is not None else 999 for p in scenario.people],
        dtype=np.int32,
    )
    people_state_pension_ages = np.array(
        [p.state_pension_age if p.state_pension_age is not None else 999 for p in scenario.people],
        dtype=np.int32,
    )
    people_is_child = np.array([1 if p.is_child else 0 for p in scenario.people], dtype=np.int8)
    people_annual_cost = np.array([float(p.annual_cost) for p in scenario.people], dtype=np.float64)
    people_leaves_household_age = np.array([int(p.leaves_household_age) for p in scenario.people], dtype=np.int32)

    salary_rows = []
    for person_idx, person in enumerate(scenario.people):
        for salary in scenario.salary_by_person.get(person.key, []):
            salary_rows.append(
                (
                    person_idx,
                    float(salary.gross_annual),
                    float(salary.annual_growth_rate),
                    float(salary.employee_pension_pct),
                    float(salary.employer_pension_pct),
                    int(salary.start_year) if salary.start_year is not None else -1,
                    int(salary.end_year) if salary.end_year is not None else -1,
                )
            )
    if salary_rows:
        salary_arr = np.array(salary_rows, dtype=np.float64)
        salary_person_idx = salary_arr[:, 0].astype(np.int32)
        salary_gross_annual = salary_arr[:, 1]
        salary_growth_rate = salary_arr[:, 2]
        salary_employee_pct = salary_arr[:, 3]
        salary_employer_pct = salary_arr[:, 4]
        salary_start_year = salary_arr[:, 5].astype(np.int32)
        salary_end_year = salary_arr[:, 6].astype(np.int32)
    else:
        salary_person_idx = np.zeros(0, dtype=np.int32)
        salary_gross_annual = np.zeros(0, dtype=np.float64)
        salary_growth_rate = np.zeros(0, dtype=np.float64)
        salary_employee_pct = np.zeros(0, dtype=np.float64)
        salary_employer_pct = np.zeros(0, dtype=np.float64)
        salary_start_year = np.zeros(0, dtype=np.int32)
        salary_end_year = np.zeros(0, dtype=np.int32)

    # Build person key -> index mapping for rental/gift attribution
    person_key_to_idx = {p.key: i for i, p in enumerate(scenario.people)}

    rental_rows = [
        (
            float(r.gross_annual),
            float(r.annual_growth_rate),
            int(r.start_year) if r.start_year is not None else -1,
            int(r.end_year) if r.end_year is not None else -1,
        )
        for r in scenario.rental_incomes
    ]
    rental_person_idx = np.array(
        [person_key_to_idx.get(r.person_key, 0) if r.person_key else 0 for r in scenario.rental_incomes],
        dtype=np.int32,
    ) if scenario.rental_incomes else np.zeros(0, dtype=np.int32)
    if rental_rows:
        rental_arr = np.array(rental_rows, dtype=np.float64)
        rental_gross_annual = rental_arr[:, 0]
        rental_growth_rate = rental_arr[:, 1]
        rental_start_year = rental_arr[:, 2].astype(np.int32)
        rental_end_year = rental_arr[:, 3].astype(np.int32)
    else:
        rental_gross_annual = np.zeros(0, dtype=np.float64)
        rental_growth_rate = np.zeros(0, dtype=np.float64)
        rental_start_year = np.zeros(0, dtype=np.int32)
        rental_end_year = np.zeros(0, dtype=np.int32)

    gift_rows = [
        (
            float(g.gross_annual),
            float(g.annual_growth_rate),
            int(g.start_year) if g.start_year is not None else -1,
            int(g.end_year) if g.end_year is not None else -1,
        )
        for g in scenario.gift_incomes
    ]
    gift_person_idx = np.array(
        [person_key_to_idx.get(g.person_key, 0) if g.person_key else 0 for g in scenario.gift_incomes],
        dtype=np.int32,
    ) if scenario.gift_incomes else np.zeros(0, dtype=np.int32)
    if gift_rows:
        gift_arr = np.array(gift_rows, dtype=np.float64)
        gift_gross_annual = gift_arr[:, 0]
        gift_growth_rate = gift_arr[:, 1]
        gift_start_year = gift_arr[:, 2].astype(np.int32)
        gift_end_year = gift_arr[:, 3].astype(np.int32)
    else:
        gift_gross_annual = np.zeros(0, dtype=np.float64)
        gift_growth_rate = np.zeros(0, dtype=np.float64)
        gift_start_year = np.zeros(0, dtype=np.int32)
        gift_end_year = np.zeros(0, dtype=np.int32)

    assets = _scenario_assets_for_arrays(scenario=scenario)
    asset_names = [a.name for a in assets]
    asset_types = np.array([_asset_type_code(a.asset_type) for a in assets], dtype=np.int8)
    asset_withdrawal_priority = np.array([int(getattr(a, "withdrawal_priority", 0)) for a in assets], dtype=np.int32)
    asset_balances = np.array([float(getattr(a, "balance", 0.0)) for a in assets], dtype=np.float64)
    asset_cost_bases = np.array(
        [float(getattr(a, "cost_basis", getattr(a, "balance", 0.0))) for a in assets], dtype=np.float64
    )
    asset_annual_contrib = np.array([float(getattr(a, "annual_contribution", 0.0)) for a in assets], dtype=np.float64)
    asset_contrib_end_retirement = np.array(
        [1 if getattr(a, "contributions_end_at_retirement", False) else 0 for a in assets],
        dtype=np.int8,
    )
    # GIA owner: map each GIA asset to the person who owns it
    asset_gia_owner_idx = np.array(
        [person_key_to_idx.get(getattr(a, "person_key", None), -1)
         if _asset_type_code(getattr(a, "asset_type", "")) == 2 else -1
         for a in assets],
        dtype=np.int32,
    )

    properties = list(scenario.properties)
    property_names = [p.name for p in properties]
    property_person_idx = np.array(
        [person_key_to_idx.get(getattr(p, "person_key", None), 0) if getattr(p, "person_key", None) else 0 for p in properties],
        dtype=np.int32,
    ) if properties else np.zeros(0, dtype=np.int32)
    property_withdrawal_priority = np.array(
        [int(getattr(p, "withdrawal_priority", 0)) for p in properties], dtype=np.int32
    )
    property_values = np.array([float(getattr(p, "value", 0.0)) for p in properties], dtype=np.float64)
    property_cost_bases = np.array(
        [float(getattr(p, "cost_basis", getattr(p, "value", 0.0))) for p in properties],
        dtype=np.float64,
    )
    property_monthly_rental_income = np.array(
        [float(getattr(p, "monthly_rental_income", 0.0)) for p in properties], dtype=np.float64
    )
    property_rental_growth_rate = np.array(
        [float(getattr(p, "rental_growth_rate", 0.0)) for p in properties], dtype=np.float64
    )
    property_occupancy_rate = np.array(
        [float(getattr(p, "occupancy_rate", 0.0)) for p in properties], dtype=np.float64
    )
    property_mortgage_balance = np.array(
        [
            float(getattr(p, "value", 0.0)) * float(getattr(p, "mortgage_ltv", 0.0))
            for p in properties
        ],
        dtype=np.float64,
    )
    property_mortgage_rate = np.array(
        [float(getattr(p, "mortgage_rate", 0.0)) for p in properties], dtype=np.float64
    )
    property_mortgage_monthly_payment = np.array(
        [
            _property_monthly_payment(
                balance=float(getattr(p, "value", 0.0)) * float(getattr(p, "mortgage_ltv", 0.0)),
                annual_rate=float(getattr(p, "mortgage_rate", 0.0)),
                term_years=int(getattr(p, "mortgage_term_years", 0) or 0),
            )
            for p in properties
        ],
        dtype=np.float64,
    )
    property_annual_maintenance_cost = np.array(
        [float(getattr(p, "annual_maintenance_cost", 0.0)) for p in properties], dtype=np.float64
    )
    property_maintenance_is_inflation_linked = np.array(
        [1 if getattr(p, "maintenance_is_inflation_linked", True) else 0 for p in properties],
        dtype=np.int8,
    )

    pension_keys = list(returns.pension_keys)
    pension_person_idx = np.array(
        [next((i for i, p in enumerate(scenario.people) if p.key == key), -1) for key in pension_keys],
        dtype=np.int32,
    )
    pension_balances = np.array(
        [float(scenario.pension_by_person[key].balance) for key in pension_keys],
        dtype=np.float64,
    )

    expense_annual_amount = np.array([float(e.annual_amount) for e in scenario.expenses], dtype=np.float64)
    expense_is_inflation_linked = np.array(
        [1 if e.is_inflation_linked else 0 for e in scenario.expenses], dtype=np.int8
    )

    a = scenario.assumptions
    assumptions = ArrayAssumptions(
        inflation_rate=float(a.inflation_rate),
        isa_annual_limit=float(a.isa_annual_limit),
        state_pension_annual=float(a.state_pension_annual),
        cgt_annual_allowance=float(a.cgt_annual_allowance),
        emergency_fund_months=float(a.emergency_fund_months),
        pension_access_age=int(a.pension_access_age),
        debt_interest_rate=float(a.debt_interest_rate),
        bankruptcy_threshold=float(a.bankruptcy_threshold),
        # P1.5/P1.6: Pension rules
        pension_annual_allowance=float(getattr(a, "pension_annual_allowance", 60_000.0)),
        pension_lump_sum_allowance=float(getattr(a, "pension_lump_sum_allowance", 26_100.0)),
        pension_tapered_threshold=float(getattr(a, "pension_tapered_threshold", 260_000.0)),
        pension_tapered_reduction_rate=float(getattr(a, "pension_tapered_reduction_rate", 0.5)),
        pension_minimum_allowance=float(getattr(a, "pension_minimum_allowance", 10_000.0)),
        mpaa_annual_allowance=float(getattr(a, "mpaa_annual_allowance", 10_000.0)),
        # Tax bands
        personal_allowance=float(a.personal_allowance),
        basic_rate_limit=float(a.basic_rate_limit),
        higher_rate_limit=float(a.higher_rate_limit),
        basic_rate=float(a.basic_rate),
        higher_rate=float(a.higher_rate),
        additional_rate=float(a.additional_rate),
        ni_primary_threshold=float(a.ni_primary_threshold),
        ni_upper_earnings_limit=float(a.ni_upper_earnings_limit),
        ni_main_rate=float(a.ni_main_rate),
        ni_upper_rate=float(a.ni_upper_rate),
    )

    return ArrayScenario(
        years=years,
        people_birth_years=people_birth_years,
        people_retirement_ages=people_retirement_ages,
        people_state_pension_ages=people_state_pension_ages,
        people_is_child=people_is_child,
        people_annual_cost=people_annual_cost,
        people_leaves_household_age=people_leaves_household_age,
        salary_person_idx=salary_person_idx,
        salary_gross_annual=salary_gross_annual,
        salary_growth_rate=salary_growth_rate,
        salary_employee_pct=salary_employee_pct,
        salary_employer_pct=salary_employer_pct,
        salary_start_year=salary_start_year,
        salary_end_year=salary_end_year,
        rental_person_idx=rental_person_idx,
        rental_gross_annual=rental_gross_annual,
        rental_growth_rate=rental_growth_rate,
        rental_start_year=rental_start_year,
        rental_end_year=rental_end_year,
        gift_person_idx=gift_person_idx,
        gift_gross_annual=gift_gross_annual,
        gift_growth_rate=gift_growth_rate,
        gift_start_year=gift_start_year,
        gift_end_year=gift_end_year,
        asset_types=asset_types,
        asset_withdrawal_priority=asset_withdrawal_priority,
        asset_balances=asset_balances,
        asset_cost_bases=asset_cost_bases,
        asset_annual_contrib=asset_annual_contrib,
        asset_contrib_end_retirement=asset_contrib_end_retirement,
        asset_names=asset_names,
        asset_gia_owner_idx=asset_gia_owner_idx,
        property_person_idx=property_person_idx,
        property_withdrawal_priority=property_withdrawal_priority,
        property_values=property_values,
        property_cost_bases=property_cost_bases,
        property_monthly_rental_income=property_monthly_rental_income,
        property_rental_growth_rate=property_rental_growth_rate,
        property_occupancy_rate=property_occupancy_rate,
        property_mortgage_balance=property_mortgage_balance,
        property_mortgage_rate=property_mortgage_rate,
        property_mortgage_monthly_payment=property_mortgage_monthly_payment,
        property_annual_maintenance_cost=property_annual_maintenance_cost,
        property_maintenance_is_inflation_linked=property_maintenance_is_inflation_linked,
        property_names=property_names,
        pension_person_idx=pension_person_idx,
        pension_balances=pension_balances,
        pension_keys=pension_keys,
        expense_annual_amount=expense_annual_amount,
        expense_is_inflation_linked=expense_is_inflation_linked,
        annual_spend_target=float(scenario.annual_spend_target),
        pension_withdrawal_priority=int(scenario.pension_withdrawal_priority),
        assumptions=assumptions,
    )


def _asset_type_code(asset_type: str) -> int:
    asset_type_upper = (asset_type or "").upper()
    if asset_type_upper == "CASH":
        return 0
    if asset_type_upper == "ISA":
        return 1
    if asset_type_upper == "GIA":
        return 2
    return 3


def _scenario_assets_for_arrays(*, scenario: SimulationScenario) -> list[object]:
    assets = list(scenario.assets)
    if not any(getattr(a, "asset_type", None) == "CASH" for a in assets):
        assets = assets + [
            type(
                "CashStub",
                (),
                {
                    "name": "Cash",
                    "asset_type": "CASH",
                    "withdrawal_priority": 0,
                    "balance": 0.0,
                    "annual_contribution": 0.0,
                    "contributions_end_at_retirement": False,
                    "person_key": None,
                    "cost_basis": 0.0,
                },
            )()
        ]
    return assets


def _property_monthly_payment(*, balance: float, annual_rate: float, term_years: int) -> float:
    if balance <= 0.0 or annual_rate < 0.0:
        return 0.0

    monthly_rate = annual_rate / 12.0
    if term_years <= 0:
        return balance * monthly_rate

    n_periods = term_years * 12
    if monthly_rate == 0.0:
        return balance / float(n_periods) if n_periods > 0 else 0.0

    growth = (1.0 + monthly_rate) ** n_periods
    return balance * monthly_rate * growth / (growth - 1.0)
