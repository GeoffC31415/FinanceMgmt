import { useCallback, useState } from "react";
import type { SimulationRequest, SimulationResponse } from "../types";
import { run_simulation } from "../api/client";

export function useSimulation() {
  const [result, setResult] = useState<SimulationResponse | null>(null);
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

  return { result, is_loading, error, run };
}

