import type {
  ScenarioCreate,
  ScenarioRead,
  SimulationInitRequest,
  SimulationInitResponse,
  SimulationRecalcRequest,
  SimulationRequest,
  SimulationResponse
} from "../types";

const apiHost =
  typeof window !== "undefined" && window.location?.hostname
    ? window.location.hostname
    : "localhost";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? `http://${apiHost}:8000/api`;

async function http<TResponse>(path: string, options?: RequestInit): Promise<TResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers ?? {})
      },
      ...options
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${detail || response.statusText}`);
    }

    return (await response.json()) as TResponse;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Network error. Check backend is running and CORS/host settings are correct."
      );
    }
    throw error;
  }
}

export async function list_scenarios(): Promise<ScenarioRead[]> {
  return await http<ScenarioRead[]>("/config/scenarios");
}

export async function get_scenario(scenario_id: string): Promise<ScenarioRead> {
  return await http<ScenarioRead>(`/config/scenarios/${scenario_id}`);
}

export async function create_scenario(payload: ScenarioCreate): Promise<ScenarioRead> {
  return await http<ScenarioRead>("/config/scenarios", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function update_scenario(scenario_id: string, payload: ScenarioCreate): Promise<ScenarioRead> {
  return await http<ScenarioRead>(`/config/scenarios/${scenario_id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function delete_scenario(scenario_id: string): Promise<void> {
  await http<void>(`/config/scenarios/${scenario_id}`, { method: "DELETE" });
}

export async function run_simulation(payload: SimulationRequest): Promise<SimulationResponse> {
  return await http<SimulationResponse>("/simulation/run", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function init_simulation(payload: SimulationInitRequest): Promise<SimulationInitResponse> {
  return await http<SimulationInitResponse>("/simulation/init", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function recalc_simulation(payload: SimulationRecalcRequest): Promise<SimulationResponse> {
  return await http<SimulationResponse>("/simulation/recalc", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
