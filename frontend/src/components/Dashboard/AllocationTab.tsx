import type { SimulationResponse, BondSweepResponse } from "../../types";
import { BondSweepChart } from "../charts/BondSweepChart";
import { BondAllocationPanel } from "../charts/BondAllocationPanel";
import type { BondAllocations } from "./utils";

type Props = {
  display_result: SimulationResponse | null;
  bond_sweep_result: BondSweepResponse | null;
  is_loading_bond_sweep: boolean;
  sweep_progress: {
    completed: number;
    total: number;
    phase: string;
    eta_seconds: number | null;
  } | null;
  risk_threshold: number;
  setRiskThreshold: (v: number) => void;
  bond_target_year: number | null;
  setBondTargetYear: (v: number | null) => void;
  bond_allocations: BondAllocations;
  percentile: number;
  annual_spend_target: number;
  retirement_age_offset: number;
  session_id: string | null;
  fetch_bond_sweep: (payload: {
    session_id: string;
    retirement_age_offset?: number;
    risk_threshold?: number;
    target_year?: number | null;
    max_spend?: number;
  }) => Promise<BondSweepResponse | undefined>;
  onBondAllocationChange: (assetType: keyof BondAllocations, value: number) => void;
  onSaveBondAllocations: (allocations: Partial<BondAllocations>) => Promise<void>;
  isSaving: boolean;
  saveError: string | null;
};

function format_currency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 10_000) return `£${Math.round(value / 1_000).toLocaleString()}k`;
  return `£${Math.round(value).toLocaleString()}`;
}

function format_duration(seconds: number): string {
  const total_seconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total_seconds / 3600);
  const minutes = Math.floor((total_seconds % 3600) / 60);
  const secs = total_seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function AllocationTab({
  display_result,
  bond_sweep_result,
  is_loading_bond_sweep,
  sweep_progress,
  risk_threshold,
  setRiskThreshold,
  bond_target_year,
  setBondTargetYear,
  bond_allocations,
  percentile,
  annual_spend_target,
  retirement_age_offset,
  session_id,
  fetch_bond_sweep,
  onBondAllocationChange,
  onSaveBondAllocations,
  isSaving,
  saveError,
}: Props) {
  const cls_colors: Record<string, { text: string; bar: string }> = {
    ISA: { text: "text-green-400", bar: "#22c55e" },
    GIA: { text: "text-blue-400", bar: "#3b82f6" },
    PENSION: { text: "text-yellow-400", bar: "#eab308" },
  };
  const cls_label: Record<string, string> = { ISA: "ISA", GIA: "GIA", PENSION: "Pension" };

  const projection_metrics = (() => {
    if (!display_result || display_result.years.length === 0) return null;
    const net_worth = display_result.net_worth_median ?? [];
    if (net_worth.length === 0) return null;

    let peak_value = net_worth[0] ?? 0;
    let peak_year = display_result.years[0];
    for (let i = 1; i < net_worth.length; i++) {
      if ((net_worth[i] ?? -Infinity) > peak_value) {
        peak_value = net_worth[i];
        peak_year = display_result.years[i] ?? peak_year;
      }
    }

    const last_idx = display_result.years.length - 1;
    const final_year = display_result.years[last_idx];
    const final_net_worth = net_worth[last_idx] ?? 0;
    const bankruptcy_risk = display_result.is_bankrupt_median?.[last_idx] ?? 0;

    return { peak_value, peak_year, final_net_worth, final_year, bankruptcy_risk };
  })();

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="text-sm font-semibold">Bond Allocation Optimiser</div>
          <div className="text-xs text-slate-400 mt-1">
            Tests every combination of ISA/GIA/Pension bond % in 10% increments to find the optimal blend.
            Uses historical S&amp;P 500 and US 10-Year Treasury total returns.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] text-slate-500">Max bankruptcy</div>
            <select
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
              value={risk_threshold}
              onChange={(e) => setRiskThreshold(Number(e.target.value))}
            >
              <option value={1}>1%</option>
              <option value={2}>2%</option>
              <option value={5}>5%</option>
              <option value={10}>10%</option>
            </select>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-500" title="The year at which the bankruptcy rate is evaluated to determine the safe allocation">Risk horizon</div>
            <select
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
              value={bond_target_year ?? ""}
              onChange={(e) => setBondTargetYear(Number(e.target.value))}
              disabled={!display_result || display_result.years.length === 0}
            >
              {(display_result?.years ?? []).map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <button
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            disabled={is_loading_bond_sweep || !session_id}
            onClick={() => {
              if (session_id) {
                fetch_bond_sweep({
                  session_id,
                  retirement_age_offset,
                  risk_threshold,
                  target_year: bond_target_year,
                  max_spend: Math.max(200_000, annual_spend_target * 2),
                }).catch(() => {});
              }
            }}
          >
            {is_loading_bond_sweep ? "Running..." : "Run Bond Sweep"}
          </button>
        </div>
      </div>

      {/* Bond Allocation Panel */}
      {display_result && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
          <BondAllocationPanel
            currentAllocations={bond_allocations}
            onAllocationChange={onBondAllocationChange}
            isSaving={isSaving}
            saveError={saveError}
            className="w-full"
          />

          {projection_metrics && (
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-cyan-50">Current allocation projection</h3>
                  <p className="mt-1 text-xs text-slate-300">
                    Updates after each quick allocation recalculation. Values show the selected P{percentile} path.
                  </p>
                </div>
                {isSaving && <span className="text-xs text-slate-400 animate-pulse">Saving...</span>}
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                  <div className="text-xs text-slate-400">Peak net worth</div>
                  <div className="mt-1 text-xl font-bold text-emerald-300">{format_currency(projection_metrics.peak_value)}</div>
                  <div className="mt-1 text-xs text-slate-500">in {projection_metrics.peak_year}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                  <div className="text-xs text-slate-400">Final net worth</div>
                  <div className="mt-1 text-xl font-bold text-cyan-100">{format_currency(projection_metrics.final_net_worth)}</div>
                  <div className="mt-1 text-xs text-slate-500">in {projection_metrics.final_year}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                  <div className="text-xs text-slate-400">Bankruptcy risk</div>
                  <div className={`mt-1 text-xl font-bold ${projection_metrics.bankruptcy_risk <= 5 ? "text-emerald-300" : projection_metrics.bankruptcy_risk <= 10 ? "text-amber-300" : "text-rose-300"}`}>
                    {projection_metrics.bankruptcy_risk.toFixed(1)}%
                  </div>
                  <div className="mt-1 text-xs text-slate-500">by final year</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      {is_loading_bond_sweep && sweep_progress && (() => {
        const pct = sweep_progress.total > 0 ? Math.round((sweep_progress.completed / sweep_progress.total) * 100) : 0;
        const has_eta = sweep_progress.eta_seconds != null && sweep_progress.total > sweep_progress.completed;
        const eta_label = has_eta ? format_duration(sweep_progress.eta_seconds ?? 0) : "";
        return (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>{sweep_progress.phase || "Starting..."}</span>
              {sweep_progress.total > 0 && (
                <span>
                  {sweep_progress.completed.toLocaleString()} / {sweep_progress.total.toLocaleString()}
                  {has_eta ? ` - ~${eta_label} left` : ""}
                </span>
              )}
            </div>
            <div
              className="h-2 rounded-full bg-slate-700 overflow-hidden"
              role="progressbar"
              aria-valuenow={sweep_progress.total > 0 ? pct : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Bond sweep progress"
              aria-live="polite"
            >
              {sweep_progress.total > 0 ? (
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              ) : (
                <div className="h-full w-full animate-pulse bg-indigo-500/30 rounded-full" />
              )}
            </div>
          </div>
        );
      })()}

      {/* Optimal combination hero card */}
      {bond_sweep_result && (() => {
        const opt = bond_sweep_result.optimal;
        const pct_field: Record<string, number> = {
          ISA: opt.isa_bond_pct,
          GIA: opt.gia_bond_pct,
          PENSION: opt.pension_bond_pct,
        };
        return (
          <div className="mt-4">
            <div className="text-xs text-slate-400 mb-2">
              Optimal allocation ({bond_sweep_result.total_combos_tested.toLocaleString()} simulation runs)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Per-class bars */}
              <div className="space-y-3">
                {bond_sweep_result.asset_classes.map((cls) => (
                  <div key={cls} className="flex items-center gap-3">
                    <div className={`w-16 text-xs font-semibold ${cls_colors[cls]?.text ?? "text-slate-300"}`}>
                      {cls_label[cls] ?? cls}
                    </div>
                    <div className="flex-1">
                      <div className="relative h-5 rounded bg-slate-700 overflow-hidden">
                        {/* Equity portion */}
                        <div className="absolute inset-y-0 left-0 bg-indigo-600/40 flex items-center justify-center text-[10px] text-slate-200"
                          style={{ width: `${100 - pct_field[cls]}%` }}>
                          {100 - pct_field[cls] > 15 ? `${100 - pct_field[cls]}% equity` : ""}
                        </div>
                        {/* Bond portion */}
                        <div className="absolute inset-y-0 right-0 flex items-center justify-center text-[10px] text-slate-200"
                          style={{ width: `${pct_field[cls]}%`, background: cls_colors[cls]?.bar ?? "#94a3b8", opacity: 0.7 }}>
                          {pct_field[cls] > 15 ? `${pct_field[cls]}% bonds` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="w-10 text-right text-xs font-mono text-slate-300">{pct_field[cls]}%</div>
                  </div>
                ))}
              </div>
              {/* Outcome metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded bg-slate-800/50 p-3">
                  <div className="text-xs text-slate-400">Max Safe Fun Fund</div>
                  <div className="text-lg font-bold text-blue-400">
                    {Math.abs(opt.max_safe_fun_fund) >= 1_000_000
                      ? `£${(opt.max_safe_fun_fund / 1_000_000).toFixed(1)}m`
                      : `£${Math.round(opt.max_safe_fun_fund).toLocaleString()}`}
                  </div>
                </div>
                <div className="rounded bg-slate-800/50 p-3">
                  <div className="text-xs text-slate-400">Risk horizon</div>
                  <div className="text-lg font-bold text-slate-300">
                    {bond_sweep_result.target_year} @ {risk_threshold}% risk
                  </div>
                </div>
                <div className="rounded bg-slate-800/50 p-3">
                  <div className="text-xs text-slate-400">Bankruptcy Risk</div>
                  <div className={`text-lg font-bold ${opt.bankruptcy_pct <= 5 ? "text-green-400" : opt.bankruptcy_pct <= 10 ? "text-amber-400" : "text-red-400"}`}>
                    {opt.bankruptcy_pct.toFixed(1)}%
                  </div>
                </div>
                <div className="rounded bg-slate-800/50 p-3">
                  <div className="text-xs text-slate-400">Depletion Risk</div>
                  <div className={`text-lg font-bold ${opt.depletion_pct <= 10 ? "text-green-400" : opt.depletion_pct <= 25 ? "text-amber-400" : "text-red-400"}`}>
                    {opt.depletion_pct.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
