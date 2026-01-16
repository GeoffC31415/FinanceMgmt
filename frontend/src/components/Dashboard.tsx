import { useEffect, useMemo, useState } from "react";
import { NetWorthChart } from "./charts/NetWorthChart";
import { ExpensesChart } from "./charts/ExpensesChart";
import { IncomeChart } from "./charts/IncomeChart";
import { AssetsChart } from "./charts/AssetsChart";
import { useScenarioList } from "../hooks/useScenario";
import { useSimulation } from "../hooks/useSimulation";
import type { SimulationResponse } from "../types";

/**
 * Adjust an array of nominal values to real (today's purchasing power) values.
 * Formula: real_value = nominal_value / (1 + inflation_rate)^(year - start_year)
 */
function adjustForInflation(
  values: number[],
  years: number[],
  inflation_rate: number,
  start_year: number
): number[] {
  return values.map((v, idx) => {
    const year = years[idx];
    const years_elapsed = year - start_year;
    const inflation_factor = Math.pow(1 + inflation_rate, years_elapsed);
    return v / inflation_factor;
  });
}

/**
 * Apply inflation adjustment to all monetary fields in the simulation result
 */
function applyInflationAdjustment(result: SimulationResponse): SimulationResponse {
  const { years, inflation_rate, start_year } = result;
  const adjust = (arr: number[]) => adjustForInflation(arr, years, inflation_rate, start_year);
  
  return {
    ...result,
    net_worth_p10: adjust(result.net_worth_p10),
    net_worth_median: adjust(result.net_worth_median),
    net_worth_p90: adjust(result.net_worth_p90),
    income_median: adjust(result.income_median),
    spend_median: adjust(result.spend_median),
    salary_gross_median: adjust(result.salary_gross_median),
    salary_net_median: adjust(result.salary_net_median),
    pension_income_median: adjust(result.pension_income_median),
    state_pension_income_median: adjust(result.state_pension_income_median),
    investment_returns_median: adjust(result.investment_returns_median),
    total_income_median: adjust(result.total_income_median),
    total_expenses_median: adjust(result.total_expenses_median),
    mortgage_payment_median: adjust(result.mortgage_payment_median),
    pension_contributions_median: adjust(result.pension_contributions_median),
    income_tax_paid_median: adjust(result.income_tax_paid_median),
    ni_paid_median: adjust(result.ni_paid_median),
    total_tax_median: adjust(result.total_tax_median),
    isa_balance_median: adjust(result.isa_balance_median),
    pension_balance_median: adjust(result.pension_balance_median),
    cash_balance_median: adjust(result.cash_balance_median),
    total_assets_median: adjust(result.total_assets_median),
    mortgage_balance_median: adjust(result.mortgage_balance_median),
    total_liabilities_median: adjust(result.total_liabilities_median),
    // Percentage fields don't get adjusted
  };
}

export function Dashboard() {
  const { scenarios, is_loading, error } = useScenarioList();
  const { result, session_id, is_loading: is_running, error: run_error, init, recalc } = useSimulation();
  const [selected_id, setSelectedId] = useState<string | null>(null);
  const [annual_spend_target, setAnnualSpendTarget] = useState<number>(30000);
  const [end_year, setEndYear] = useState<number>(new Date().getFullYear() + 60);
  const [retirement_age_offset, setRetirementAgeOffset] = useState<number>(0);
  const [realtime_mode, setRealtimeMode] = useState<boolean>(true);
  const [show_real_values, setShowRealValues] = useState<boolean>(false);

  const selected = useMemo(() => scenarios.find((s) => s.id === selected_id) ?? null, [scenarios, selected_id]);
  
  // Apply inflation adjustment when toggle is on
  const display_result = useMemo(() => {
    if (!result) return null;
    return show_real_values ? applyInflationAdjustment(result) : result;
  }, [result, show_real_values]);

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

  // Debounced recalc for spend + retirement age offset (only when realtime mode is on).
  useEffect(() => {
    if (!realtime_mode || !selected || !session_id) return;
    const t = window.setTimeout(() => {
      recalc({
        annual_spend_target,
        retirement_age_offset
      }).catch(() => {
        // error is handled in hook state
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [realtime_mode, selected, session_id, annual_spend_target, retirement_age_offset, recalc]);

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
          {result && (
            <button
              className={`flex items-center gap-2 text-xs transition-colors ${
                show_real_values ? "text-cyan-400" : "text-slate-500"
              } hover:text-slate-300`}
              onClick={() => setShowRealValues((prev) => !prev)}
              title={show_real_values 
                ? "Showing values in today's purchasing power. Click to show nominal values." 
                : "Showing nominal (future) values. Click to adjust for inflation."}
            >
              <span
                className={`inline-block h-3 w-6 rounded-full transition-colors ${
                  show_real_values ? "bg-cyan-600" : "bg-slate-700"
                } relative`}
              >
                <span
                  className={`absolute top-0.5 h-2 w-2 rounded-full bg-white transition-transform ${
                    show_real_values ? "translate-x-3.5" : "translate-x-0.5"
                  }`}
                />
              </span>
              {show_real_values 
                ? `Today's value (${((result.inflation_rate ?? 0.02) * 100).toFixed(1)}% inflation)`
                : "Nominal values"}
            </button>
          )}
          {session_id && (
            <button
              className={`flex items-center gap-2 text-xs transition-colors ${
                realtime_mode ? "text-emerald-400" : "text-slate-500"
              } hover:text-slate-300`}
              onClick={() => setRealtimeMode((prev) => !prev)}
              title={realtime_mode ? "Click to disable automatic recalculation" : "Click to enable automatic recalculation"}
            >
              <span
                className={`inline-block h-3 w-6 rounded-full transition-colors ${
                  realtime_mode ? "bg-emerald-600" : "bg-slate-700"
                } relative`}
              >
                <span
                  className={`absolute top-0.5 h-2 w-2 rounded-full bg-white transition-transform ${
                    realtime_mode ? "translate-x-3.5" : "translate-x-0.5"
                  }`}
                />
              </span>
              {is_running ? "Recalculating…" : realtime_mode ? "Realtime: on" : "Realtime: off"}
            </button>
          )}
        </div>
      </div>

      {display_result && (
        <div className="space-y-6">
          {show_real_values && (
            <div className="rounded border border-cyan-800/50 bg-cyan-950/30 px-4 py-3 text-sm text-cyan-200">
              <strong>Today's value mode:</strong> All amounts are adjusted for {((result?.inflation_rate ?? 0.02) * 100).toFixed(1)}% annual inflation, 
              showing what future money would be worth in today's purchasing power.
            </div>
          )}
          <NetWorthChart
            years={display_result.years}
            net_worth_p10={display_result.net_worth_p10}
            net_worth_median={display_result.net_worth_median}
            net_worth_p90={display_result.net_worth_p90}
            retirement_years={display_result.retirement_years}
            isa_balance_median={display_result.isa_balance_median}
            pension_balance_median={display_result.pension_balance_median}
            cash_balance_median={display_result.cash_balance_median}
            total_assets_median={display_result.total_assets_median}
          />
          <ExpensesChart
            years={display_result.years}
            total_expenses_median={display_result.total_expenses_median}
            mortgage_payment_median={display_result.mortgage_payment_median}
            pension_contributions_median={display_result.pension_contributions_median}
            total_tax_median={display_result.total_tax_median}
            spend_median={display_result.spend_median}
            retirement_years={display_result.retirement_years}
          />
          <IncomeChart
            years={display_result.years}
            salary_gross_median={display_result.salary_gross_median}
            salary_net_median={display_result.salary_net_median}
            pension_income_median={display_result.pension_income_median}
            state_pension_income_median={display_result.state_pension_income_median}
            investment_returns_median={display_result.investment_returns_median}
            total_income_median={display_result.total_income_median}
            retirement_years={display_result.retirement_years}
          />
          <AssetsChart
            years={display_result.years}
            isa_balance_median={display_result.isa_balance_median}
            pension_balance_median={display_result.pension_balance_median}
            cash_balance_median={display_result.cash_balance_median}
            total_assets_median={display_result.total_assets_median}
            retirement_years={display_result.retirement_years}
          />
        </div>
      )}
    </div>
  );
}

