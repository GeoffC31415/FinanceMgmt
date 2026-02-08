import { useCallback, useState } from "react";
import type {
  SafeWithdrawalRequest,
  SafeWithdrawalResponse,
  SimulationInitRequest,
  SimulationInitResponse,
  SimulationRecalcRequest,
  SimulationRequest,
  SimulationResponse
} from "../types";
import { init_simulation, recalc_simulation, run_simulation, safe_withdrawal } from "../api/client";

export function useSimulation() {
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [session_id, setSessionId] = useState<string | null>(null);
  const [is_loading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Safe withdrawal state
  const [safe_withdrawal_result, setSafeWithdrawalResult] = useState<SafeWithdrawalResponse | null>(null);
  const [is_loading_safe_withdrawal, setIsLoadingSafeWithdrawal] = useState(false);

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
        // Don't set main error - this is a secondary calculation
        console.error("Safe withdrawal calculation failed:", e);
        throw e;
      } finally {
        setIsLoadingSafeWithdrawal(false);
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
  };
}

