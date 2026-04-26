import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SimulationResponse } from "../../../types";
import { getTaxBreakdownSummary, TaxBreakdownPanel } from "../TaxBreakdownPanel";

function makeResult(overrides: Partial<SimulationResponse> = {}): SimulationResponse {
  const base: SimulationResponse = {
    years: [2025, 2026, 2027],
    net_worth_p10: [0, 0, 0],
    net_worth_median: [0, 0, 0],
    net_worth_p90: [0, 0, 0],
    income_median: [0, 0, 0],
    spend_median: [0, 0, 0],
    retirement_years: [],
    inflation_rate: 0.02,
    start_year: 2025,
    salary_gross_median: [0, 0, 0],
    salary_net_median: [0, 0, 0],
    rental_income_median: [0, 0, 0],
    gift_income_median: [0, 0, 0],
    pension_income_median: [0, 0, 0],
    state_pension_income_median: [0, 0, 0],
    investment_returns_median: [0, 0, 0],
    total_income_median: [0, 0, 0],
    total_expenses_median: [0, 0, 0],
    mortgage_payment_median: [0, 0, 0],
    pension_contributions_median: [0, 0, 0],
    fun_fund_median: [0, 0, 0],
    income_tax_paid_median: [6000, 7000, 8000],
    state_pension_tax_paid_median: [1200, 1800, 1600],
    ni_paid_median: [4000, 3000, 2000],
    total_tax_median: [10000, 10000, 10000],
    isa_balance_median: [0, 0, 0],
    pension_balance_median: [0, 0, 0],
    cash_balance_median: [0, 0, 0],
    gia_balance_median: [0, 0, 0],
    property_value_median: [0, 0, 0],
    total_assets_median: [0, 0, 0],
    isa_returns_median: [0, 0, 0],
    gia_returns_median: [0, 0, 0],
    cash_returns_median: [0, 0, 0],
    pension_returns_median: [0, 0, 0],
    property_returns_median: [0, 0, 0],
    isa_contributions_median: [0, 0, 0],
    gia_contributions_median: [0, 0, 0],
    isa_withdrawals_median: [0, 0, 0],
    gia_withdrawals_median: [0, 0, 0],
    pension_withdrawals_median: [0, 0, 0],
    property_rental_income_median: [0, 0, 0],
    property_maintenance_median: [0, 0, 0],
    mortgage_balance_median: [0, 0, 0],
    total_liabilities_median: [0, 0, 0],
    mortgage_paid_off_median: [0, 0, 0],
    is_depleted_median: [0, 0, 0],
    is_bankrupt_median: [0, 0, 0],
    debt_balance_median: [0, 0, 0],
    debt_interest_paid_median: [0, 0, 0],
  };

  return { ...base, ...overrides };
}

describe("TaxBreakdownPanel", () => {
  it("summarizes state pension tax for the final year and peak year", () => {
    const summary = getTaxBreakdownSummary(makeResult());

    expect(summary).toMatchObject({
      final_year: 2027,
      total_tax: 10000,
      income_tax_bucket: 8000,
      national_insurance: 2000,
      state_pension_tax: 1600,
      state_pension_tax_share_pct: 16,
      peak_state_pension_tax: 1800,
      peak_state_pension_tax_year: 2026,
    });
  });

  it("renders the state pension tax breakdown when backend data is present", () => {
    render(<TaxBreakdownPanel display_result={makeResult()} percentile={50} />);

    expect(screen.getByText("Tax Breakdown")).toBeInTheDocument();
    expect(screen.getByText("State pension tax")).toBeInTheDocument();
    expect(screen.getByText("£1,600")).toBeInTheDocument();
    expect(screen.getByText(/16% of total tax; peak £1,800 in 2026/)).toBeInTheDocument();
  });

  it("shows a compatibility message when state pension tax is missing", () => {
    const result = makeResult({ state_pension_tax_paid_median: undefined });

    render(<TaxBreakdownPanel display_result={result} percentile={10} />);

    expect(screen.getByText("(P10)")).toBeInTheDocument();
    expect(screen.getByText("Not returned")).toBeInTheDocument();
    expect(screen.getByText(/Run against a newer backend/)).toBeInTheDocument();
  });
});
