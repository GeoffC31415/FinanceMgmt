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
    rental_income_median: adjust(result.rental_income_median),
    gift_income_median: adjust(result.gift_income_median),
    pension_income_median: adjust(result.pension_income_median),
    state_pension_income_median: adjust(result.state_pension_income_median),
    investment_returns_median: adjust(result.investment_returns_median),
    total_income_median: adjust(result.total_income_median),
    total_expenses_median: adjust(result.total_expenses_median),
    mortgage_payment_median: adjust(result.mortgage_payment_median),
    pension_contributions_median: adjust(result.pension_contributions_median),
    fun_fund_median: adjust(result.fun_fund_median),
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
  const [annual_spend_target, setAnnualSpendTarget] = useState<number>(0);
  const [end_year, setEndYear] = useState<number>(new Date().getFullYear() + 60);
  const [retirement_age_offset, setRetirementAgeOffset] = useState<number>(0);
  const [show_real_values, setShowRealValues] = useState<boolean>(false);
  const [percentile, setPercentile] = useState<number>(50);

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
      iterations: 2000,
      seed: 0,
      annual_spend_target,
      end_year
    }).catch(() => {
      // error is handled in hook state
    });
    // Intentionally not re-initializing on spend/end_year changes; use the button for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Debounced recalc for spend + retirement age offset + percentile.
  // Fast engine enables low debounce for near-instant feedback.
  useEffect(() => {
    if (!selected || !session_id) return;
    const t = window.setTimeout(() => {
      recalc({
        annual_spend_target,
        retirement_age_offset,
        percentile
      }).catch(() => {
        // error is handled in hook state
      });
    }, 100);
    return () => window.clearTimeout(t);
  }, [selected, session_id, annual_spend_target, retirement_age_offset, percentile, recalc]);

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
      "rental_income_median",
      "gift_income_median",
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
      getValue(result.rental_income_median, idx),
      getValue(result.gift_income_median, idx),
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
        <h1 className="text-2xl font-semibold">Scenario Simulation</h1>
        <p className="text-slate-300">Run Monte Carlo simulations with randomised investment returns to explore the range of possible financial outcomes.</p>
      </div>

      {(error || run_error) && (
        <div className="rounded border border-rose-800 bg-rose-950 px-4 py-3 text-sm text-rose-200">
          {error || run_error}
        </div>
      )}

      <div className="sticky top-0 z-10 rounded border border-slate-800 bg-slate-900/95 p-4 backdrop-blur-sm shadow-lg space-y-3">
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
            <label className="block text-sm font-medium">Extra spend (retired)</label>
            <div className="mt-2 flex items-center gap-3">
              <input
                className="w-full"
                value={annual_spend_target}
                onChange={(e) => setAnnualSpendTarget(Number(e.target.value))}
                type="range"
                min={0}
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

          <div className="min-w-[240px]">
            <label className="block text-sm font-medium">
              Percentile
              <span className="ml-2 text-xs text-slate-400">
                {percentile === 50 ? "(median)" : percentile < 50 ? "(pessimistic)" : "(optimistic)"}
              </span>
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                className="w-full accent-amber-500"
                value={percentile}
                onChange={(e) => setPercentile(Number(e.target.value))}
                type="range"
                min={1}
                max={99}
                step={1}
              />
              <input
                className="w-[80px] rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-center"
                value={percentile}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 1 && val <= 99) setPercentile(val);
                }}
                type="number"
                min={1}
                max={99}
              />
              <button
                className={`rounded px-3 py-2 text-xs font-medium transition-colors ${
                  percentile === 50
                    ? "bg-amber-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
                onClick={() => setPercentile(50)}
                title="Set to median (50th percentile)"
              >
                Median
              </button>
            </div>
          </div>

          <button
            className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700 disabled:opacity-50"
            disabled={!result}
            onClick={export_csv}
          >
            Export CSV
          </button>
          {result && (() => {
            const lastIdx = result.years.length - 1;
            const depletionPct = lastIdx >= 0 ? result.is_depleted_median[lastIdx] : 0;
            const finalP10 = lastIdx >= 0 ? result.net_worth_p10[lastIdx] : 0;
            const depletionColor = depletionPct === 0 
              ? "text-emerald-400" 
              : depletionPct < 10 
                ? "text-amber-400" 
                : "text-rose-400";
            const p10Color = finalP10 > 0 
              ? "text-emerald-400" 
              : "text-rose-400";
            return (
              <div className="flex items-center gap-4 text-xs">
                <div 
                  className={`flex items-center gap-2 ${depletionColor}`}
                  title={`${depletionPct.toFixed(1)}% of simulations run out of investable assets (ISA, pension, cash, GIA all depleted). This is different from net worth which also includes liabilities like mortgages.`}
                >
                  <span className="text-slate-400">Asset depletion:</span>
                  <span className="font-semibold">
                    {depletionPct === 0 ? "0%" : `${depletionPct.toFixed(1)}%`}
                  </span>
                </div>
                <div 
                  className={`flex items-center gap-2 ${p10Color}`}
                  title="Net worth at the 10th percentile in the final year. If this is positive, 90% of simulations end with positive net worth."
                >
                  <span className="text-slate-400">P10 final:</span>
                  <span className="font-semibold">
                    £{Math.round(finalP10).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Secondary row: display options */}
        {result && (
          <div className="flex items-center gap-4 border-t border-slate-800 pt-3">
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
                className={`flex items-center h-4 w-7 rounded-full transition-colors ${
                  show_real_values ? "bg-cyan-600" : "bg-slate-700"
                } px-0.5`}
              >
                <span
                  className={`h-3 w-3 rounded-full bg-white transition-transform ${
                    show_real_values ? "translate-x-3" : "translate-x-0"
                  }`}
                />
              </span>
              <span className="font-medium">
                {show_real_values ? "Today's value" : "Nominal values"}
              </span>
            </button>
            <span className={`text-xs ${show_real_values ? "text-cyan-300/70" : "text-slate-500"}`}>
              {show_real_values 
                ? `All amounts adjusted for ${((result.inflation_rate ?? 0.02) * 100).toFixed(1)}% annual inflation to show today's purchasing power`
                : "Showing future nominal values without inflation adjustment"}
            </span>
            {is_running && (
              <span className="ml-auto text-xs text-slate-500">Recalculating…</span>
            )}
          </div>
        )}
      </div>

      {display_result && (
        <div className="space-y-6">
          {percentile !== 50 && (
            <div className="rounded border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
              <strong>Viewing {percentile}th percentile:</strong>{" "}
              {percentile < 50 
                ? `This shows a more pessimistic scenario where ${percentile}% of simulations perform worse.`
                : `This shows a more optimistic scenario where ${100 - percentile}% of simulations perform better.`}
              <button
                className="ml-3 rounded bg-amber-700/50 px-2 py-0.5 text-xs hover:bg-amber-700"
                onClick={() => setPercentile(50)}
              >
                Reset to median
              </button>
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
            percentile={percentile}
          />
          <ExpensesChart
            years={display_result.years}
            total_expenses_median={display_result.total_expenses_median}
            mortgage_payment_median={display_result.mortgage_payment_median}
            pension_contributions_median={display_result.pension_contributions_median}
            total_tax_median={display_result.total_tax_median}
            fun_fund_median={display_result.fun_fund_median}
            retirement_years={display_result.retirement_years}
            percentile={percentile}
          />
          <IncomeChart
            years={display_result.years}
            salary_gross_median={display_result.salary_gross_median}
            salary_net_median={display_result.salary_net_median}
            rental_income_median={display_result.rental_income_median}
            gift_income_median={display_result.gift_income_median}
            pension_income_median={display_result.pension_income_median}
            state_pension_income_median={display_result.state_pension_income_median}
            investment_returns_median={display_result.investment_returns_median}
            total_income_median={display_result.total_income_median}
            retirement_years={display_result.retirement_years}
            percentile={percentile}
          />
          <AssetsChart
            years={display_result.years}
            isa_balance_median={display_result.isa_balance_median}
            pension_balance_median={display_result.pension_balance_median}
            cash_balance_median={display_result.cash_balance_median}
            total_assets_median={display_result.total_assets_median}
            retirement_years={display_result.retirement_years}
            percentile={percentile}
          />
        </div>
      )}
    </div>
  );
}

