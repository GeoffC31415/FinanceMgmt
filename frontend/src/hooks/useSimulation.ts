import { useCallback, useState } from "react";
import type {
  SimulationInitRequest,
  SimulationInitResponse,
  SimulationRecalcRequest,
  SimulationRequest,
  SimulationResponse
} from "../types";
import { init_simulation, recalc_simulation, run_simulation } from "../api/client";

export function useSimulation() {
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [session_id, setSessionId] = useState<string | null>(null);
  const [is_loading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return { result, session_id, is_loading, error, run, init, recalc };
}

