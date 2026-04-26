"""Bond sweep service — bond allocation optimization logic.

Extracted from routers/simulation.py to separate the combinatorial sweep
algorithm from the HTTP routing layer.
"""
from __future__ import annotations

import asyncio
import itertools
import logging
from typing import Any

import numpy as np

from backend.schemas.simulation import BondCombo, BondSweepRequest, BondSweepResponse, MarginalCurve, MarginalPoint
from backend.simulation.service import ScenarioBuilder
from backend.simulation.engine import SimulationScenario
from backend.simulation.engine_fast import run_simulation
from backend.simulation.returns_cache import generate_returns_matrix_with_bond_override
from backend.simulation.sweep_progress import SweepProgressStore

logger = logging.getLogger(__name__)

# Running asyncio Tasks keyed by session_id (in-memory only; can't persist across restarts)
_SWEEP_TASKS: dict[str, asyncio.Task] = {}

# Lock for thread-safe task tracking
_SWEEP_LOCK = asyncio.Lock()

# Persistent progress store (file-backed)
_sweep_progress: SweepProgressStore | None = None


def initialize_sweep_progress(progress_file: str | None = None) -> SweepProgressStore:
    """Set the sweep progress store (called once at app startup)."""
    global _sweep_progress
    _sweep_progress = SweepProgressStore(progress_file)
    return _sweep_progress


def _get_sweep_progress() -> SweepProgressStore:
    """Return the active sweep progress store."""
    global _sweep_progress
    if _sweep_progress is None:
        _sweep_progress = SweepProgressStore()
    return _sweep_progress


async def _get_progress(session_id: str) -> dict:
    """Get sweep progress (async-safe, file-backed)."""
    store = _get_sweep_progress()
    return await store.get_progress(session_id)


async def _set_progress(session_id: str, completed: int, total: int, phase: str) -> None:
    """Set sweep progress (async-safe, file-backed)."""
    store = _get_sweep_progress()
    await store.set_progress(session_id, completed, total, phase)


async def _is_cancelled(session_id: str) -> bool:
    """Check if a sweep has been cancelled (file-backed)."""
    store = _get_sweep_progress()
    return await store.is_cancelled(session_id)


async def _cancel_sweep(session_id: str) -> None:
    """Cancel a running bond sweep by session_id."""
    store = _get_sweep_progress()
    await store.cancel(session_id)

    # Cancel the asyncio Task if it exists
    task = _SWEEP_TASKS.pop(session_id, None)
    if task and not task.done():
        task.cancel()
        logger.info("Bond sweep cancelled for session %s", session_id)


async def _store_task(session_id: str, task: asyncio.Task) -> None:
    """Store the running task for later cancellation."""
    async with _SWEEP_LOCK:
        _SWEEP_TASKS[session_id] = task


async def _cleanup_task(session_id: str) -> None:
    """Remove a task from tracking after it completes."""
    async with _SWEEP_LOCK:
        _SWEEP_TASKS.pop(session_id, None)


async def _cleanup_progress(session_id: str) -> None:
    """Remove progress data for a completed/cancelled sweep."""
    store = _get_sweep_progress()
    await store.remove(session_id)


class BondSweepService:
    """Run a bond allocation optimization sweep.

    Three rounds: coarse (25%) → refining (5%) → fine (1%), each with
    a fixed number of combos per active asset class.
    """

    @staticmethod
    async def progress(session_id: str) -> dict:
        return await _get_progress(session_id)

    @staticmethod
    async def cancel(session_id: str) -> dict:
        """Cancel a running bond sweep."""
        await _cancel_sweep(session_id)
        return {"status": "cancelled", "session_id": session_id}

    @staticmethod
    def run(payload: BondSweepRequest) -> BondSweepResponse:
        """Synchronous bond sweep (for testing / direct calls)."""
        return BondSweepService._run_sweep(payload)

    @staticmethod
    async def run_async(payload: BondSweepRequest) -> BondSweepResponse:
        """Asynchronous bond sweep that supports cancellation.

        Runs the sweep in a background task and checks for cancellation
        between each combo. Returns partial results if cancelled.
        """
        from backend.simulation.returns_cache import get_session
        from fastapi import HTTPException

        sid = payload.session_id

        # Initialize progress
        await _set_progress(sid, 0, 0, "Initializing...")
        await _store_task(sid, asyncio.current_task())

        try:
            cached = await get_session(session_id=sid)
            if cached is None:
                raise HTTPException(status_code=404, detail="Simulation session not found (expired?)")

            base = cached.base_scenario
            if base.assumptions.return_model != "historical_bootstrap":
                raise HTTPException(status_code=400, detail="Bond sweep requires historical_bootstrap return model")

            sim_scenario_base = ScenarioBuilder.build_variant(
                base=base,
                annual_spend_target=base.annual_spend_target,
                retirement_age_offset=int(payload.retirement_age_offset),
            )
            years = cached.returns.years
            if years.size == 0:
                raise HTTPException(status_code=400, detail="No simulation years available for bond sweep")

            if payload.target_year is None:
                target_year_index = int(years.size - 1)
            else:
                target_year_index = int(np.searchsorted(years, int(payload.target_year)))
                target_year_index = max(0, min(target_year_index, int(years.size - 1)))
            target_year = int(years[target_year_index])

            all_classes = ["ISA", "GIA", "PENSION"]
            active_classes = [c for c in all_classes if _scenario_has_asset_class(sim_scenario_base, c)]

            results: list[BondCombo] = []
            total_completed = 0
            active_count = len(active_classes)
            total_sim_runs = (5 ** active_count) + (5 ** active_count) + (7 ** active_count)
            max_combos = payload.max_combos  # None = unlimited

            def _grid_for_class(cls: str, values: list[float]) -> list[float]:
                return values if cls in active_classes else [0.0]

            async def _run_round(
                phase: str,
                isa_vals: list[float],
                gia_vals: list[float],
                pen_vals: list[float],
            ) -> bool:
                """Run a round of combos. Returns True if round completed, False if capped/cancelled."""
                nonlocal total_completed
                combos = [(i, g, p) for i, g, p in itertools.product(isa_vals, gia_vals, pen_vals)]
                round_count = len(combos)
                await _set_progress(sid, total_completed, total_sim_runs, phase)
                for idx, (isa, gia, pen) in enumerate(combos):
                    # Check max_combos cap
                    if max_combos is not None and total_completed >= max_combos:
                        logger.info("Bond sweep capped at %d combos", max_combos)
                        return False
                    results.append(_run_combo(
                        isa_pct=isa, gia_pct=gia, pen_pct=pen,
                        active_classes=active_classes,
                        sim_scenario_base=sim_scenario_base,
                        iterations=cached.returns.iterations,
                        risk_threshold=float(payload.risk_threshold),
                        target_year_index=target_year_index,
                        max_spend=float(payload.max_spend),
                    ))
                    await _set_progress(sid, total_completed + idx + 1, total_sim_runs, phase)
                    # Check for cancellation after each combo
                    if await _is_cancelled(sid):
                        logger.info("Bond sweep cancelled at %d/%d combos", total_completed + idx + 1, total_sim_runs)
                        return False
                total_completed += round_count
                return True



            def _range_around(center: float, pad: float, step: float) -> list[float]:
                count = int((2 * pad) / step) + 1
                min_start = 0.0
                max_start = 100.0 - (step * (count - 1))
                start = min(max(center - pad, min_start), max_start)
                return [round(start + (step * idx), 2) for idx in range(count)]

            # Round 1: 25% coarse scan
            coarse = [0.0, 25.0, 50.0, 75.0, 100.0]
            done = await _run_round(
                phase="Coarse scan (25% steps)",
                isa_vals=_grid_for_class("ISA", coarse),
                gia_vals=_grid_for_class("GIA", coarse),
                pen_vals=_grid_for_class("PENSION", coarse),
            )

            # Round 2: 5% medium scan around best point
            if done and results:
                best = _find_best_point(results)
                done = await _run_round(
                    phase="Refining (5% steps)",
                    isa_vals=_grid_for_class("ISA", _range_around(best.isa_bond_pct, 10, 5)),
                    gia_vals=_grid_for_class("GIA", _range_around(best.gia_bond_pct, 10, 5)),
                    pen_vals=_grid_for_class("PENSION", _range_around(best.pension_bond_pct, 10, 5)),
                )

            # Round 3: 1% fine scan around refined best
            if done and results:
                best = _find_best_point(results)
                await _run_round(
                    phase="Fine-tuning (1% steps)",
                    isa_vals=_grid_for_class("ISA", _range_around(best.isa_bond_pct, 3, 1)),
                    gia_vals=_grid_for_class("GIA", _range_around(best.gia_bond_pct, 3, 1)),
                    pen_vals=_grid_for_class("PENSION", _range_around(best.pension_bond_pct, 3, 1)),
                )

            # Clean up progress
            await _cleanup_progress(sid)
            await _cleanup_task(sid)

            # Deduplicate results
            unique_results_by_combo: dict[tuple[float, float, float], BondCombo] = {}
            for combo in results:
                combo_key = (combo.isa_bond_pct, combo.gia_bond_pct, combo.pension_bond_pct)
                unique_results_by_combo[combo_key] = combo
            unique_results = list(unique_results_by_combo.values())

            optimal = _find_best_point(unique_results)
            ranked = sorted(unique_results, key=lambda r: (-r.max_safe_fun_fund, r.bankruptcy_pct))[:10]

            # Build marginal curves from the coarse round
            marginals: list[MarginalCurve] = []
            class_pct_field = {"ISA": "isa_bond_pct", "GIA": "gia_bond_pct", "PENSION": "pension_bond_pct"}
            for cls in active_classes:
                field = class_pct_field[cls]
                points: list[MarginalPoint] = []
                all_pct_vals = sorted({getattr(r, field) for r in unique_results})
                for pct_val in all_pct_vals:
                    matching = [r for r in unique_results if getattr(r, field) == pct_val]
                    if not matching:
                        continue
                    avg_bank = float(np.mean([r.bankruptcy_pct for r in matching]))
                    avg_fun_fund = float(np.mean([r.max_safe_fun_fund for r in matching]))
                    min_bank = float(min(r.bankruptcy_pct for r in matching))
                    best_fun_fund = float(max(r.max_safe_fun_fund for r in matching))
                    points.append(MarginalPoint(
                        bond_pct=float(pct_val),
                        avg_bankruptcy_pct=round(avg_bank, 2),
                        avg_max_fun_fund=round(avg_fun_fund, 2),
                        min_bankruptcy_pct=round(min_bank, 2),
                        best_max_fun_fund=round(best_fun_fund, 2),
                    ))
                marginals.append(MarginalCurve(asset_class=cls, points=points))

            return BondSweepResponse(
                asset_classes=active_classes,
                optimal=optimal,
                top_combos=ranked,
                marginals=marginals,
                target_year=target_year,
                total_combos_tested=len(results),
            )

        except asyncio.CancelledError:
            await _cleanup_progress(sid)
            await _cleanup_task(sid)
            raise
        except HTTPException:
            await _cleanup_progress(sid)
            await _cleanup_task(sid)
            raise
        except Exception as exc:
            await _cleanup_progress(sid)
            await _cleanup_task(sid)
            logger.exception("Bond sweep failed for session %s: %s", sid, exc)
            raise

    @staticmethod
    def _run_sweep(payload: BondSweepRequest) -> BondSweepResponse:
        """Core sweep logic (used by both sync and async paths)."""
        from backend.simulation.returns_cache import get_session_sync
        from fastapi import HTTPException

        cached = get_session_sync(session_id=payload.session_id)
        if cached is None:
            raise HTTPException(status_code=404, detail="Simulation session not found (expired?)")

        base = cached.base_scenario
        if base.assumptions.return_model != "historical_bootstrap":
            raise HTTPException(status_code=400, detail="Bond sweep requires historical_bootstrap return model")

        sim_scenario_base = ScenarioBuilder.build_variant(
            base=base,
            annual_spend_target=base.annual_spend_target,
            retirement_age_offset=int(payload.retirement_age_offset),
        )
        years = cached.returns.years
        if years.size == 0:
            raise HTTPException(status_code=400, detail="No simulation years available for bond sweep")

        if payload.target_year is None:
            target_year_index = int(years.size - 1)
        else:
            target_year_index = int(np.searchsorted(years, int(payload.target_year)))
            target_year_index = max(0, min(target_year_index, int(years.size - 1)))
        target_year = int(years[target_year_index])

        all_classes = ["ISA", "GIA", "PENSION"]
        active_classes = [c for c in all_classes if _scenario_has_asset_class(sim_scenario_base, c)]

        sid = payload.session_id
        results: list[BondCombo] = []
        total_completed = 0
        active_count = len(active_classes)
        total_sim_runs = (5 ** active_count) + (5 ** active_count) + (7 ** active_count)
        max_combos = payload.max_combos  # None = unlimited

        def _grid_for_class(cls: str, values: list[float]) -> list[float]:
            return values if cls in active_classes else [0.0]

        def _run_round(
            phase: str,
            isa_vals: list[float],
            gia_vals: list[float],
            pen_vals: list[float],
        ) -> bool:
            """Run a round of combos. Returns True if completed, False if capped."""
            nonlocal total_completed
            combos = [(i, g, p) for i, g, p in itertools.product(isa_vals, gia_vals, pen_vals)]
            round_count = len(combos)
            _get_sweep_progress().set_progress_sync(sid, total_completed, total_sim_runs, phase)
            for idx, (isa, gia, pen) in enumerate(combos):
                # Check max_combos cap
                if max_combos is not None and total_completed >= max_combos:
                    logger.info("Bond sweep capped at %d combos", max_combos)
                    return False
                results.append(_run_combo(
                    isa_pct=isa, gia_pct=gia, pen_pct=pen,
                    active_classes=active_classes,
                    sim_scenario_base=sim_scenario_base,
                    iterations=cached.returns.iterations,
                    risk_threshold=float(payload.risk_threshold),
                    target_year_index=target_year_index,
                    max_spend=float(payload.max_spend),
                ))
                _get_sweep_progress().set_progress_sync(
                    sid, total_completed + idx + 1, total_sim_runs, phase
                )
            total_completed += round_count
            return True

        def _range_around(center: float, pad: float, step: float) -> list[float]:
            count = int((2 * pad) / step) + 1
            min_start = 0.0
            max_start = 100.0 - (step * (count - 1))
            start = min(max(center - pad, min_start), max_start)
            return [round(start + (step * idx), 2) for idx in range(count)]

        # Round 1: 25% coarse scan
        coarse = [0.0, 25.0, 50.0, 75.0, 100.0]
        done = _run_round(
            phase="Coarse scan (25% steps)",
            isa_vals=_grid_for_class("ISA", coarse),
            gia_vals=_grid_for_class("GIA", coarse),
            pen_vals=_grid_for_class("PENSION", coarse),
        )

        # Round 2: 5% medium scan around best point
        if done and results:
            best = _find_best_point(results)
            done = _run_round(
                phase="Refining (5% steps)",
                isa_vals=_grid_for_class("ISA", _range_around(best.isa_bond_pct, 10, 5)),
                gia_vals=_grid_for_class("GIA", _range_around(best.gia_bond_pct, 10, 5)),
                pen_vals=_grid_for_class("PENSION", _range_around(best.pension_bond_pct, 10, 5)),
            )

        # Round 3: 1% fine scan around refined best
        if done and results:
            best = _find_best_point(results)
            _run_round(
                phase="Fine-tuning (1% steps)",
                isa_vals=_grid_for_class("ISA", _range_around(best.isa_bond_pct, 3, 1)),
                gia_vals=_grid_for_class("GIA", _range_around(best.gia_bond_pct, 3, 1)),
                pen_vals=_grid_for_class("PENSION", _range_around(best.pension_bond_pct, 3, 1)),
            )

        # Clean up progress
        _get_sweep_progress().remove_sync(sid)

        # Deduplicate results
        unique_results_by_combo: dict[tuple[float, float, float], BondCombo] = {}
        for combo in results:
            combo_key = (combo.isa_bond_pct, combo.gia_bond_pct, combo.pension_bond_pct)
            unique_results_by_combo[combo_key] = combo
        unique_results = list(unique_results_by_combo.values())

        optimal = _find_best_point(unique_results)
        ranked = sorted(unique_results, key=lambda r: (-r.max_safe_fun_fund, r.bankruptcy_pct))[:10]

        # Build marginal curves from the coarse round
        marginals: list[MarginalCurve] = []
        class_pct_field = {"ISA": "isa_bond_pct", "GIA": "gia_bond_pct", "PENSION": "pension_bond_pct"}
        for cls in active_classes:
            field = class_pct_field[cls]
            points: list[MarginalPoint] = []
            all_pct_vals = sorted({getattr(r, field) for r in unique_results})
            for pct_val in all_pct_vals:
                matching = [r for r in unique_results if getattr(r, field) == pct_val]
                if not matching:
                    continue
                avg_bank = float(np.mean([r.bankruptcy_pct for r in matching]))
                avg_fun_fund = float(np.mean([r.max_safe_fun_fund for r in matching]))
                min_bank = float(min(r.bankruptcy_pct for r in matching))
                best_fun_fund = float(max(r.max_safe_fun_fund for r in matching))
                points.append(MarginalPoint(
                    bond_pct=float(pct_val),
                    avg_bankruptcy_pct=round(avg_bank, 2),
                    avg_max_fun_fund=round(avg_fun_fund, 2),
                    min_bankruptcy_pct=round(min_bank, 2),
                    best_max_fun_fund=round(best_fun_fund, 2),
                ))
            marginals.append(MarginalCurve(asset_class=cls, points=points))

        return BondSweepResponse(
            asset_classes=active_classes,
            optimal=optimal,
            top_combos=ranked,
            marginals=marginals,
            target_year=target_year,
            total_combos_tested=len(results),
        )


def _run_combo(
    *,
    isa_pct: float,
    gia_pct: float,
    pen_pct: float,
    active_classes: list[str],
    sim_scenario_base: SimulationScenario,
    iterations: int,
    risk_threshold: float,
    target_year_index: int,
    max_spend: float,
) -> BondCombo:
    """Find max safe fun fund for one ISA/GIA/PENSION bond-allocation combination."""
    override: dict[str, float] = {}
    if "ISA" in active_classes:
        override["ISA"] = isa_pct / 100.0
    if "GIA" in active_classes:
        override["GIA"] = gia_pct / 100.0
    if "PENSION" in active_classes:
        override["PENSION"] = pen_pct / 100.0

    returns = generate_returns_matrix_with_bond_override(
        scenario=sim_scenario_base,
        iterations=iterations,
        seed=0,
        bond_pct_by_class=override,
    )

    lo = 0.0
    hi = max_spend
    for _ in range(15):
        mid = (lo + hi) / 2.0
        sim_scenario = ScenarioBuilder.build_variant(
            base=sim_scenario_base,
            annual_spend_target=float(mid),
        )
        mats = run_simulation(scenario=sim_scenario, returns=returns)
        is_bankrupt = mats.fields.get("is_bankrupt")
        if is_bankrupt is not None and is_bankrupt.size:
            bankruptcy_pct = float(np.mean(is_bankrupt[:, target_year_index]) * 100)
        else:
            bankruptcy_pct = 0.0

        if bankruptcy_pct <= risk_threshold:
            lo = mid
        else:
            hi = mid

    max_safe_fun_fund = round(float(lo), 2)
    final_scenario = ScenarioBuilder.build_variant(
        base=sim_scenario_base,
        annual_spend_target=max_safe_fun_fund,
    )
    final_mats = run_simulation(scenario=final_scenario, returns=returns)
    final_is_bankrupt = final_mats.fields.get("is_bankrupt")
    final_is_depleted = final_mats.fields.get("is_depleted")
    if final_is_bankrupt is not None and final_is_bankrupt.size:
        bankruptcy_pct = float(np.mean(final_is_bankrupt[:, target_year_index]) * 100)
    else:
        bankruptcy_pct = 0.0
    if final_is_depleted is not None and final_is_depleted.size:
        depletion_pct = float(np.mean(final_is_depleted[:, target_year_index]) * 100)
    else:
        depletion_pct = 0.0

    return BondCombo(
        isa_bond_pct=isa_pct,
        gia_bond_pct=gia_pct,
        pension_bond_pct=pen_pct,
        bankruptcy_pct=round(bankruptcy_pct, 2),
        depletion_pct=round(depletion_pct, 2),
        max_safe_fun_fund=max_safe_fun_fund,
    )


def _find_best_point(results: list[BondCombo]) -> BondCombo:
    """Return the single best combo (highest max safe fun fund)."""
    return max(results, key=lambda r: (r.max_safe_fun_fund, -r.bankruptcy_pct))


def _scenario_has_asset_class(scenario: SimulationScenario, asset_class: str) -> bool:
    """Check whether the scenario actually has assets of the given class."""
    if asset_class == "PENSION":
        return bool(scenario.pension_by_person)
    return any(
        str(getattr(a, "asset_type", "")).upper() == asset_class
        for a in scenario.assets
    )



