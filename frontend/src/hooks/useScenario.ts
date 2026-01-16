import { useCallback, useEffect, useState } from "react";
import type { ScenarioCreate, ScenarioRead } from "../types";
import { create_scenario, delete_scenario, get_scenario, list_scenarios, update_scenario } from "../api/client";

export function useScenarioList() {
  const [scenarios, setScenarios] = useState<ScenarioRead[]>([]);
  const [is_loading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setScenarios(await list_scenarios());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scenarios");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { scenarios, is_loading, error, refresh };
}

export function useScenarioDetail(scenario_id: string | null) {
  const [scenario, setScenario] = useState<ScenarioRead | null>(null);
  const [is_loading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!scenario_id) return;
    setIsLoading(true);
    setError(null);
    try {
      setScenario(await get_scenario(scenario_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scenario");
    } finally {
      setIsLoading(false);
    }
  }, [scenario_id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (payload: ScenarioCreate) => {
      if (!scenario_id) throw new Error("No scenario_id");
      const updated = await update_scenario(scenario_id, payload);
      setScenario(updated);
      return updated;
    },
    [scenario_id]
  );

  const remove = useCallback(async () => {
    if (!scenario_id) return;
    await delete_scenario(scenario_id);
    setScenario(null);
  }, [scenario_id]);

  return { scenario, is_loading, error, refresh, save, remove };
}

export function useScenarioCreate() {
  const [is_loading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (payload: ScenarioCreate) => {
    setIsLoading(true);
    setError(null);
    try {
      return await create_scenario(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create scenario");
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { create, is_loading, error };
}

