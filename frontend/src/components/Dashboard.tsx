import { useEffect, useMemo, useState } from "react";
import { NetWorthChart } from "./charts/NetWorthChart";
import { ExpensesChart } from "./charts/ExpensesChart";
import { IncomeChart } from "./charts/IncomeChart";
import { AssetsChart } from "./charts/AssetsChart";
import { AssetDetailChart } from "./charts/AssetDetailChart";
import { SensitivityChart } from "./charts/SensitivityChart";
import { RiskTimelineChart } from "./charts/RiskTimelineChart";
import { RiskSummaryPanel } from "./RiskSummaryPanel";
import { OverviewInsights } from "./OverviewInsights";
// Lazy-load exceljs only when the user clicks Export
const lazyExportExcel = () => import("../api/exportExcel").then((m) => m.exportExcel);
import { useScenarioList } from "../hooks/useScenario";
import { useSimulation } from "../hooks/useSimulation";
import type { SimulationResponse } from "../types";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "income-spending", label: "Income & Spending" },
  { id: "assets", label: "Assets" },
  { id: "risk", label: "Risk Analysis" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function format_currency_compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `£${(value / 1_000_000).toFixed(1)}m`;
  }
  return `£${Math.round(value).toLocaleString()}`;
}

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
    gia_balance_median: adjust(result.gia_balance_median),
    total_assets_median: adjust(result.total_assets_median),
    isa_returns_median: adjust(result.isa_returns_median),
    gia_returns_median: adjust(result.gia_returns_median),
    cash_returns_median: adjust(result.cash_returns_median),
    pension_returns_median: adjust(result.pension_returns_median),
    isa_contributions_median: adjust(result.isa_contributions_median),
    gia_contributions_median: adjust(result.gia_contributions_median),
    isa_withdrawals_median: adjust(result.isa_withdrawals_median),
    gia_withdrawals_median: adjust(result.gia_withdrawals_median),
    pension_withdrawals_median: adjust(result.pension_withdrawals_median),
    mortgage_balance_median: adjust(result.mortgage_balance_median),
    total_liabilities_median: adjust(result.total_liabilities_median),
    debt_balance_median: adjust(result.debt_balance_median),
    debt_interest_paid_median: adjust(result.debt_interest_paid_median),
    // Percentage fields don't get adjusted
  };
}

const PERCENTILE_PRESETS = [
  { label: "P10", value: 10, desc: "pessimistic" },
  { label: "P25", value: 25, desc: "cautious" },
  { label: "P50", value: 50, desc: "median" },
  { label: "P75", value: 75, desc: "optimistic" },
  { label: "P90", value: 90, desc: "very optimistic" },
];

export function Dashboard() {
  const { scenarios, is_loading, error } = useScenarioList();
  const {
    result,
    session_id,
    is_loading: is_running,
    error: run_error,
    init,
    recalc,
    safe_withdrawal_result,
    is_loading_safe_withdrawal,
    fetch_safe_withdrawal,
  } = useSimulation();
  const [selected_id, setSelectedId] = useState<string | null>(null);
  const [annual_spend_target, setAnnualSpendTarget] = useState<number>(0);
  const [end_year, setEndYear] = useState<number>(new Date().getFullYear() + 60);
  const [retirement_age_offset, setRetirementAgeOffset] = useState<number>(0);
  const [show_real_values, setShowRealValues] = useState<boolean>(false);
  const [percentile, setPercentile] = useState<number>(50);
  const [risk_threshold, setRiskThreshold] = useState<number>(5);
  const [active_tab, setActiveTab] = useState<TabId>("overview");

  const selected = useMemo(() => scenarios.find((s) => s.id === selected_id) ?? null, [scenarios, selected_id]);

  // Compute actual retirement ages for display
  const retirement_ages = useMemo(() => {
    if (!selected) return [];
    return selected.people
      .filter((p) => !p.is_child && p.planned_retirement_age != null)
      .map((p) => ({
        name: p.label,
        base_age: p.planned_retirement_age!,
        effective_age: p.planned_retirement_age! + retirement_age_offset,
      }));
  }, [selected, retirement_age_offset]);

  // Fun fund slider color based on safe withdrawal
  const max_safe = safe_withdrawal_result?.max_safe_fun_fund ?? 0;
  const fund_ratio = max_safe > 0 ? annual_spend_target / max_safe : 0;
  const slider_accent =
    !safe_withdrawal_result
      ? ""
      : fund_ratio <= 0.8
        ? "accent-emerald-500"
        : fund_ratio <= 1.0
          ? "accent-amber-500"
          : "accent-rose-500";

  // Sync end_year and annual_spend_target from scenario assumptions when scenario changes
  useEffect(() => {
    if (!selected) return;
    const assumptions = selected.assumptions as Record<string, unknown> | undefined;
    if (!assumptions) return;
    
    const scenario_end_year = assumptions.end_year as number | undefined;
    const scenario_start_year = (assumptions.start_year ?? new Date().getFullYear()) as number;
    setEndYear(scenario_end_year ?? scenario_start_year + 60);

    const scenario_spend_target = assumptions.annual_spend_target as number | undefined;
    setAnnualSpendTarget(scenario_spend_target ?? 0);
  }, [selected?.id]);
  
  // Apply inflation adjustment when toggle is on
  const display_result = useMemo(() => {
    if (!result) return null;
    return show_real_values ? applyInflationAdjustment(result) : result;
  }, [result, show_real_values]);

  // Calculate when children leave home for the expense chart markers
  const children_leaving = useMemo(() => {
    if (!selected) return [];
    return selected.people
      .filter((p) => p.is_child === true)
      .map((child) => {
        const birth_year = parseInt(child.birth_date.split("-")[0], 10);
        const leaves_age = child.leaves_household_age ?? 18;
        return {
          name: child.label,
          year: birth_year + leaves_age
        };
      })
      .filter((c) => !isNaN(c.year));
  }, [selected]);

  // Years when first two adults turn 40, 50, 60, etc. (for decade markers on net worth chart)
  const adult_decade_years = useMemo(() => {
    if (!selected || !display_result || display_result.years.length === 0) return [];
    const adults = selected.people.filter((p) => !p.is_child).slice(0, 2);
    const minYear = display_result.years[0];
    const maxYear = display_result.years[display_result.years.length - 1];
    const markers: { year: number; age: number; label: string }[] = [];
    for (const adult of adults) {
      const birth_year = parseInt(adult.birth_date.split("-")[0], 10);
      if (isNaN(birth_year)) continue;
      for (let age = 40; age <= 100; age += 10) {
        const y = birth_year + age;
        if (y >= minYear && y <= maxYear) markers.push({ year: y, age, label: adult.label });
      }
    }
    return markers;
  }, [selected, display_result]);

  // Calculate when mortgage is paid off (first year where 50%+ of runs have it paid off)
  const mortgage_payoff_year = useMemo(() => {
    if (!display_result) return null;
    const { years, mortgage_paid_off_median } = display_result;
    if (!mortgage_paid_off_median || mortgage_paid_off_median.length === 0) return null;
    
    for (let i = 0; i < years.length; i++) {
      if (mortgage_paid_off_median[i] >= 50) {
        return years[i];
      }
    }
    return null;
  }, [display_result]);

  // Calculate bankruptcy info
  const bankruptcy_info = useMemo(() => {
    if (!display_result) return null;
    const { years, is_bankrupt_median } = display_result;
    if (!is_bankrupt_median || is_bankrupt_median.length === 0) return null;
    
    let first_year_any: number | null = null;
    for (let i = 0; i < years.length; i++) {
      if (is_bankrupt_median[i] > 0) {
        first_year_any = years[i];
        break;
      }
    }
    
    let first_year_at_percentile: number | null = null;
    for (let i = 0; i < years.length; i++) {
      if (is_bankrupt_median[i] >= percentile) {
        first_year_at_percentile = years[i];
        break;
      }
    }
    
    const lastIdx = years.length - 1;
    const final_pct = lastIdx >= 0 ? is_bankrupt_median[lastIdx] : 0;
    
    return {
      first_year_any,
      first_year_at_percentile,
      final_pct
    };
  }, [display_result, percentile]);

  // Final-year risk metrics for the summary panel
  const final_bankruptcy_pct = bankruptcy_info?.final_pct ?? 0;
  const final_depletion_pct = useMemo(() => {
    if (!result) return 0;
    const lastIdx = result.years.length - 1;
    return lastIdx >= 0 ? result.is_depleted_median[lastIdx] : 0;
  }, [result]);

  // Computed overview metrics for the metric cards
  const overview_metrics = useMemo(() => {
    if (!result) return null;
    const last_idx = result.years.length - 1;
    if (last_idx < 0) return null;

    const final_bankruptcy = result.is_bankrupt_median[last_idx] ?? 0;
    const success_rate = 100 - final_bankruptcy;

    // Peak net worth (median)
    let peak_value = -Infinity;
    let peak_year = result.years[0];
    for (let i = 0; i <= last_idx; i++) {
      if (result.net_worth_median[i] > peak_value) {
        peak_value = result.net_worth_median[i];
        peak_year = result.years[i];
      }
    }

    const final_net_worth_median = result.net_worth_median[last_idx];
    const final_net_worth_p10 = result.net_worth_p10[last_idx];
    const final_net_worth_p90 = result.net_worth_p90[last_idx];
    const final_year = result.years[last_idx];

    return {
      success_rate,
      peak_value,
      peak_year,
      final_net_worth_median,
      final_net_worth_p10,
      final_net_worth_p90,
      final_year,
    };
  }, [result]);

  // Initialize cached simulation session when scenario or end_year changes.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, end_year]);

  // Debounced recalc for spend + retirement age offset + percentile.
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

  // Fetch safe withdrawal data when session or retirement offset or risk threshold changes.
  // Debounced with longer delay since this is a heavier computation.
  useEffect(() => {
    if (!session_id) return;
    const t = window.setTimeout(() => {
      fetch_safe_withdrawal({
        retirement_age_offset,
        risk_threshold,
        max_spend: 200_000,
        steps: 25,
      }).catch(() => {
        // non-critical, logged in hook
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [session_id, retirement_age_offset, risk_threshold, fetch_safe_withdrawal]);

  async function handle_export() {
    if (!display_result) return;
    const scenario_name = selected?.name ?? "scenario";
    const doExport = await lazyExportExcel();
    await doExport(display_result, scenario_name, percentile, show_real_values);
  }

  // Color helper for success rate
  const success_color = (rate: number) =>
    rate >= 95 ? "text-emerald-400" : rate >= 90 ? "text-amber-400" : "text-rose-400";

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

      {/* ===== STICKY CONTROLS ===== */}
      <div className="sticky top-0 z-10 rounded-lg border border-slate-800 bg-slate-900/95 p-4 backdrop-blur-sm shadow-lg space-y-3">
        {/* Row 1: Scenario + Core Simulation Knobs */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_1fr_160px] gap-4 items-end">
          {/* Scenario selector */}
          <div>
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

          {/* Fun fund slider with safe-zone coloring */}
          <div>
            <label className="block text-sm font-medium">
              Extra spend (retired)
              {safe_withdrawal_result && (
                <span className={`ml-2 text-xs font-normal ${
                  fund_ratio <= 1.0 ? "text-emerald-400/70" : "text-rose-400/70"
                }`}>
                  safe max: £{Math.round(max_safe).toLocaleString()}/yr
                </span>
              )}
            </label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                className={`w-full ${slider_accent}`}
                value={annual_spend_target}
                onChange={(e) => setAnnualSpendTarget(Number(e.target.value))}
                type="range"
                min={0}
                max={200000}
                step={1000}
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">£</span>
                <input
                  className="w-[110px] rounded border border-slate-700 bg-slate-950 pl-7 pr-2 py-2 text-sm"
                  value={annual_spend_target}
                  onChange={(e) => setAnnualSpendTarget(Number(e.target.value))}
                  type="number"
                  min={0}
                  step={500}
                />
              </div>
            </div>
          </div>

          {/* Retirement age offset with actual ages */}
          <div>
            <label className="block text-sm font-medium">
              Retirement age offset
              {retirement_ages.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {retirement_ages.map((r) => `${r.name}: ${r.effective_age}`).join(", ")}
                </span>
              )}
            </label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                className="w-full"
                value={retirement_age_offset}
                onChange={(e) => setRetirementAgeOffset(Number(e.target.value))}
                type="range"
                min={-10}
                max={10}
                step={1}
              />
              <div className="w-[60px] rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-center">
                {retirement_age_offset >= 0 ? `+${retirement_age_offset}` : retirement_age_offset}
              </div>
            </div>
          </div>

          {/* End year */}
          <div>
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
        </div>

        {/* Row 2: Display options */}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
          {/* Percentile preset buttons */}
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-slate-500">Percentile:</span>
            {PERCENTILE_PRESETS.map((p) => (
              <button
                key={p.value}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  percentile === p.value
                    ? "bg-amber-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                }`}
                onClick={() => setPercentile(p.value)}
                title={p.desc}
              >
                {p.label}
              </button>
            ))}
            <input
              className="ml-1 w-[52px] rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-center"
              value={percentile}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val >= 1 && val <= 99) setPercentile(val);
              }}
              type="number"
              min={1}
              max={99}
            />
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Real/nominal toggle */}
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
              {show_real_values ? "Today's value" : "Nominal"}
            </span>
          </button>

          <div className="h-4 w-px bg-slate-700" />

          {/* Export Excel */}
          <button
            className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold hover:bg-slate-700 disabled:opacity-50"
            disabled={!display_result}
            onClick={handle_export}
          >
            Export Excel
          </button>

          {/* Recalculating indicator */}
          {is_running && (
            <span className="ml-auto text-xs text-slate-500 animate-pulse">Recalculating...</span>
          )}
        </div>
      </div>

      {/* ===== WARNINGS (visible on all tabs) ===== */}
      {display_result && bankruptcy_info && bankruptcy_info.final_pct > 0 && (
        <div className="rounded border border-rose-800/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 flex-shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span>
              <strong>Bankruptcy Warning:</strong>{" "}
              {bankruptcy_info.final_pct.toFixed(1)}% of simulations hit the bankruptcy threshold
              {bankruptcy_info.first_year_any && (
                <span> (first occurrence in {bankruptcy_info.first_year_any})</span>
              )}
              . Consider reducing retirement spending, delaying retirement, or increasing savings.
            </span>
          </div>
        </div>
      )}
      {display_result && percentile !== 50 && (
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

      {/* ===== TAB BAR ===== */}
      {display_result && (
        <>
          <div className="flex border-b border-slate-700">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
                  active_tab === tab.id
                    ? "text-indigo-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {active_tab === tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t" />
                )}
              </button>
            ))}
          </div>

          {/* ===== TAB CONTENT ===== */}
          <div className="space-y-6">
            {/* ===== OVERVIEW TAB ===== */}
            {active_tab === "overview" && (
              <>
                {/* Key Metric Cards */}
                {overview_metrics && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {/* Success Rate */}
                    <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-4">
                      <div className="text-xs font-medium text-slate-400 mb-1">Success Rate</div>
                      <div className={`text-3xl font-bold ${success_color(overview_metrics.success_rate)}`}>
                        {overview_metrics.success_rate.toFixed(1)}%
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        of simulations avoid bankruptcy
                      </div>
                    </div>

                    {/* Max Safe Fun Fund */}
                    <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-4">
                      <div className="text-xs font-medium text-slate-400 mb-1">
                        Max Safe Fun Fund
                        <span className="ml-1 text-slate-500">({risk_threshold}% risk)</span>
                      </div>
                      <div className={`text-3xl font-bold ${
                        safe_withdrawal_result
                          ? annual_spend_target <= max_safe ? "text-emerald-400" : "text-rose-400"
                          : "text-slate-500"
                      }`}>
                        {safe_withdrawal_result
                          ? `${format_currency_compact(max_safe)}`
                          : "---"}
                        <span className="text-sm font-normal text-slate-500">/yr</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        retirement spending limit
                      </div>
                    </div>

                    {/* Peak Net Worth */}
                    <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-4">
                      <div className="text-xs font-medium text-slate-400 mb-1">Peak Net Worth</div>
                      <div className="text-3xl font-bold text-cyan-400">
                        {format_currency_compact(overview_metrics.peak_value)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        in {overview_metrics.peak_year} (median)
                      </div>
                    </div>

                    {/* Final Net Worth */}
                    <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-4">
                      <div className="text-xs font-medium text-slate-400 mb-1">
                        Final Net Worth ({overview_metrics.final_year})
                      </div>
                      <div className={`text-3xl font-bold ${
                        overview_metrics.final_net_worth_median >= 0 ? "text-slate-100" : "text-rose-400"
                      }`}>
                        {format_currency_compact(overview_metrics.final_net_worth_median)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        P10: {format_currency_compact(overview_metrics.final_net_worth_p10)}
                        {" / "}
                        P90: {format_currency_compact(overview_metrics.final_net_worth_p90)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Auto-Generated Insights */}
                {result && selected && (
                  <OverviewInsights
                    result={result}
                    safe_withdrawal={safe_withdrawal_result}
                    risk_threshold={risk_threshold}
                    current_fun_fund={annual_spend_target}
                    scenario={selected}
                    mortgage_payoff_year={mortgage_payoff_year}
                    children_leaving={children_leaving}
                  />
                )}

                {/* Net Worth Chart -- the single overview chart */}
                <NetWorthChart
                  years={display_result.years}
                  net_worth_p10={display_result.net_worth_p10}
                  net_worth_median={display_result.net_worth_median}
                  net_worth_p90={display_result.net_worth_p90}
                  retirement_years={display_result.retirement_years}
                  adult_decade_years={adult_decade_years}
                  isa_balance_median={display_result.isa_balance_median}
                  pension_balance_median={display_result.pension_balance_median}
                  cash_balance_median={display_result.cash_balance_median}
                  total_assets_median={display_result.total_assets_median}
                  percentile={percentile}
                  bankruptcy_year={bankruptcy_info?.first_year_at_percentile}
                  debt_balance_median={display_result.debt_balance_median}
                />
              </>
            )}

            {/* ===== INCOME & SPENDING TAB ===== */}
            {active_tab === "income-spending" && (
              <>
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
                <ExpensesChart
                  years={display_result.years}
                  total_expenses_median={display_result.total_expenses_median}
                  mortgage_payment_median={display_result.mortgage_payment_median}
                  pension_contributions_median={display_result.pension_contributions_median}
                  total_tax_median={display_result.total_tax_median}
                  fun_fund_median={display_result.fun_fund_median}
                  retirement_years={display_result.retirement_years}
                  children_leaving={children_leaving}
                  mortgage_payoff_year={mortgage_payoff_year}
                  percentile={percentile}
                />
              </>
            )}

            {/* ===== ASSETS TAB ===== */}
            {active_tab === "assets" && (
              <>
                <AssetsChart
                  years={display_result.years}
                  isa_balance_median={display_result.isa_balance_median}
                  pension_balance_median={display_result.pension_balance_median}
                  cash_balance_median={display_result.cash_balance_median}
                  total_assets_median={display_result.total_assets_median}
                  retirement_years={display_result.retirement_years}
                  percentile={percentile}
                />
                <AssetDetailChart
                  years={display_result.years}
                  retirement_years={display_result.retirement_years}
                  percentile={percentile}
                  isa_balance_median={display_result.isa_balance_median}
                  gia_balance_median={display_result.gia_balance_median}
                  cash_balance_median={display_result.cash_balance_median}
                  pension_balance_median={display_result.pension_balance_median}
                  debt_balance_median={display_result.debt_balance_median}
                  pension_contributions_median={display_result.pension_contributions_median}
                  debt_interest_paid_median={display_result.debt_interest_paid_median}
                  isa_returns_median={display_result.isa_returns_median}
                  gia_returns_median={display_result.gia_returns_median}
                  cash_returns_median={display_result.cash_returns_median}
                  pension_returns_median={display_result.pension_returns_median}
                  isa_contributions_median={display_result.isa_contributions_median}
                  gia_contributions_median={display_result.gia_contributions_median}
                  isa_withdrawals_median={display_result.isa_withdrawals_median}
                  gia_withdrawals_median={display_result.gia_withdrawals_median}
                  pension_withdrawals_median={display_result.pension_withdrawals_median}
                />
              </>
            )}

            {/* ===== RISK ANALYSIS TAB ===== */}
            {active_tab === "risk" && (
              <>
                <RiskSummaryPanel
                  safe_withdrawal={safe_withdrawal_result}
                  is_loading={is_loading_safe_withdrawal}
                  current_fun_fund={annual_spend_target}
                  bankruptcy_pct={final_bankruptcy_pct}
                  depletion_pct={final_depletion_pct}
                  risk_threshold={risk_threshold}
                  on_risk_threshold_change={setRiskThreshold}
                  on_set_fun_fund={setAnnualSpendTarget}
                />

                {safe_withdrawal_result && safe_withdrawal_result.sensitivity_curve.length > 0 && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <SensitivityChart
                      sensitivity_curve={safe_withdrawal_result.sensitivity_curve}
                      current_fun_fund={annual_spend_target}
                      max_safe_fun_fund={safe_withdrawal_result.max_safe_fun_fund}
                      risk_threshold={risk_threshold}
                    />
                    <RiskTimelineChart
                      years={display_result.years}
                      is_depleted_median={display_result.is_depleted_median}
                      is_bankrupt_median={display_result.is_bankrupt_median}
                      retirement_years={display_result.retirement_years}
                    />
                  </div>
                )}

                {!safe_withdrawal_result && (
                  <RiskTimelineChart
                    years={display_result.years}
                    is_depleted_median={display_result.is_depleted_median}
                    is_bankrupt_median={display_result.is_bankrupt_median}
                    retirement_years={display_result.retirement_years}
                  />
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
