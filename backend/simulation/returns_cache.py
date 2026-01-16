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
    asset_means = np.array([float(getattr(a, "growth_rate_mean", 0.0)) for a in assets], dtype=np.float64)
    asset_stds = np.array([float(getattr(a, "growth_rate_std", 0.0)) for a in assets], dtype=np.float64)

    # Broadcast normals per asset.
    # (iterations, years, assets)
    asset_returns = rng.normal(
        loc=asset_means.reshape(1, 1, -1),
        scale=asset_stds.reshape(1, 1, -1),
        size=(iterations, n_years, int(asset_means.shape[0])),
    ).astype(np.float64)

    # Pensions: model per-person (keyed) returns using each pension's configured growth rates.
    pension_keys = sorted(list(scenario.pension_by_person.keys()))
    if pension_keys:
        pension_means = np.array(
            [float(scenario.pension_by_person[k].growth_rate_mean) for k in pension_keys], dtype=np.float64
        )
        pension_stds = np.array(
            [float(scenario.pension_by_person[k].growth_rate_std) for k in pension_keys], dtype=np.float64
        )
        initial_pension_balances = np.array(
            [float(scenario.pension_by_person[k].balance) for k in pension_keys], dtype=np.float64
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

