import { useCallback, useRef, useState } from "react";
import type {
  BondOverrideRequest,
  BondSweepRequest,
  BondSweepResponse,
  SafeWithdrawalRequest,
  SafeWithdrawalResponse,
  SimulationInitRequest,
  SimulationInitResponse,
  SimulationRecalcRequest,
  SimulationResponse
} from "../types";
import {
  bond_override,
  bond_sweep,
  bond_sweep_progress,
  init_simulation,
  recalc_simulation,
  safe_withdrawal
} from "../api/client";

export function useSimulation() {
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [session_id, setSessionId] = useState<string | null>(null);
  const [is_loading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Safe withdrawal state
  const [safe_withdrawal_result, setSafeWithdrawalResult] = useState<SafeWithdrawalResponse | null>(null);
  const [is_loading_safe_withdrawal, setIsLoadingSafeWithdrawal] = useState(false);
  const [safe_withdrawal_error, setSafeWithdrawalError] = useState<string | null>(null);

  // Bond sweep state
  const [bond_sweep_result, setBondSweepResult] = useState<BondSweepResponse | null>(null);
  const [is_loading_bond_sweep, setIsLoadingBondSweep] = useState(false);
  const [sweep_progress, setSweepProgress] = useState<{
    completed: number;
    total: number;
    phase: string;
    eta_seconds: number | null;
  } | null>(null);
  const sweep_poll_ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const sweep_started_at_ms_ref = useRef<number | null>(null);
  const sweep_cancelled_ref = useRef(false);

  const init = useCallback(async (payload: SimulationInitRequest): Promise<SimulationInitResponse> => {
    setIsLoading(true);
    setError(null);
    setSafeWithdrawalResult(null);
    setSafeWithdrawalError(null);
    try {
      const res = await init_simulation(payload);
      setSessionId(res.session_id);
      setResult(res);
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation init failed");
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const recalc = useCallback(
    async (payload: Omit<SimulationRecalcRequest, "session_id"> & { session_id?: string | null }) => {
      const effective_session_id = payload.session_id ?? session_id;
      if (!effective_session_id) throw new Error("No simulation session. Initialize first.");

      setIsLoading(true);
      setError(null);
      try {
        const res = await recalc_simulation({
          session_id: effective_session_id,
          annual_spend_target: payload.annual_spend_target ?? null,
          retirement_age_offset: payload.retirement_age_offset ?? null,
          percentile: payload.percentile ?? null
        });
        setResult(res);
        return res;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Simulation recalc failed");
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [session_id]
  );

  const fetch_safe_withdrawal = useCallback(
    async (payload: Omit<SafeWithdrawalRequest, "session_id"> & { session_id?: string | null }) => {
      const effective_session_id = payload.session_id ?? session_id;
      if (!effective_session_id) throw new Error("No simulation session. Initialize first.");

      setIsLoadingSafeWithdrawal(true);
      setSafeWithdrawalError(null);
      try {
        const res = await safe_withdrawal({
          session_id: effective_session_id,
          retirement_age_offset: payload.retirement_age_offset,
          risk_threshold: payload.risk_threshold,
          max_spend: payload.max_spend,
          steps: payload.steps,
        });
        setSafeWithdrawalResult(res);
        return res;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Safe withdrawal calculation failed";
        setSafeWithdrawalError(message);
        console.error("Safe withdrawal calculation failed:", e);
        throw e;
      } finally {
        setIsLoadingSafeWithdrawal(false);
      }
    },
    [session_id]
  );

  const fetch_bond_override = useCallback(
    async (payload: Omit<BondOverrideRequest, "session_id"> & { session_id?: string | null }) => {
      const effective_session_id = payload.session_id ?? session_id;
      if (!effective_session_id) throw new Error("No simulation session. Initialize first.");

      setIsLoading(true);
      setError(null);
      try {
        const res = await bond_override({
          session_id: effective_session_id,
          isa_bond_pct: payload.isa_bond_pct,
          gia_bond_pct: payload.gia_bond_pct,
          pension_bond_pct: payload.pension_bond_pct,
          annual_spend_target: payload.annual_spend_target ?? null,
          retirement_age_offset: payload.retirement_age_offset ?? null,
          percentile: payload.percentile ?? null,
        });
        setResult(res);
        return res;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Bond override simulation failed");
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [session_id]
  );

  const fetch_bond_sweep = useCallback(
    async (payload: Omit<BondSweepRequest, "session_id"> & { session_id?: string | null }) => {
      const effective_session_id = payload.session_id ?? session_id;
      if (!effective_session_id) throw new Error("No simulation session. Initialize first.");

      setIsLoadingBondSweep(true);
      sweep_started_at_ms_ref.current = Date.now();
      setSweepProgress({ completed: 0, total: 0, phase: "Starting...", eta_seconds: null });

      // Start polling progress
      sweep_cancelled_ref.current = false;
      if (sweep_poll_ref.current) clearInterval(sweep_poll_ref.current);
      sweep_poll_ref.current = setInterval(async () => {
        if (sweep_cancelled_ref.current) return;
        try {
          const prog = await bond_sweep_progress(effective_session_id);
          if (sweep_cancelled_ref.current) return;
          const started_at_ms = sweep_started_at_ms_ref.current ?? Date.now();
          const elapsed_seconds = (Date.now() - started_at_ms) / 1000;
          const has_progress = prog.completed > 0 && prog.total > prog.completed;
          let eta_seconds: number | null = null;
          if (has_progress && elapsed_seconds > 0) {
            const runs_per_second = prog.completed / elapsed_seconds;
            if (runs_per_second > 0) {
              eta_seconds = Math.max(0, Math.round((prog.total - prog.completed) / runs_per_second));
            }
          }
          setSweepProgress({
            completed: prog.completed,
            total: prog.total,
            phase: prog.phase,
            eta_seconds,
          });
        } catch {
          // ignore polling errors
        }
      }, 500);

      try {
        const res = await bond_sweep({
          session_id: effective_session_id,
          retirement_age_offset: payload.retirement_age_offset,
          risk_threshold: payload.risk_threshold,
          target_year: payload.target_year,
          max_spend: payload.max_spend,
        });
        setBondSweepResult(res);
        return res;
      } catch (e) {
        console.error("Bond sweep calculation failed:", e);
        throw e;
      } finally {
        sweep_cancelled_ref.current = true;
        if (sweep_poll_ref.current) {
          clearInterval(sweep_poll_ref.current);
          sweep_poll_ref.current = null;
        }
        sweep_started_at_ms_ref.current = null;
        setSweepProgress(null);
        setIsLoadingBondSweep(false);
      }
    },
    [session_id]
  );

  return {
    result,
    session_id,
    is_loading,
    error,
    init,
    recalc,
    safe_withdrawal_result,
    is_loading_safe_withdrawal,
    safe_withdrawal_error,
    fetch_safe_withdrawal,
    bond_sweep_result,
    is_loading_bond_sweep,
    sweep_progress,
    fetch_bond_sweep,
    fetch_bond_override,
  };
}
