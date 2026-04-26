import type { SimulationResponse, SafeWithdrawalResponse, ScenarioRead } from "../../types";
import { NetWorthChart } from "../charts/NetWorthChart";
import { OverviewInsights } from "../OverviewInsights";
import type { BondAllocations } from "./utils";
import type { DashboardDerivedData } from "./useDashboardData";

type Props = {
  display_result: SimulationResponse | null;
  safe_withdrawal_result: SafeWithdrawalResponse | null;
  risk_threshold: number;
  setRiskThreshold: (v: number) => void;
  annual_spend_target: number;
  setAnnualSpendTarget: (v: number) => void;
  selected: ScenarioRead | null;
  overview_metrics: DashboardDerivedData["overview_metrics"];
  success_color: (rate: number) => string;
  mortgage_payoff_year: DashboardDerivedData["mortgage_payoff_year"];
  children_leaving: DashboardDerivedData["children_leaving"];
  adult_decade_years: DashboardDerivedData["adult_decade_years"];
  bankruptcy_info: DashboardDerivedData["bankruptcy_info"];
  percentile: number;
  setPercentile: (v: number) => void;
  handle_export: () => Promise<void>;
  show_real_values: boolean;
  setShowRealValues: (v: boolean) => void;
  max_safe: number;
  slider_accent: string;
};

export function OverviewTab({
  display_result,
  safe_withdrawal_result,
  risk_threshold,
  setRiskThreshold,
  annual_spend_target,
  setAnnualSpendTarget,
  selected,
  overview_metrics,
  success_color,
  mortgage_payoff_year,
  children_leaving,
  adult_decade_years,
  bankruptcy_info,
  percentile,
  setPercentile,
  handle_export,
  show_real_values,
  setShowRealValues,
  max_safe,
  slider_accent,
}: Props) {
  return (
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
                ? `£${Math.round(max_safe).toLocaleString()}`
                : "---"}
              <span className="text-sm font-normal text-slate-500">/yr</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              max extra retirement spend at {risk_threshold}% risk
            </div>
          </div>

          {/* Peak Net Worth */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-4">
            <div className="text-xs font-medium text-slate-400 mb-1">Peak Net Worth</div>
            <div className="text-3xl font-bold text-cyan-400">
              {overview_metrics.peak_value >= 0 ? `£${Math.round(overview_metrics.peak_value).toLocaleString()}` : "---"}
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
              £{Math.round(overview_metrics.final_net_worth_median).toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              P10: £{Math.round(overview_metrics.final_net_worth_p10).toLocaleString()}
              {" / "}
              P90: £{Math.round(overview_metrics.final_net_worth_p90).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Auto-Generated Insights */}
      {display_result && selected && (
        <OverviewInsights
          result={display_result}
          safe_withdrawal={safe_withdrawal_result}
          risk_threshold={risk_threshold}
          current_fun_fund={annual_spend_target}
          scenario={selected}
          mortgage_payoff_year={mortgage_payoff_year}
          children_leaving={children_leaving}
        />
      )}

      {/* Net Worth Chart */}
      {display_result && (
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
          property_value_median={display_result.property_value_median}
          total_assets_median={display_result.total_assets_median}
          percentile={percentile}
          bankruptcy_year={bankruptcy_info?.first_year_at_percentile}
          debt_balance_median={display_result.debt_balance_median}
        />
      )}
    </>
  );
}
