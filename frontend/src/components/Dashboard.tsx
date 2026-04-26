import { useCallback } from "react";
import type { ScenarioRead } from "../types";
import { useScenarioList } from "../hooks/useScenario";
import { useSimulation } from "../hooks/useSimulation";
import type { BondSweepResponse } from "../types";
import { useDashboardState, useDashboardData } from "./Dashboard/index";
import { OverviewTab } from "./Dashboard/OverviewTab";
import { IncomeSpendingTab } from "./Dashboard/IncomeSpendingTab";
import { AssetsTab } from "./Dashboard/AssetsTab";
import { RiskTab } from "./Dashboard/RiskTab";
import { AllocationTab } from "./Dashboard/AllocationTab";
import { getScenarioBondAllocations, format_currency_compact } from "./Dashboard/utils";
import type { BondAllocations } from "./Dashboard/utils";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "income-spending", label: "Income & Spending" },
  { id: "assets", label: "Assets" },
  { id: "risk", label: "Risk Analysis" },
  { id: "allocation", label: "Allocation" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Lazy-load exceljs only when the user clicks Export
const lazyExportExcel = () => import("../api/exportExcel").then((m) => m.exportExcel);

function format_duration(seconds: number): string {
  const total_seconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total_seconds / 3600);
  const minutes = Math.floor((total_seconds % 3600) / 60);
  const secs = total_seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function Dashboard() {
  const state = useDashboardState();
  const {
    scenarios,
    is_loading_scenarios,
    scenarios_error,
    simulation,
    selected,
    selected_id,
    setSelectedId,
    annual_spend_target,
    setAnnualSpendTarget,
    end_year,
    setEndYear,
    retirement_age_offset,
    setRetirementAgeOffset,
    show_real_values,
    setShowRealValues,
    percentile,
    setPercentile,
    risk_threshold,
    setRiskThreshold,
    bond_target_year,
    setBondTargetYear,
    active_tab,
    setActiveTab,
    saved_bond_allocations,
    bond_allocations,
    setBondAllocations,
    is_saving_bonds,
    bond_save_error,
    PERCENTILE_PRESETS,
    refresh,
    handleBondAllocationChange,
    handleSaveBondAllocations,
  } = state;

  const {
    result,
    session_id,
    is_loading: is_running,
    error: run_error,
    safe_withdrawal_result,
    is_loading_safe_withdrawal,
    safe_withdrawal_error,
    bond_sweep_result,
    is_loading_bond_sweep,
    sweep_progress,
    fetch_bond_sweep,
  } = simulation;

  // Derived data
  const data = useDashboardData({
    result,
    selected,
    show_real_values,
    percentile,
    retirement_age_offset,
    safe_withdrawal_result,
    annual_spend_target,
  });

  const {
    display_result,
    end_year_deflator,
    overview_metrics,
    retirement_ages,
    children_leaving,
    adult_decade_years,
    mortgage_payoff_year,
    bankruptcy_info,
    final_bankruptcy_pct,
    final_depletion_pct,
    max_safe,
    fund_ratio,
    slider_accent,
    success_color,
  } = data;

  // Export handler
  const handle_export = useCallback(async () => {
    if (!display_result) return;
    const scenario_name = selected?.name ?? "scenario";
    const doExport = await lazyExportExcel();
    await doExport(display_result, scenario_name, percentile, show_real_values);
  }, [display_result, selected, percentile, show_real_values]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Scenario Simulation</h1>
        <p className="text-slate-300">Run Monte Carlo simulations with randomised investment returns to explore the range of possible financial outcomes.</p>
      </div>

      {(scenarios_error || run_error) && (
        <div className="rounded border border-rose-800 bg-rose-950 px-4 py-3 text-sm text-rose-200">
          {scenarios_error || run_error}
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
              disabled={is_loading_scenarios}
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
            onClick={() => setShowRealValues((prev: boolean) => !prev)}
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
              . Consider optimising bond allocations (compute here, then change config), retiring later, or reducing spending.
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
                onClick={() => setActiveTab(tab.id as TabId)}
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
            {active_tab === "overview" && (
              <OverviewTab
                display_result={display_result}
                safe_withdrawal_result={safe_withdrawal_result}
                risk_threshold={risk_threshold}
                setRiskThreshold={setRiskThreshold}
                annual_spend_target={annual_spend_target}
                setAnnualSpendTarget={setAnnualSpendTarget}
                selected={selected}
                overview_metrics={overview_metrics}
                success_color={success_color}
                mortgage_payoff_year={mortgage_payoff_year}
                children_leaving={children_leaving}
                adult_decade_years={adult_decade_years}
                bankruptcy_info={bankruptcy_info}
                percentile={percentile}
                setPercentile={setPercentile}
                handle_export={handle_export}
                show_real_values={show_real_values}
                setShowRealValues={setShowRealValues}
                max_safe={max_safe}
                slider_accent={slider_accent}
              />
            )}

            {active_tab === "income-spending" && (
              <IncomeSpendingTab
                display_result={display_result}
                children_leaving={children_leaving}
                mortgage_payoff_year={mortgage_payoff_year}
                percentile={percentile}
              />
            )}

            {active_tab === "assets" && (
              <AssetsTab
                display_result={display_result}
                percentile={percentile}
                saved_bond_allocations={saved_bond_allocations}
                bond_allocations={bond_allocations}
                is_saving_bonds={is_saving_bonds}
                bond_save_error={bond_save_error}
                onBondAllocationChange={handleBondAllocationChange}
                onSaveBondAllocations={handleSaveBondAllocations}
              />
            )}

            {active_tab === "risk" && (
              <RiskTab
                display_result={display_result}
                safe_withdrawal_result={safe_withdrawal_result}
                is_loading_safe_withdrawal={is_loading_safe_withdrawal}
                safe_withdrawal_error={safe_withdrawal_error}
                annual_spend_target={annual_spend_target}
                final_bankruptcy_pct={final_bankruptcy_pct}
                final_depletion_pct={final_depletion_pct}
                risk_threshold={risk_threshold}
                setRiskThreshold={setRiskThreshold}
                setAnnualSpendTarget={setAnnualSpendTarget}
                end_year_deflator={end_year_deflator}
              />
            )}

            {active_tab === "allocation" && (
              <AllocationTab
                display_result={display_result}
                bond_sweep_result={bond_sweep_result}
                is_loading_bond_sweep={is_loading_bond_sweep}
                sweep_progress={sweep_progress}
                risk_threshold={risk_threshold}
                setRiskThreshold={setRiskThreshold}
                bond_target_year={bond_target_year}
                setBondTargetYear={setBondTargetYear}
                bond_allocations={bond_allocations}
                annual_spend_target={annual_spend_target}
                retirement_age_offset={retirement_age_offset}
                session_id={session_id}
                fetch_bond_sweep={fetch_bond_sweep}
                onBondAllocationChange={handleBondAllocationChange}
                onSaveBondAllocations={handleSaveBondAllocations}
                isSaving={is_saving_bonds}
                saveError={bond_save_error}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
