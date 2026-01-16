import { useEffect, useMemo, useState } from "react";
import { NetWorthChart } from "./charts/NetWorthChart";
import { ExpensesChart } from "./charts/ExpensesChart";
import { IncomeChart } from "./charts/IncomeChart";
import { AssetsChart } from "./charts/AssetsChart";
import { useScenarioList } from "../hooks/useScenario";
import { useSimulation } from "../hooks/useSimulation";

export function Dashboard() {
  const { scenarios, is_loading, error } = useScenarioList();
  const { result, session_id, is_loading: is_running, error: run_error, init, recalc } = useSimulation();
  const [selected_id, setSelectedId] = useState<string | null>(null);
  const [annual_spend_target, setAnnualSpendTarget] = useState<number>(30000);
  const [end_year, setEndYear] = useState<number>(new Date().getFullYear() + 60);
  const [retirement_age_offset, setRetirementAgeOffset] = useState<number>(0);

  const selected = useMemo(() => scenarios.find((s) => s.id === selected_id) ?? null, [scenarios, selected_id]);

  // Initialize cached simulation session when scenario changes.
  useEffect(() => {
    if (!selected) return;
    init({
      scenario_id: selected.id,
      iterations: 1000,
      seed: 0,
      annual_spend_target,
      end_year
    }).catch(() => {
      // error is handled in hook state
    });
    // Intentionally not re-initializing on spend/end_year changes; use the button for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Debounced recalc for spend + retirement age offset.
  useEffect(() => {
    if (!selected || !session_id) return;
    const t = window.setTimeout(() => {
      recalc({
        annual_spend_target,
        retirement_age_offset
      }).catch(() => {
        // error is handled in hook state
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [selected, session_id, annual_spend_target, retirement_age_offset, recalc]);

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
            <div className="mt-2 flex items-center gap-3">
              <input
                className="w-full"
                value={annual_spend_target}
                onChange={(e) => setAnnualSpendTarget(Number(e.target.value))}
                type="range"
                min={10000}
                max={100000}
                step={1000}
              />
              <input
                className="w-[120px] rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={annual_spend_target}
                onChange={(e) => setAnnualSpendTarget(Number(e.target.value))}
                type="number"
                min={0}
                step={500}
              />
            </div>
          </div>

          <div className="min-w-[240px]">
            <label className="block text-sm font-medium">Retirement age offset</label>
            <div className="mt-2 flex items-center gap-3">
              <input
                className="w-full"
                value={retirement_age_offset}
                onChange={(e) => setRetirementAgeOffset(Number(e.target.value))}
                type="range"
                min={-10}
                max={10}
                step={1}
              />
              <div className="w-[120px] rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-center">
                {retirement_age_offset >= 0 ? `+${retirement_age_offset}` : retirement_age_offset}
              </div>
            </div>
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
              await init({
                scenario_id: selected.id,
                iterations: 1000,
                seed: 0,
                annual_spend_target,
                end_year
              });
            }}
          >
            {is_running ? "Updating..." : session_id ? "Reinitialize" : "Initialize"}
          </button>
          <button
            className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700 disabled:opacity-50"
            disabled={!result}
            onClick={export_csv}
          >
            Export CSV
          </button>
          {session_id && (
            <div className="text-xs text-slate-400">
              {is_running ? "Recalculating…" : "Realtime mode: on"}
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="space-y-6">
          <NetWorthChart
            years={result.years}
            net_worth_p10={result.net_worth_p10}
            net_worth_median={result.net_worth_median}
            net_worth_p90={result.net_worth_p90}
            retirement_years={result.retirement_years}
            isa_balance_median={result.isa_balance_median}
            pension_balance_median={result.pension_balance_median}
            cash_balance_median={result.cash_balance_median}
            total_assets_median={result.total_assets_median}
          />
          <ExpensesChart
            years={result.years}
            total_expenses_median={result.total_expenses_median}
            mortgage_payment_median={result.mortgage_payment_median}
            pension_contributions_median={result.pension_contributions_median}
            total_tax_median={result.total_tax_median}
            spend_median={result.spend_median}
            retirement_years={result.retirement_years}
          />
          <IncomeChart
            years={result.years}
            salary_gross_median={result.salary_gross_median}
            salary_net_median={result.salary_net_median}
            pension_income_median={result.pension_income_median}
            state_pension_income_median={result.state_pension_income_median}
            investment_returns_median={result.investment_returns_median}
            total_income_median={result.total_income_median}
            retirement_years={result.retirement_years}
          />
          <AssetsChart
            years={result.years}
            isa_balance_median={result.isa_balance_median}
            pension_balance_median={result.pension_balance_median}
            cash_balance_median={result.cash_balance_median}
            total_assets_median={result.total_assets_median}
            retirement_years={result.retirement_years}
          />
        </div>
      )}
    </div>
  );
}

