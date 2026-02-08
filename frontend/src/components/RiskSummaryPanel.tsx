import type { SafeWithdrawalResponse } from "../types";

type Props = {
  safe_withdrawal: SafeWithdrawalResponse | null;
  is_loading: boolean;
  current_fun_fund: number;
  bankruptcy_pct: number;
  depletion_pct: number;
  risk_threshold: number;
  on_risk_threshold_change: (value: number) => void;
  on_set_fun_fund: (value: number) => void;
};

const RISK_PRESETS = [1, 2, 5, 10];

export function RiskSummaryPanel({
  safe_withdrawal,
  is_loading,
  current_fun_fund,
  bankruptcy_pct,
  depletion_pct,
  risk_threshold,
  on_risk_threshold_change,
  on_set_fun_fund,
}: Props) {
  const max_safe = safe_withdrawal?.max_safe_fun_fund ?? 0;
  const success_rate = 100 - bankruptcy_pct;

  // Color for success rate
  const success_color =
    success_rate >= 95
      ? "text-emerald-400"
      : success_rate >= 90
        ? "text-amber-400"
        : "text-rose-400";

  // Color for current fun fund relative to max safe
  const is_over_safe = current_fun_fund > max_safe && max_safe > 0;
  const fund_ratio = max_safe > 0 ? current_fun_fund / max_safe : 0;
  const fund_color =
    fund_ratio <= 0.8
      ? "text-emerald-400"
      : fund_ratio <= 1.0
        ? "text-amber-400"
        : "text-rose-400";

  const fund_bg =
    fund_ratio <= 0.8
      ? "bg-emerald-500/10 border-emerald-500/30"
      : fund_ratio <= 1.0
        ? "bg-amber-500/10 border-amber-500/30"
        : "bg-rose-500/10 border-rose-500/30";

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Risk Analysis
        </h2>
        {is_loading && (
          <span className="text-xs text-slate-500 animate-pulse">
            Computing safe withdrawal...
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Max Safe Fun Fund */}
        <div className={`rounded-lg border p-4 ${fund_bg}`}>
          <div className="text-xs font-medium text-slate-400 mb-1">
            Max Safe Fun Fund
            <span className="ml-1 text-slate-500">
              (at {risk_threshold}% risk)
            </span>
          </div>
          <div className={`text-2xl font-bold ${fund_color}`}>
            {safe_withdrawal
              ? `£${Math.round(max_safe).toLocaleString()}`
              : "---"}
            <span className="text-sm font-normal text-slate-500">/year</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {safe_withdrawal && current_fun_fund !== max_safe && (
              <button
                className="rounded bg-slate-700/80 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-600 transition-colors"
                onClick={() => on_set_fun_fund(max_safe)}
              >
                Set to safe max
              </button>
            )}
            {is_over_safe && (
              <span className="text-xs text-rose-400">
                Current spend exceeds safe limit
              </span>
            )}
          </div>
        </div>

        {/* Success Rate */}
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
          <div className="text-xs font-medium text-slate-400 mb-1">
            Success Rate
          </div>
          <div className={`text-2xl font-bold ${success_color}`}>
            {success_rate.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            of simulations avoid bankruptcy
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Depletion:</span>
              <span
                className={
                  depletion_pct === 0
                    ? "text-emerald-400"
                    : depletion_pct < 10
                      ? "text-amber-400"
                      : "text-rose-400"
                }
              >
                {depletion_pct.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Bankruptcy:</span>
              <span
                className={
                  bankruptcy_pct === 0
                    ? "text-emerald-400"
                    : bankruptcy_pct < 5
                      ? "text-amber-400"
                      : "text-rose-400"
                }
              >
                {bankruptcy_pct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Risk Threshold Selector */}
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
          <div className="text-xs font-medium text-slate-400 mb-2">
            Risk Tolerance
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RISK_PRESETS.map((pct) => (
              <button
                key={pct}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  risk_threshold === pct
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-700/60 text-slate-300 hover:bg-slate-600"
                }`}
                onClick={() => on_risk_threshold_change(pct)}
              >
                {pct}% risk
              </button>
            ))}
          </div>
          <div className="mt-2.5 text-xs text-slate-500">
            {risk_threshold <= 2
              ? "Very conservative -- prioritizes capital preservation"
              : risk_threshold <= 5
                ? "Moderate -- balances spending and safety"
                : "Aggressive -- accepts higher failure chance for more spending"}
          </div>
        </div>
      </div>
    </div>
  );
}
