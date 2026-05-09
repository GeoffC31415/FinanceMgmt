import type { SimulationResponse } from "../types";

/**
 * Adjust an array of nominal values to real (today's purchasing power) values.
 * Formula: real_value = nominal_value / (1 + inflation_rate)^(year - start_year)
 */
export function adjustForInflation(
  values: number[],
  years: number[],
  inflationRate: number,
  startYear: number
): number[] {
  return values.map((v, idx) => {
    const year = years[idx];
    const yearsElapsed = year - startYear;
    const inflationFactor = Math.pow(1 + inflationRate, yearsElapsed);
    return v / inflationFactor;
  });
}

/**
 * Apply inflation adjustment to all monetary fields in the simulation result.
 * Percentage fields (mortgage_paid_off, is_depleted, is_bankrupt) are left unchanged.
 */
export function applyInflationAdjustment(
  result: SimulationResponse,
  inflationRate: number,
  startYear: number
): SimulationResponse {
  const adjust = (arr: number[]) =>
    arr?.length ? adjustForInflation(arr, result.years, inflationRate, startYear) : (arr ?? []);
  const adjustOptional = (arr: number[] | undefined) =>
    arr?.length ? adjustForInflation(arr, result.years, inflationRate, startYear) : arr;

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
    state_pension_tax_paid_median: result.state_pension_tax_paid_median
      ? adjust(result.state_pension_tax_paid_median)
      : undefined,
    ni_paid_median: adjust(result.ni_paid_median),
    total_tax_median: adjust(result.total_tax_median),
    salary_income_tax_paid_median: adjust(result.salary_income_tax_paid_median),
    rental_income_tax_paid_median: adjust(result.rental_income_tax_paid_median),
    pension_drawdown_tax_paid_median: adjust(result.pension_drawdown_tax_paid_median),
    capital_gains_tax_paid_median: adjust(result.capital_gains_tax_paid_median),
    gia_cgt_paid_median: adjustOptional(result.gia_cgt_paid_median),
    property_cgt_paid_median: adjustOptional(result.property_cgt_paid_median),
    salary_income_tax_personal_allowance_used_median: adjustOptional(result.salary_income_tax_personal_allowance_used_median),
    salary_income_tax_personal_allowance_lost_median: adjustOptional(result.salary_income_tax_personal_allowance_lost_median),
    salary_income_tax_basic_band_amount_median: adjustOptional(result.salary_income_tax_basic_band_amount_median),
    salary_income_tax_basic_band_tax_median: adjustOptional(result.salary_income_tax_basic_band_tax_median),
    salary_income_tax_higher_band_amount_median: adjustOptional(result.salary_income_tax_higher_band_amount_median),
    salary_income_tax_higher_band_tax_median: adjustOptional(result.salary_income_tax_higher_band_tax_median),
    salary_income_tax_additional_band_amount_median: adjustOptional(result.salary_income_tax_additional_band_amount_median),
    salary_income_tax_additional_band_tax_median: adjustOptional(result.salary_income_tax_additional_band_tax_median),
    salary_income_tax_allowance_taper_tax_median: adjustOptional(result.salary_income_tax_allowance_taper_tax_median),
    // P1.5/P1.6: Pension rules
    pension_annual_allowance_charge_median: adjustOptional(result.pension_annual_allowance_charge_median),
    pension_tax_free_cash_remaining_median: adjustOptional(result.pension_tax_free_cash_remaining_median),
    pension_tax_free_cash_taken_median: adjustOptional(result.pension_tax_free_cash_taken_median),
    pension_mpaa_active_median: adjustOptional(result.pension_mpaa_active_median),
    pension_annual_allowance_median: adjustOptional(result.pension_annual_allowance_median),
    pension_tapered_allowance_median: adjustOptional(result.pension_tapered_allowance_median),
    pension_is_tapered_median: adjustOptional(result.pension_is_tapered_median),
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
    property_value_median: adjust(result.property_value_median),
    property_returns_median: adjust(result.property_returns_median),
    property_rental_income_median: adjust(result.property_rental_income_median),
    property_maintenance_median: adjust(result.property_maintenance_median),
    // Percentage fields don't get adjusted:
    // mortgage_paid_off_median, is_depleted_median, is_bankrupt_median
  };
}
