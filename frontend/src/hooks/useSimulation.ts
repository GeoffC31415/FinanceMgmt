import { useCallback, useRef, useState } from "react";
import type {
  BondSweepRequest,
  BondSweepResponse,
  SafeWithdrawalRequest,
  SafeWithdrawalResponse,
  SimulationInitRequest,
  SimulationInitResponse,
  SimulationRecalcRequest,
  SimulationRequest,
  SimulationResponse
} from "../types";
import { bond_sweep, bond_sweep_progress, init_simulation, recalc_simulation, run_simulation, safe_withdrawal } from "../api/client";

export function useSimulation() {
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [session_id, setSessionId] = useState<string | null>(null);
  const [is_loading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Safe withdrawal state
  const [safe_withdrawal_result, setSafeWithdrawalResult] = useState<SafeWithdrawalResponse | null>(null);
  const [is_loading_safe_withdrawal, setIsLoadingSafeWithdrawal] = useState(false);

  // Bond sweep state
  const [bond_sweep_result, setBondSweepResult] = useState<BondSweepResponse | null>(null);
  const [is_loading_bond_sweep, setIsLoadingBondSweep] = useState(false);
  const [sweep_progress, setSweepProgress] = useState<{ completed: number; total: number; phase: string } | null>(null);
  const sweep_poll_ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = useCallback(async (payload: SimulationRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await run_simulation(payload);
      setResult(res);
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const init = useCallback(async (payload: SimulationInitRequest): Promise<SimulationInitResponse> => {
    setIsLoading(true);
    setError(null);
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
        console.error("Safe withdrawal calculation failed:", e);
        throw e;
      } finally {
        setIsLoadingSafeWithdrawal(false);
      }
    },
    [session_id]
  );

  const fetch_bond_sweep = useCallback(
    async (payload: Omit<BondSweepRequest, "session_id"> & { session_id?: string | null }) => {
      const effective_session_id = payload.session_id ?? session_id;
      if (!effective_session_id) throw new Error("No simulation session. Initialize first.");

      setIsLoadingBondSweep(true);
      setSweepProgress({ completed: 0, total: 0, phase: "Starting..." });

      // Start polling progress
      if (sweep_poll_ref.current) clearInterval(sweep_poll_ref.current);
      sweep_poll_ref.current = setInterval(async () => {
        try {
          const prog = await bond_sweep_progress(effective_session_id);
          setSweepProgress({ completed: prog.completed, total: prog.total, phase: prog.phase });
        } catch {
          // ignore polling errors
        }
      }, 500);

      try {
        const res = await bond_sweep({
          session_id: effective_session_id,
          retirement_age_offset: payload.retirement_age_offset,
          annual_spend_target: payload.annual_spend_target,
          risk_threshold: payload.risk_threshold,
        });
        setBondSweepResult(res);
        return res;
      } catch (e) {
        console.error("Bond sweep calculation failed:", e);
        throw e;
      } finally {
        if (sweep_poll_ref.current) {
          clearInterval(sweep_poll_ref.current);
          sweep_poll_ref.current = null;
        }
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
    run,
    init,
    recalc,
    safe_withdrawal_result,
    is_loading_safe_withdrawal,
    fetch_safe_withdrawal,
    bond_sweep_result,
    is_loading_bond_sweep,
    sweep_progress,
    fetch_bond_sweep,
  };
}
