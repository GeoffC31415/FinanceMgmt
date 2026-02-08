import { useCallback, useEffect, useMemo, useState } from "react";
import { useScenarioList } from "../hooks/useScenario";
import { init_simulation } from "../api/client";
import type { SimulationResponse } from "../types";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SCENARIO_COLORS = ["#a78bfa", "#34d399", "#fb923c", "#f472b6", "#60a5fa"];

type ScenarioResult = {
  scenario_id: string;
  scenario_name: string;
  result: SimulationResponse;
};

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `£${Math.round(value / 1000)}k`;
  return `£${Math.round(value)}`;
}

export function ComparisonDashboard() {
  const { scenarios, is_loading: loading_scenarios } = useScenarioList();
  const [selected_ids, setSelectedIds] = useState<string[]>([]);
  const [results, setResults] = useState<ScenarioResult[]>([]);
  const [is_loading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle_scenario = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev; // Max 3 scenarios
      return [...prev, id];
    });
  }, []);

  // Run simulations for selected scenarios
  useEffect(() => {
    if (selected_ids.length === 0) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all(
      selected_ids.map(async (id) => {
        const scenario = scenarios.find((s) => s.id === id);
        if (!scenario) return null;
        try {
          const res = await init_simulation({
            scenario_id: id,
            iterations: 2000,
            seed: 0,
          });
          return {
            scenario_id: id,
            scenario_name: scenario.name,
            result: res as SimulationResponse,
          };
        } catch {
          return null;
        }
      })
    )
      .then((all) => {
        if (cancelled) return;
        const valid = all.filter((x): x is ScenarioResult => x !== null);
        setResults(valid);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Comparison failed");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected_ids, scenarios]);

  // Build merged chart data for net worth overlay
  const net_worth_chart_data = useMemo(() => {
    if (results.length === 0) return [];
    // Use the longest year range
    const all_years = new Set<number>();
    results.forEach((r) => r.result.years.forEach((y) => all_years.add(y)));
    const years = Array.from(all_years).sort((a, b) => a - b);

    return years.map((year) => {
      const point: Record<string, number | string> = { year };
      results.forEach((r, idx) => {
        const yi = r.result.years.indexOf(year);
        if (yi >= 0) {
          point[`nw_${idx}`] = r.result.net_worth_median[yi];
          point[`p10_${idx}`] = r.result.net_worth_p10[yi];
          point[`p90_${idx}`] = r.result.net_worth_p90[yi];
        }
      });
      return point;
    });
  }, [results]);

  // Build income overlay chart data
  const income_chart_data = useMemo(() => {
    if (results.length === 0) return [];
    const all_years = new Set<number>();
    results.forEach((r) => r.result.years.forEach((y) => all_years.add(y)));
    const years = Array.from(all_years).sort((a, b) => a - b);

    return years.map((year) => {
      const point: Record<string, number | string> = { year };
      results.forEach((r, idx) => {
        const yi = r.result.years.indexOf(year);
        if (yi >= 0) {
          point[`income_${idx}`] = r.result.total_income_median[yi];
          point[`expenses_${idx}`] = r.result.total_expenses_median[yi];
        }
      });
      return point;
    });
  }, [results]);

  // Summary metrics for comparison table
  const summary_metrics = useMemo(() => {
    return results.map((r, idx) => {
      const years = r.result.years;
      const lastIdx = years.length - 1;
      const nw = r.result.net_worth_median;
      const bankrupt = r.result.is_bankrupt_median;
      const depleted = r.result.is_depleted_median;

      // Final net worth
      const final_net_worth = lastIdx >= 0 ? nw[lastIdx] : 0;

      // Peak net worth
      const peak_net_worth = nw.length > 0 ? Math.max(...nw) : 0;

      // Depletion risk (final year)
      const final_depletion_pct = lastIdx >= 0 ? depleted[lastIdx] : 0;

      // Bankruptcy risk (final year)
      const final_bankruptcy_pct = lastIdx >= 0 ? bankrupt[lastIdx] : 0;

      // First year with any bankruptcy
      let first_bankruptcy_year: number | null = null;
      for (let i = 0; i < years.length; i++) {
        if (bankrupt[i] > 0) {
          first_bankruptcy_year = years[i];
          break;
        }
      }

      // P10 final (pessimistic case)
      const p10_final = lastIdx >= 0 ? r.result.net_worth_p10[lastIdx] : 0;

      return {
        scenario_name: r.scenario_name,
        color: SCENARIO_COLORS[idx % SCENARIO_COLORS.length],
        final_net_worth,
        peak_net_worth,
        p10_final,
        final_depletion_pct,
        final_bankruptcy_pct,
        first_bankruptcy_year,
        final_year: lastIdx >= 0 ? years[lastIdx] : null,
      };
    });
  }, [results]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Compare Scenarios</h1>
        <p className="text-slate-300">
          Select up to 3 scenarios to compare side by side. Charts overlay results for easy comparison.
        </p>
      </div>

      {error && (
        <div className="rounded border border-rose-800 bg-rose-950 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Scenario selector */}
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <div className="mb-3 text-sm font-medium text-slate-300">
          Select scenarios to compare ({selected_ids.length}/3)
        </div>
        <div className="flex flex-wrap gap-2">
          {loading_scenarios && <span className="text-sm text-slate-500">Loading scenarios...</span>}
          {scenarios.map((s) => {
            const is_selected = selected_ids.includes(s.id);
            const idx = selected_ids.indexOf(s.id);
            const color = is_selected ? SCENARIO_COLORS[idx % SCENARIO_COLORS.length] : undefined;
            return (
              <button
                key={s.id}
                onClick={() => toggle_scenario(s.id)}
                disabled={!is_selected && selected_ids.length >= 3}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  is_selected
                    ? "border-current text-white"
                    : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                }`}
                style={is_selected ? { borderColor: color, color } : undefined}
              >
                {is_selected && (
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                )}
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      {is_loading && (
        <div className="rounded border border-slate-800 bg-slate-900/30 px-4 py-6 text-center text-sm text-slate-400">
          Running simulations for comparison...
        </div>
      )}

      {/* Results */}
      {results.length >= 2 && !is_loading && (
        <div className="space-y-6">
          {/* Summary Metrics Table */}
          <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
            <div className="mb-3 text-sm font-semibold">Key Metrics Comparison</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-xs text-slate-400">
                    <th className="pb-2 pr-4">Metric</th>
                    {summary_metrics.map((m, i) => (
                      <th key={i} className="pb-2 pr-4" style={{ color: m.color }}>
                        {m.scenario_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  <tr className="border-b border-slate-800">
                    <td className="py-2 pr-4 text-slate-400">Final Net Worth (median)</td>
                    {summary_metrics.map((m, i) => (
                      <td key={i} className="py-2 pr-4 font-medium">
                        {formatCurrency(m.final_net_worth)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-2 pr-4 text-slate-400">Peak Net Worth</td>
                    {summary_metrics.map((m, i) => (
                      <td key={i} className="py-2 pr-4">{formatCurrency(m.peak_net_worth)}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-2 pr-4 text-slate-400">P10 Final Net Worth</td>
                    {summary_metrics.map((m, i) => (
                      <td key={i} className={`py-2 pr-4 ${m.p10_final < 0 ? "text-rose-400" : ""}`}>
                        {formatCurrency(m.p10_final)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-2 pr-4 text-slate-400">Asset Depletion Risk</td>
                    {summary_metrics.map((m, i) => (
                      <td
                        key={i}
                        className={`py-2 pr-4 ${
                          m.final_depletion_pct === 0
                            ? "text-emerald-400"
                            : m.final_depletion_pct < 10
                            ? "text-amber-400"
                            : "text-rose-400"
                        }`}
                      >
                        {m.final_depletion_pct.toFixed(1)}%
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-2 pr-4 text-slate-400">Bankruptcy Risk</td>
                    {summary_metrics.map((m, i) => (
                      <td
                        key={i}
                        className={`py-2 pr-4 ${
                          m.final_bankruptcy_pct === 0
                            ? "text-emerald-400"
                            : m.final_bankruptcy_pct < 5
                            ? "text-amber-400"
                            : "text-rose-400"
                        }`}
                      >
                        {m.final_bankruptcy_pct.toFixed(1)}%
                        {m.first_bankruptcy_year && (
                          <span className="ml-1 text-xs text-slate-500">
                            (from {m.first_bankruptcy_year})
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Net Worth Overlay Chart */}
          <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
            <div className="mb-3 text-sm font-semibold">Net Worth Comparison (Median)</div>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={net_worth_chart_data} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="year" stroke="#94a3b8" />
                  <YAxis
                    stroke="#94a3b8"
                    tickFormatter={(v) => `£${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0b1220", border: "1px solid #1f2937", color: "#e2e8f0" }}
                    formatter={(value: number, name: string) => {
                      const idx = parseInt(name.split("_").pop() || "0");
                      const label = results[idx]?.scenario_name || name;
                      const suffix = name.startsWith("p10") ? " (P10)" : name.startsWith("p90") ? " (P90)" : "";
                      return [formatCurrency(value), `${label}${suffix}`];
                    }}
                    labelFormatter={(label) => `Year ${label}`}
                  />
                  <Legend
                    formatter={(value: string) => {
                      const idx = parseInt(value.split("_").pop() || "0");
                      const label = results[idx]?.scenario_name || value;
                      if (value.startsWith("p10")) return `${label} (P10)`;
                      if (value.startsWith("p90")) return `${label} (P90)`;
                      return label;
                    }}
                    wrapperStyle={{ color: "#e2e8f0" }}
                  />
                  {results.map((_, idx) => (
                    <Line
                      key={`p10_${idx}`}
                      type="monotone"
                      dataKey={`p10_${idx}`}
                      stroke={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      dot={false}
                      strokeOpacity={0.4}
                      name={`p10_${idx}`}
                      legendType="none"
                    />
                  ))}
                  {results.map((_, idx) => (
                    <Line
                      key={`nw_${idx}`}
                      type="monotone"
                      dataKey={`nw_${idx}`}
                      stroke={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
                      strokeWidth={2.5}
                      dot={false}
                      name={`nw_${idx}`}
                    />
                  ))}
                  {results.map((_, idx) => (
                    <Line
                      key={`p90_${idx}`}
                      type="monotone"
                      dataKey={`p90_${idx}`}
                      stroke={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      dot={false}
                      strokeOpacity={0.4}
                      name={`p90_${idx}`}
                      legendType="none"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Income & Expenses Overlay Chart */}
          <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
            <div className="mb-3 text-sm font-semibold">Income & Expenses Comparison</div>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={income_chart_data} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="year" stroke="#94a3b8" />
                  <YAxis
                    stroke="#94a3b8"
                    tickFormatter={(v) => `£${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0b1220", border: "1px solid #1f2937", color: "#e2e8f0" }}
                    formatter={(value: number, name: string) => {
                      const idx = parseInt(name.split("_").pop() || "0");
                      const label = results[idx]?.scenario_name || name;
                      const type = name.startsWith("income") ? "Income" : "Expenses";
                      return [formatCurrency(value), `${label} (${type})`];
                    }}
                    labelFormatter={(label) => `Year ${label}`}
                  />
                  <Legend
                    formatter={(value: string) => {
                      const idx = parseInt(value.split("_").pop() || "0");
                      const label = results[idx]?.scenario_name || value;
                      const type = value.startsWith("income") ? "Income" : "Expenses";
                      return `${label} (${type})`;
                    }}
                    wrapperStyle={{ color: "#e2e8f0" }}
                  />
                  {results.map((_, idx) => (
                    <Line
                      key={`income_${idx}`}
                      type="monotone"
                      dataKey={`income_${idx}`}
                      stroke={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      name={`income_${idx}`}
                    />
                  ))}
                  {results.map((_, idx) => (
                    <Line
                      key={`expenses_${idx}`}
                      type="monotone"
                      dataKey={`expenses_${idx}`}
                      stroke={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      dot={false}
                      name={`expenses_${idx}`}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {results.length === 1 && !is_loading && (
        <div className="rounded border border-slate-800 bg-slate-900/30 px-4 py-6 text-center text-sm text-slate-400">
          Select at least one more scenario to see the comparison.
        </div>
      )}

      {results.length === 0 && !is_loading && selected_ids.length === 0 && (
        <div className="rounded border border-slate-800 bg-slate-900/30 px-4 py-6 text-center text-sm text-slate-400">
          Select 2-3 scenarios above to compare them side by side.
        </div>
      )}
    </div>
  );
}
