import type {
  BondOverrideRequest,
  BondSweepRequest,
  BondSweepResponse,
  HistoricalReturnsStats,
  SafeWithdrawalRequest,
  SafeWithdrawalResponse,
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

const RETRY_DELAYS = [250, 500, 1000];

async function http<TResponse>(path: string, options?: RequestInit): Promise<TResponse> {
  const isIdempotent = !options?.method || options.method === "GET";
  const maxRetries = isIdempotent ? RETRY_DELAYS.length : 0;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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

      // Handle 204 No Content responses (e.g., from DELETE)
      if (response.status === 204) {
        return undefined as TResponse;
      }

      return (await response.json()) as TResponse;
    } catch (error) {
      if (error instanceof TypeError) {
        // Network errors — retry for idempotent requests
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        throw new Error(
          "Network error. Check backend is running and CORS/host settings are correct."
        );
      }
      throw error;
    }
  }

  // Should not reach here, but TypeScript requires it
  throw lastError ?? new Error("Request failed");
}

export async function list_scenarios(): Promise<ScenarioRead[]> {
  return await http<ScenarioRead[]>("/config/scenarios");
}

export type TaxYearPreset = {
  tax_year: string;
  personal_allowance: number;
  basic_rate_limit: number;
  higher_rate_limit: number;
  basic_rate: number;
  higher_rate: number;
  additional_rate: number;
  ni_primary_threshold: number;
  ni_upper_earnings_limit: number;
  ni_main_rate: number;
  ni_upper_rate: number;
};

export async function list_tax_years(): Promise<TaxYearPreset[]> {
  return await http<TaxYearPreset[]>("/config/tax-years");
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

export async function safe_withdrawal(payload: SafeWithdrawalRequest): Promise<SafeWithdrawalResponse> {
  return await http<SafeWithdrawalResponse>("/simulation/safe-withdrawal", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export type HistoricalReturnsResponse = {
  years: number[];
  returns: number[];
  stats: HistoricalReturnsStats;
};

export async function get_historical_returns(): Promise<HistoricalReturnsResponse> {
  return await http<HistoricalReturnsResponse>("/simulation/historical-returns");
}

export async function bond_sweep(payload: BondSweepRequest): Promise<BondSweepResponse> {
  return await http<BondSweepResponse>("/simulation/bond-sweep", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function bond_override(payload: BondOverrideRequest): Promise<SimulationResponse> {
  return await http<SimulationResponse>("/simulation/bond-override", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export type BondSweepProgress = {
  completed: number;
  total: number;
  phase: string;
  running: boolean;
};

export async function bond_sweep_progress(session_id: string): Promise<BondSweepProgress> {
  return await http<BondSweepProgress>(`/simulation/bond-sweep/progress?session_id=${encodeURIComponent(session_id)}`);
}
