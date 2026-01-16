import { useMemo, useState } from "react";
import { NetWorthChart } from "./charts/NetWorthChart";
import { useScenarioList } from "../hooks/useScenario";
import { useSimulation } from "../hooks/useSimulation";

export function Dashboard() {
  const { scenarios, is_loading, error } = useScenarioList();
  const { result, is_loading: is_running, error: run_error, run } = useSimulation();
  const [selected_id, setSelectedId] = useState<string | null>(null);
  const [annual_spend_target, setAnnualSpendTarget] = useState<number>(30000);
  const [end_year, setEndYear] = useState<number>(new Date().getFullYear() + 60);

  const selected = useMemo(() => scenarios.find((s) => s.id === selected_id) ?? null, [scenarios, selected_id]);

  function export_csv() {
    if (!result) return;
    
    // Helper to safely get value or 0
    const getValue = (arr: number[] | undefined, idx: number): number => arr?.[idx] ?? 0;
    
    // Grouped headers for better organization
    const headers = [
      // Basic info
      "year",
      "net_worth_p10",
      "net_worth_median",
      "net_worth_p90",
      
      // Incomes
      "salary_gross_median",
      "salary_net_median",
      "pension_income_median",
      "state_pension_income_median",
      "investment_returns_median",
      "total_income_median",
      
      // Expenses
      "total_expenses_median",
      "mortgage_payment_median",
      "pension_contributions_median",
      
      // Tax
      "income_tax_paid_median",
      "ni_paid_median",
      "total_tax_median",
      
      // Assets
      "isa_balance_median",
      "pension_balance_median",
      "cash_balance_median",
      "total_assets_median",
      
      // Liabilities
      "mortgage_balance_median",
      "total_liabilities_median",
      
      // Other
      "mortgage_paid_off_median_pct",
      "is_depleted_median_pct",
    ];
    
    const rows = result.years.map((year, idx) => [
      year,
      getValue(result.net_worth_p10, idx),
      getValue(result.net_worth_median, idx),
      getValue(result.net_worth_p90, idx),
      
      // Incomes
      getValue(result.salary_gross_median, idx),
      getValue(result.salary_net_median, idx),
      getValue(result.pension_income_median, idx),
      getValue(result.state_pension_income_median, idx),
      getValue(result.investment_returns_median, idx),
      getValue(result.total_income_median, idx),
      
      // Expenses
      getValue(result.total_expenses_median, idx),
      getValue(result.mortgage_payment_median, idx),
      getValue(result.pension_contributions_median, idx),
      
      // Tax
      getValue(result.income_tax_paid_median, idx),
      getValue(result.ni_paid_median, idx),
      getValue(result.total_tax_median, idx),
      
      // Assets
      getValue(result.isa_balance_median, idx),
      getValue(result.pension_balance_median, idx),
      getValue(result.cash_balance_median, idx),
      getValue(result.total_assets_median, idx),
      
      // Liabilities
      getValue(result.mortgage_balance_median, idx),
      getValue(result.total_liabilities_median, idx),
      
      // Other
      getValue(result.mortgage_paid_off_median, idx),
      getValue(result.is_depleted_median, idx),
    ]);
    
    const lines = [headers.join(","), ...rows.map((row) => row.join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const scenario_name = selected?.name?.replace(/[^\w-]+/g, "_") ?? "scenario";
    anchor.href = url;
    anchor.download = `simulation_${scenario_name}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-slate-300">Pick a scenario and run a quick simulation (median net worth).</p>
      </div>

      {(error || run_error) && (
        <div className="rounded border border-rose-800 bg-rose-950 px-4 py-3 text-sm text-rose-200">
          {error || run_error}
        </div>
      )}

      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[240px]">
            <label className="block text-sm font-medium">Scenario</label>
            <select
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              disabled={is_loading}
              value={selected_id ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
            >
              <option value="">Select...</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[240px]">
            <label className="block text-sm font-medium">Annual spend (retired)</label>
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={annual_spend_target}
              onChange={(e) => setAnnualSpendTarget(Number(e.target.value))}
              type="number"
              min={0}
              step={500}
            />
          </div>

          <div className="min-w-[200px]">
            <label className="block text-sm font-medium">End year</label>
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={end_year}
              onChange={(e) => setEndYear(Number(e.target.value))}
              type="number"
              min={1900}
              max={2200}
              step={1}
            />
          </div>

          <button
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
            disabled={!selected || is_running}
            onClick={async () => {
              if (!selected) return;
              await run({
                scenario_id: selected.id,
                iterations: 1000,
                seed: 0,
                annual_spend_target,
                end_year
              });
            }}
          >
            {is_running ? "Running..." : "Run simulation"}
          </button>
          <button
            className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700 disabled:opacity-50"
            disabled={!result}
            onClick={export_csv}
          >
            Export CSV
          </button>
        </div>
      </div>

      {result && (
        <NetWorthChart
          years={result.years}
          net_worth_p10={result.net_worth_p10}
          net_worth_median={result.net_worth_median}
          net_worth_p90={result.net_worth_p90}
          income_median={result.income_median}
          spend_median={result.spend_median}
          retirement_years={result.retirement_years}
        />
      )}
    </div>
  );
}

