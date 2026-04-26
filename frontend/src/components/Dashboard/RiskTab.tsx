import type { SimulationResponse, SafeWithdrawalResponse } from "../../types";
import { RiskSummaryPanel } from "../RiskSummaryPanel";
import { SensitivityChart } from "../charts/SensitivityChart";
import { RiskTimelineChart } from "../charts/RiskTimelineChart";

type Props = {
  display_result: SimulationResponse | null;
  safe_withdrawal_result: SafeWithdrawalResponse | null;
  is_loading_safe_withdrawal: boolean;
  safe_withdrawal_error: string | null;
  annual_spend_target: number;
  final_bankruptcy_pct: number;
  final_depletion_pct: number;
  risk_threshold: number;
  setRiskThreshold: (v: number) => void;
  setAnnualSpendTarget: (v: number) => void;
  end_year_deflator: number;
};

export function RiskTab({
  display_result,
  safe_withdrawal_result,
  is_loading_safe_withdrawal,
  safe_withdrawal_error,
  annual_spend_target,
  final_bankruptcy_pct,
  final_depletion_pct,
  risk_threshold,
  setRiskThreshold,
  setAnnualSpendTarget,
  end_year_deflator,
}: Props) {
  return (
    <>
      <RiskSummaryPanel
        safe_withdrawal={safe_withdrawal_result}
        is_loading={is_loading_safe_withdrawal}
        error={safe_withdrawal_error}
        current_fun_fund={annual_spend_target}
        bankruptcy_pct={final_bankruptcy_pct}
        depletion_pct={final_depletion_pct}
        risk_threshold={risk_threshold}
        on_risk_threshold_change={setRiskThreshold}
        on_set_fun_fund={setAnnualSpendTarget}
      />

      {safe_withdrawal_result && safe_withdrawal_result.sensitivity_curve.length > 0 && display_result && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SensitivityChart
            sensitivity_curve={safe_withdrawal_result.sensitivity_curve}
            current_fun_fund={annual_spend_target}
            max_safe_fun_fund={safe_withdrawal_result.max_safe_fun_fund}
            risk_threshold={risk_threshold}
            net_worth_deflator={end_year_deflator}
          />
          <RiskTimelineChart
            years={display_result.years}
            is_depleted_median={display_result.is_depleted_median}
            is_bankrupt_median={display_result.is_bankrupt_median}
            retirement_years={display_result.retirement_years}
          />
        </div>
      )}

      {!safe_withdrawal_result && display_result && (
        <RiskTimelineChart
          years={display_result.years}
          is_depleted_median={display_result.is_depleted_median}
          is_bankrupt_median={display_result.is_bankrupt_median}
          retirement_years={display_result.retirement_years}
        />
      )}
    </>
  );
}
