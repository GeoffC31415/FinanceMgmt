import { useMemo } from "react";
import type { ScenarioRead, SimulationResponse, SafeWithdrawalResponse } from "../../types";
import { applyInflationAdjustment } from "../../utils/inflation";

interface UseDashboardDataProps {
  result: SimulationResponse | null;
  selected: ScenarioRead | null;
  show_real_values: boolean;
  percentile: number;
  retirement_age_offset: number;
  safe_withdrawal_result: SafeWithdrawalResponse | null;
  annual_spend_target: number;
}

export interface DashboardDerivedData {
  display_result: SimulationResponse | null;
  end_year_deflator: number;
  overview_metrics: {
    success_rate: number;
    peak_value: number;
    peak_year: number;
    final_net_worth_median: number;
    final_net_worth_p10: number;
    final_net_worth_p90: number;
    final_year: number;
  } | null;
  retirement_ages: { name: string; base_age: number; effective_age: number }[];
  children_leaving: { name: string; year: number }[];
  adult_decade_years: { year: number; age: number; label: string; adultIndex: number }[];
  mortgage_payoff_year: number | null;
  bankruptcy_info: {
    first_year_any: number | null;
    first_year_at_percentile: number | null;
    final_pct: number;
  } | null;
  final_bankruptcy_pct: number;
  final_depletion_pct: number;
  max_safe: number;
  fund_ratio: number;
  slider_accent: string;
  success_color: (rate: number) => string;
}

export function useDashboardData({
  result,
  selected,
  show_real_values,
  percentile,
  retirement_age_offset,
  safe_withdrawal_result,
  annual_spend_target,
}: UseDashboardDataProps): DashboardDerivedData {
  // Apply inflation adjustment
  const display_result = useMemo(() => {
    if (!result) return null;
    return show_real_values
      ? applyInflationAdjustment(result, result.inflation_rate, result.start_year)
      : result;
  }, [result, show_real_values]);

  // Deflation factor for end-year point values
  const end_year_deflator = useMemo(() => {
    if (!display_result || !show_real_values) return 1;
    const years_elapsed = display_result.years[display_result.years.length - 1] - display_result.start_year;
    return 1 / Math.pow(1 + display_result.inflation_rate, years_elapsed);
  }, [display_result, show_real_values]);

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
    const markers: { year: number; age: number; label: string; adultIndex: number }[] = [];
    for (let ai = 0; ai < adults.length; ai++) {
      const adult = adults[ai];
      const birth_year = parseInt(adult.birth_date.split("-")[0], 10);
      if (isNaN(birth_year)) continue;
      for (let age = 40; age <= 100; age += 10) {
        const y = birth_year + age;
        if (y >= minYear && y <= maxYear) markers.push({ year: y, age, label: adult.label, adultIndex: ai });
      }
    }
    return markers;
  }, [selected, display_result]);

  // Calculate when mortgage is paid off
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

  // Final-year risk metrics
  const final_bankruptcy_pct = bankruptcy_info?.final_pct ?? 0;
  const final_depletion_pct = useMemo(() => {
    if (!result) return 0;
    const lastIdx = result.years.length - 1;
    return lastIdx >= 0 ? result.is_depleted_median[lastIdx] : 0;
  }, [result]);

  // Computed overview metrics for the metric cards
  const overview_metrics = useMemo(() => {
    if (!display_result) return null;
    const last_idx = display_result.years.length - 1;
    if (last_idx < 0) return null;

    const final_bankruptcy = display_result.is_bankrupt_median[last_idx] ?? 0;
    const success_rate = 100 - final_bankruptcy;

    // Peak net worth (median)
    let peak_value = -Infinity;
    let peak_year = display_result.years[0];
    for (let i = 0; i <= last_idx; i++) {
      if (display_result.net_worth_median[i] > peak_value) {
        peak_value = display_result.net_worth_median[i];
        peak_year = display_result.years[i];
      }
    }

    const final_net_worth_median = display_result.net_worth_median[last_idx];
    const final_net_worth_p10 = display_result.net_worth_p10[last_idx];
    const final_net_worth_p90 = display_result.net_worth_p90[last_idx];
    const final_year = display_result.years[last_idx];

    return {
      success_rate,
      peak_value,
      peak_year,
      final_net_worth_median,
      final_net_worth_p10,
      final_net_worth_p90,
      final_year,
    };
  }, [display_result]);

  // Color helper for success rate
  const success_color = (rate: number) =>
    rate >= 95 ? "text-emerald-400" : rate >= 90 ? "text-amber-400" : "text-rose-400";

  return {
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
  };
}
