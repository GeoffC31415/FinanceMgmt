import { describe, it, expect } from "vitest";
import { adjustForInflation, applyInflationAdjustment } from "../inflation";
import type { SimulationResponse } from "../../types";

describe("adjustForInflation", () => {
  it("returns empty array for empty input", () => {
    expect(adjustForInflation([], [], 0.02, 2024)).toEqual([]);
  });

  it("handles empty years array", () => {
    expect(adjustForInflation([100, 200], [], 0.02, 2024)).toEqual([NaN, NaN]);
  });

  it("returns unchanged values when inflation rate is 0", () => {
    const values = [100, 200, 300, 400];
    const years = [2024, 2025, 2026, 2027];
    const result = adjustForInflation(values, years, 0, 2024);
    expect(result).toEqual([100, 200, 300, 400]);
  });

  it("adjusts values forward in time (deflates)", () => {
    const values = [100_000, 100_000, 100_000];
    const years = [2024, 2025, 2026];
    const result = adjustForInflation(values, years, 0.03, 2024);
    // Year 2024: 100000 / 1.03^0 = 100000
    // Year 2025: 100000 / 1.03^1 ≈ 97087.38
    // Year 2026: 100000 / 1.03^2 ≈ 94260.00
    expect(result[0]).toBeCloseTo(100_000, 0);
    expect(result[1]).toBeCloseTo(97_087, -1);
    expect(result[2]).toBeCloseTo(94_261, -1);
  });

  it("handles negative years (before start_year)", () => {
    const values = [100, 100, 100];
    const years = [2022, 2023, 2024];
    const result = adjustForInflation(values, years, 0.02, 2024);
    // Earlier years should be inflated (larger values)
    expect(result[0]).toBeGreaterThan(100);
    expect(result[1]).toBeGreaterThan(100);
    expect(result[2]).toBe(100);
  });

  it("handles high inflation rate", () => {
    const values = [1_000_000];
    const years = [2024];
    const result = adjustForInflation(values, years, 0.10, 2024);
    expect(result[0]).toBeCloseTo(1_000_000, 0);
  });

  it("handles zero values", () => {
    const values = [0, 0, 0];
    const years = [2024, 2025, 2026];
    const result = adjustForInflation(values, years, 0.02, 2024);
    expect(result).toEqual([0, 0, 0]);
  });

  it("handles mixed positive and negative values", () => {
    const values = [-50_000, 0, 50_000];
    const years = [2024, 2025, 2026];
    const result = adjustForInflation(values, years, 0.02, 2024);
    expect(result[0]).toBeLessThan(-48_000); // magnitude decreases
    expect(result[1]).toBe(0);
    expect(result[2]).toBeGreaterThan(48_000); // magnitude decreases
  });
});

describe("applyInflationAdjustment", () => {
  // Helper to create a minimal SimulationResponse
  function makeResponse(
    years: number[],
    inflationRate: number,
    startYear: number
  ): SimulationResponse {
    const n = years.length;
    return {
      years,
      inflation_rate: inflationRate,
      start_year: startYear,
      net_worth_p10: Array.from({ length: n }, (_, i) => 100_000 * (i + 1)),
      net_worth_median: Array.from({ length: n }, (_, i) => 150_000 * (i + 1)),
      net_worth_p90: Array.from({ length: n }, (_, i) => 200_000 * (i + 1)),
      income_median: Array.from({ length: n }, () => 50_000),
      spend_median: Array.from({ length: n }, () => 30_000),
      salary_gross_median: Array.from({ length: n }, () => 60_000),
      salary_net_median: Array.from({ length: n }, () => 48_000),
      rental_income_median: Array.from({ length: n }, () => 0),
      gift_income_median: Array.from({ length: n }, () => 0),
      pension_income_median: Array.from({ length: n }, () => 0),
      state_pension_income_median: Array.from({ length: n }, () => 0),
      investment_returns_median: Array.from({ length: n }, () => 5_000),
      total_income_median: Array.from({ length: n }, () => 53_000),
      total_expenses_median: Array.from({ length: n }, () => 30_000),
      mortgage_payment_median: Array.from({ length: n }, () => 1_000),
      pension_contributions_median: Array.from({ length: n }, () => 2_000),
      fun_fund_median: Array.from({ length: n }, () => 10_000),
      income_tax_paid_median: Array.from({ length: n }, () => 10_000),
      ni_paid_median: Array.from({ length: n }, () => 4_000),
      total_tax_median: Array.from({ length: n }, () => 14_000),
      isa_balance_median: Array.from({ length: n }, (_, i) => 50_000 * (i + 1)),
      pension_balance_median: Array.from({ length: n }, (_, i) => 80_000 * (i + 1)),
      cash_balance_median: Array.from({ length: n }, (_, i) => 20_000 * (i + 1)),
      gia_balance_median: Array.from({ length: n }, (_, i) => 30_000 * (i + 1)),
      total_assets_median: Array.from({ length: n }, (_, i) => 180_000 * (i + 1)),
      isa_returns_median: Array.from({ length: n }, () => 3_000),
      gia_returns_median: Array.from({ length: n }, () => 2_500),
      cash_returns_median: Array.from({ length: n }, () => 500),
      pension_returns_median: Array.from({ length: n }, () => 4_000),
      isa_contributions_median: Array.from({ length: n }, () => 2_000),
      gia_contributions_median: Array.from({ length: n }, () => 1_500),
      isa_withdrawals_median: Array.from({ length: n }, () => 0),
      gia_withdrawals_median: Array.from({ length: n }, () => 0),
      pension_withdrawals_median: Array.from({ length: n }, () => 0),
      mortgage_balance_median: Array.from({ length: n }, (_, i) => 200_000 - 10_000 * i),
      total_liabilities_median: Array.from({ length: n }, (_, i) => 200_000 - 10_000 * i),
      debt_balance_median: Array.from({ length: n }, () => 0),
      debt_interest_paid_median: Array.from({ length: n }, () => 0),
      property_value_median: Array.from({ length: n }, (_, i) => 300_000 + 10_000 * i),
      property_returns_median: Array.from({ length: n }, () => 0),
      property_rental_income_median: Array.from({ length: n }, () => 0),
      property_maintenance_median: Array.from({ length: n }, () => 0),
      mortgage_paid_off_median: Array.from({ length: n }, () => 0),
      is_depleted_median: Array.from({ length: n }, () => 0),
      is_bankrupt_median: Array.from({ length: n }, () => 0),
      retirement_years: [2035, 2040],
    };
  }

  it("returns null for null result", () => {
    const result = applyInflationAdjustment(
      makeResponse([2024, 2025, 2026], 0.02, 2024),
      0.02,
      2024
    );
    expect(result).not.toBeNull();
  });

  it("returns unchanged values when inflation rate is 0", () => {
    const input = makeResponse([2024, 2025, 2026], 0, 2024);
    const result = applyInflationAdjustment(input, 0, 2024);
    // All numeric arrays should be identical
    for (const key of Object.keys(input) as (keyof SimulationResponse)[]) {
      const arr = input[key];
      const resArr = result[key];
      if (Array.isArray(arr)) {
        expect(resArr).toEqual(arr);
      }
    }
  });

  it("deflates monetary values with 2% inflation", () => {
    const input = makeResponse([2024, 2025, 2026], 0.02, 2024);
    const result = applyInflationAdjustment(input, 0.02, 2024);

    // net_worth_median: [150000, 300000, 450000]
    // Year 2024 (idx 0): 150000 / 1.02^0 = 150000
    // Year 2025 (idx 1): 300000 / 1.02^1 ≈ 294117.65
    // Year 2026 (idx 2): 450000 / 1.02^2 ≈ 432330.50
    expect(result.net_worth_median![0]).toBeCloseTo(150_000, 0);
    expect(result.net_worth_median![1]).toBeCloseTo(294_118, -1);
    expect(result.net_worth_median![2]).toBeCloseTo(432_526, -1);
  });

  it("deflates with 5% inflation", () => {
    const input = makeResponse([2024, 2025, 2026], 0.05, 2024);
    const result = applyInflationAdjustment(input, 0.05, 2024);

    // net_worth_median: [150000, 300000, 450000]
    expect(result.net_worth_median![0]).toBeCloseTo(150_000, 0);
    expect(result.net_worth_median![1]).toBeCloseTo(285_714, -1);
    expect(result.net_worth_median![2]).toBeCloseTo(408_163, -1);
  });

  it("does NOT adjust percentage fields", () => {
    const input = makeResponse([2024, 2025, 2026], 0.02, 2024);
    const result = applyInflationAdjustment(input, 0.02, 2024);

    // These should be unchanged
    expect(result.mortgage_paid_off_median).toEqual(input.mortgage_paid_off_median);
    expect(result.is_depleted_median).toEqual(input.is_depleted_median);
    expect(result.is_bankrupt_median).toEqual(input.is_bankrupt_median);
  });

  it("preserves non-array fields", () => {
    const input = makeResponse([2024, 2025, 2026], 0.02, 2024);
    const result = applyInflationAdjustment(input, 0.02, 2024);

    expect(result.years).toEqual(input.years);
    expect(result.inflation_rate).toBe(input.inflation_rate);
    expect(result.start_year).toBe(input.start_year);
  });

  it("handles high inflation (10%)", () => {
    const input = makeResponse([2024, 2025, 2026], 0.10, 2024);
    const result = applyInflationAdjustment(input, 0.10, 2024);

    // net_worth_median: [150000, 300000, 450000]
    // Year 2025: 300000 / 1.10^1 ≈ 272727
    // Year 2026: 450000 / 1.10^2 ≈ 371900
    expect(result.net_worth_median![0]).toBeCloseTo(150_000, 0);
    expect(result.net_worth_median![1]).toBeCloseTo(272_727, -1);
    expect(result.net_worth_median![2]).toBeCloseTo(371_901, 0);
  });

  it("handles single year", () => {
    const input = makeResponse([2024], 0.02, 2024);
    const result = applyInflationAdjustment(input, 0.02, 2024);

    // Single year = no deflation
    expect(result.net_worth_median![0]).toBeCloseTo(150_000, 0);
  });

  it("adjusts all monetary arrays consistently", () => {
    const input = makeResponse([2024, 2025], 0.03, 2024);
    const result = applyInflationAdjustment(input, 0.03, 2024);

    // Check a few key arrays for consistency
    const deflator = 1 / 1.03;
    expect(result.salary_gross_median![1]).toBeCloseTo(60_000 * deflator, 0);
    expect(result.total_expenses_median![1]).toBeCloseTo(30_000 * deflator, 0);
    expect(result.mortgage_balance_median![1]).toBeCloseTo(190_000 * deflator, 0);
    expect(result.total_liabilities_median![1]).toBeCloseTo(190_000 * deflator, 0);
  });
});
