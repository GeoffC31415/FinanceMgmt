from __future__ import annotations

from dataclasses import dataclass
from time import monotonic
from typing import Any
from uuid import uuid4

import numpy as np

from backend.simulation.engine import SimulationScenario


@dataclass(frozen=True)
class ReturnsMatrix:
    """
    Pre-generated stochastic inputs for the simulation.

    Shapes:
    - years: (n_years,)
    - asset_returns: (iterations, n_years, n_assets)
    - pension_returns: (iterations, n_years, n_pensions)
    """

    years: np.ndarray
    asset_names: list[str]
    asset_types: np.ndarray
    asset_withdrawal_priority: np.ndarray
    initial_asset_balances: np.ndarray
    initial_asset_cost_bases: np.ndarray
    asset_returns: np.ndarray
    property_names: list[str]
    property_person_keys: list[str | None]
    property_withdrawal_priority: np.ndarray
    initial_property_values: np.ndarray
    initial_property_cost_bases: np.ndarray
    property_returns: np.ndarray
    pension_keys: list[str]
    initial_pension_balances: np.ndarray
    pension_returns: np.ndarray

    @property
    def iterations(self) -> int:
        return int(self.asset_returns.shape[0])

    @property
    def n_years(self) -> int:
        return int(self.asset_returns.shape[1])


@dataclass(frozen=True)
class CachedSession:
    created_at_s: float
    scenario_id: str
    base_scenario: SimulationScenario
    returns: ReturnsMatrix


_CACHE: dict[str, CachedSession] = {}


def _now_s() -> float:
    return monotonic()


def _purge_expired(*, ttl_s: float) -> None:
    if ttl_s <= 0:
        return
    now_s = _now_s()
    expired_keys = [k for k, v in _CACHE.items() if (now_s - v.created_at_s) > ttl_s]
    for k in expired_keys:
        _CACHE.pop(k, None)


def create_session(
    *,
    scenario_id: str,
    base_scenario: SimulationScenario,
    iterations: int,
    seed: int,
    ttl_s: float = 30 * 60,
) -> str:
    _purge_expired(ttl_s=ttl_s)
    session_id = str(uuid4())
    returns = generate_returns_matrix(scenario=base_scenario, iterations=iterations, seed=seed)
    _CACHE[session_id] = CachedSession(
        created_at_s=_now_s(),
        scenario_id=scenario_id,
        base_scenario=base_scenario,
        returns=returns,
    )
    return session_id


def get_session(*, session_id: str, ttl_s: float = 30 * 60) -> CachedSession | None:
    _purge_expired(ttl_s=ttl_s)
    session = _CACHE.get(session_id)
    if session is None:
        return None
    if ttl_s > 0 and (_now_s() - session.created_at_s) > ttl_s:
        _CACHE.pop(session_id, None)
        return None
    return session


def delete_session(*, session_id: str) -> None:
    _CACHE.pop(session_id, None)


def _scenario_assets_for_returns(*, scenario: SimulationScenario) -> list[Any]:
    """
    Mirror the engine's behavior: ensure we have at least one CASH asset.
    We don't mutate the incoming scenario; this is only for naming/shape.
    """
    assets = list(scenario.assets)
    if not any(getattr(a, "asset_type", None) == "CASH" for a in assets):
        assets = assets + [
            # minimal stub with expected attributes
            type(
                "CashStub",
                (),
                {
                    "name": "Cash",
                    "asset_type": "CASH",
                    "withdrawal_priority": 0,
                    "balance": 0.0,
                    "cost_basis": 0.0,
                },
            )()  # type: ignore[misc]
        ]
    return assets


def _block_bootstrap_indices(
    rng: np.random.Generator,
    n_historical: int,
    n_years: int,
    iterations: int,
    mean_block_length: int = 10,
) -> np.ndarray:
    """Stationary block bootstrap: contiguous blocks with geometric block lengths.

    For each iteration, picks a random start index into the historical data and
    advances contiguously. When a block expires (geometric distribution with the
    given mean), a new random start is chosen. This preserves multi-year
    bull/bear sequences while providing unique paths across iterations.
    """
    indices = np.empty((iterations, n_years), dtype=np.int64)
    p = 1.0 / mean_block_length
    for it in range(iterations):
        start = int(rng.integers(0, n_historical))
        block_remaining = int(rng.geometric(p))
        for y in range(n_years):
            indices[it, y] = start % n_historical
            start += 1
            block_remaining -= 1
            if block_remaining <= 0:
                start = int(rng.integers(0, n_historical))
                block_remaining = int(rng.geometric(p))
    return indices


def generate_returns_matrix(*, scenario: SimulationScenario, iterations: int, seed: int) -> ReturnsMatrix:
    """
    Generate all stochastic draws for a scenario up-front.

    Important: this precomputes ONLY investment return random draws. Other
    scenario dynamics (salary growth, inflation-linking, withdrawals) remain
    deterministic and will be recomputed on each recalculation.
    """
    years = np.arange(scenario.start_year, scenario.end_year + 1, dtype=np.int32)
    n_years = int(years.shape[0])

    rng = np.random.default_rng(seed)

    # Assets (including CASH if absent; CASH should have zero growth in the engine anyway).
    assets = _scenario_assets_for_returns(scenario=scenario)
    asset_names = [str(getattr(a, "name", "")) for a in assets]
    asset_types = np.array(
        [_asset_type_code(str(getattr(a, "asset_type", ""))) for a in assets],
        dtype=np.int8,
    )
    asset_withdrawal_priority = np.array(
        [int(getattr(a, "withdrawal_priority", 0)) for a in assets], dtype=np.int32
    )
    initial_asset_balances = np.array(
        [float(getattr(a, "balance", 0.0)) for a in assets], dtype=np.float64
    )
    initial_asset_cost_bases = np.array(
        [float(getattr(a, "cost_basis", getattr(a, "balance", 0.0))) for a in assets],
        dtype=np.float64,
    )
    n_assets = len(assets)
    use_bootstrap = scenario.assumptions.return_model == "historical_bootstrap"

    if use_bootstrap:
        from backend.simulation.historical_returns import get_aligned_equity_bond_returns
        historical_equity, historical_bonds = get_aligned_equity_bond_returns()

        # Use block bootstrap for temporally-correlated sampling
        # Both arrays are aligned to the same overlapping year range
        year_indices = _block_bootstrap_indices(rng, len(historical_equity), n_years, iterations)
        shared_equity_returns = historical_equity[year_indices]  # (iterations, n_years)
        shared_bond_returns = historical_bonds[year_indices]  # same indices for correlation

        asset_returns = np.zeros((iterations, n_years, n_assets), dtype=np.float64)
        for i in range(n_assets):
            asset_type_str = str(getattr(assets[i], "asset_type", "")).upper()
            if asset_type_str == "CASH":
                pass  # stays zero
            else:
                bond_pct = float(getattr(assets[i], "bond_allocation", 0.0))
                asset_returns[:, :, i] = (
                    shared_equity_returns * (1.0 - bond_pct) + shared_bond_returns * bond_pct
                )
    else:
        asset_means = np.array([float(getattr(a, "growth_rate_mean", 0.0)) for a in assets], dtype=np.float64)
        asset_stds = np.array([float(getattr(a, "growth_rate_std", 0.0)) for a in assets], dtype=np.float64)

        # Broadcast normals per asset.
        # (iterations, years, assets)
        asset_returns = rng.normal(
            loc=asset_means.reshape(1, 1, -1),
            scale=asset_stds.reshape(1, 1, -1),
            size=(iterations, n_years, n_assets),
        ).astype(np.float64)

    properties = list(scenario.properties)
    property_names = [str(getattr(p, "name", "")) for p in properties]
    property_person_keys = [getattr(p, "person_key", None) for p in properties]
    property_withdrawal_priority = np.array(
        [int(getattr(p, "withdrawal_priority", 0)) for p in properties], dtype=np.int32
    )
    initial_property_values = np.array(
        [float(getattr(p, "value", 0.0)) for p in properties], dtype=np.float64
    )
    initial_property_cost_bases = np.array(
        [float(getattr(p, "cost_basis", getattr(p, "value", 0.0))) for p in properties],
        dtype=np.float64,
    )
    property_means = np.array(
        [float(getattr(p, "appreciation_rate_mean", 0.0)) for p in properties], dtype=np.float64
    )
    property_stds = np.array(
        [float(getattr(p, "appreciation_rate_std", 0.0)) for p in properties], dtype=np.float64
    )
    if len(properties):
        property_returns = rng.normal(
            loc=property_means.reshape(1, 1, -1),
            scale=property_stds.reshape(1, 1, -1),
            size=(iterations, n_years, len(properties)),
        ).astype(np.float64)
    else:
        property_returns = np.zeros((iterations, n_years, 0), dtype=np.float64)

    # Pensions: model per-person (keyed) returns using each pension's configured growth rates.
    pension_keys = sorted(list(scenario.pension_by_person.keys()))
    if pension_keys:
        initial_pension_balances = np.array(
            [float(scenario.pension_by_person[k].balance) for k in pension_keys], dtype=np.float64
        )

        if use_bootstrap:
            pension_returns = np.zeros((iterations, n_years, len(pension_keys)), dtype=np.float64)
            for i, k in enumerate(pension_keys):
                bond_pct = float(getattr(scenario.pension_by_person[k], "bond_allocation", 0.0))
                pension_returns[:, :, i] = (
                    shared_equity_returns * (1.0 - bond_pct) + shared_bond_returns * bond_pct
                )
        else:
            pension_means = np.array(
                [float(scenario.pension_by_person[k].growth_rate_mean) for k in pension_keys], dtype=np.float64
            )
            pension_stds = np.array(
                [float(scenario.pension_by_person[k].growth_rate_std) for k in pension_keys], dtype=np.float64
            )
            pension_returns = rng.normal(
                loc=pension_means.reshape(1, 1, -1),
                scale=pension_stds.reshape(1, 1, -1),
                size=(iterations, n_years, len(pension_keys)),
            ).astype(np.float64)
    else:
        pension_returns = np.zeros((iterations, n_years, 0), dtype=np.float64)
        initial_pension_balances = np.zeros(0, dtype=np.float64)

    return ReturnsMatrix(
        years=years,
        asset_names=asset_names,
        asset_types=asset_types,
        asset_withdrawal_priority=asset_withdrawal_priority,
        initial_asset_balances=initial_asset_balances,
        initial_asset_cost_bases=initial_asset_cost_bases,
        asset_returns=asset_returns,
        property_names=property_names,
        property_person_keys=property_person_keys,
        property_withdrawal_priority=property_withdrawal_priority,
        initial_property_values=initial_property_values,
        initial_property_cost_bases=initial_property_cost_bases,
        property_returns=property_returns,
        pension_keys=pension_keys,
        initial_pension_balances=initial_pension_balances,
        pension_returns=pension_returns,
    )


def generate_returns_matrix_with_bond_override(
    *,
    scenario: SimulationScenario,
    iterations: int,
    seed: int,
    bond_pct_by_class: dict[str, float],
) -> ReturnsMatrix:
    """Generate returns matrix with per-asset-class bond allocation overrides.

    bond_pct_by_class maps asset class names (ISA, GIA, PENSION) to a bond
    fraction (0.0-1.0). Classes not in the dict keep their configured
    bond_allocation.
    """
    years = np.arange(scenario.start_year, scenario.end_year + 1, dtype=np.int32)
    n_years = int(years.shape[0])

    rng = np.random.default_rng(seed)

    assets = _scenario_assets_for_returns(scenario=scenario)
    asset_names = [str(getattr(a, "name", "")) for a in assets]
    asset_types = np.array(
        [_asset_type_code(str(getattr(a, "asset_type", ""))) for a in assets],
        dtype=np.int8,
    )
    asset_withdrawal_priority = np.array(
        [int(getattr(a, "withdrawal_priority", 0)) for a in assets], dtype=np.int32
    )
    initial_asset_balances = np.array(
        [float(getattr(a, "balance", 0.0)) for a in assets], dtype=np.float64
    )
    initial_asset_cost_bases = np.array(
        [float(getattr(a, "cost_basis", getattr(a, "balance", 0.0))) for a in assets],
        dtype=np.float64,
    )
    n_assets = len(assets)

    from backend.simulation.historical_returns import get_aligned_equity_bond_returns
    historical_equity, historical_bonds = get_aligned_equity_bond_returns()

    year_indices = _block_bootstrap_indices(rng, len(historical_equity), n_years, iterations)
    shared_equity_returns = historical_equity[year_indices]
    shared_bond_returns = historical_bonds[year_indices]

    asset_returns = np.zeros((iterations, n_years, n_assets), dtype=np.float64)
    for i in range(n_assets):
        asset_type_str = str(getattr(assets[i], "asset_type", "")).upper()
        if asset_type_str == "CASH":
            pass
        else:
            bond_pct = bond_pct_by_class.get(
                asset_type_str,
                float(getattr(assets[i], "bond_allocation", 0.0)),
            )
            asset_returns[:, :, i] = (
                shared_equity_returns * (1.0 - bond_pct) + shared_bond_returns * bond_pct
            )

    properties = list(scenario.properties)
    property_names = [str(getattr(p, "name", "")) for p in properties]
    property_person_keys = [getattr(p, "person_key", None) for p in properties]
    property_withdrawal_priority = np.array(
        [int(getattr(p, "withdrawal_priority", 0)) for p in properties], dtype=np.int32
    )
    initial_property_values = np.array(
        [float(getattr(p, "value", 0.0)) for p in properties], dtype=np.float64
    )
    initial_property_cost_bases = np.array(
        [float(getattr(p, "cost_basis", getattr(p, "value", 0.0))) for p in properties],
        dtype=np.float64,
    )
    property_means = np.array(
        [float(getattr(p, "appreciation_rate_mean", 0.0)) for p in properties], dtype=np.float64
    )
    property_stds = np.array(
        [float(getattr(p, "appreciation_rate_std", 0.0)) for p in properties], dtype=np.float64
    )
    if len(properties):
        property_returns = rng.normal(
            loc=property_means.reshape(1, 1, -1),
            scale=property_stds.reshape(1, 1, -1),
            size=(iterations, n_years, len(properties)),
        ).astype(np.float64)
    else:
        property_returns = np.zeros((iterations, n_years, 0), dtype=np.float64)

    pension_keys = sorted(list(scenario.pension_by_person.keys()))
    if pension_keys:
        initial_pension_balances = np.array(
            [float(scenario.pension_by_person[k].balance) for k in pension_keys], dtype=np.float64
        )
        pension_bond_pct = bond_pct_by_class.get(
            "PENSION",
            float(getattr(
                next(iter(scenario.pension_by_person.values())), "bond_allocation", 0.0
            )),
        )
        pension_returns = np.zeros((iterations, n_years, len(pension_keys)), dtype=np.float64)
        for i in range(len(pension_keys)):
            pension_returns[:, :, i] = (
                shared_equity_returns * (1.0 - pension_bond_pct)
                + shared_bond_returns * pension_bond_pct
            )
    else:
        pension_returns = np.zeros((iterations, n_years, 0), dtype=np.float64)
        initial_pension_balances = np.zeros(0, dtype=np.float64)

    return ReturnsMatrix(
        years=years,
        asset_names=asset_names,
        asset_types=asset_types,
        asset_withdrawal_priority=asset_withdrawal_priority,
        initial_asset_balances=initial_asset_balances,
        initial_asset_cost_bases=initial_asset_cost_bases,
        asset_returns=asset_returns,
        property_names=property_names,
        property_person_keys=property_person_keys,
        property_withdrawal_priority=property_withdrawal_priority,
        initial_property_values=initial_property_values,
        initial_property_cost_bases=initial_property_cost_bases,
        property_returns=property_returns,
        pension_keys=pension_keys,
        initial_pension_balances=initial_pension_balances,
        pension_returns=pension_returns,
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

