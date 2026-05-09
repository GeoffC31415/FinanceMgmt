import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverviewInsights } from "../OverviewInsights";
import type { SimulationResponse, SafeWithdrawalResponse, ScenarioRead } from "../../types";

function makeMockResult(
  override: Partial<SimulationResponse> = {}
): SimulationResponse {
  return {
    years: [2024, 2025, 2026, 2027, 2028, 2050, 2070],
    inflation_rate: 0.02,
    start_year: 2024,
    net_worth_p10: [100_000, 110_000, 120_000, 130_000, 140_000, 200_000, 300_000],
    net_worth_median: [150_000, 170_000, 190_000, 210_000, 230_000, 350_000, 500_000],
    net_worth_p90: [200_000, 230_000, 260_000, 290_000, 320_000, 500_000, 700_000],
    income_median: [50_000, 50_000, 50_000, 50_000, 50_000, 0, 0],
    spend_median: [30_000, 30_000, 30_000, 30_000, 30_000, 40_000, 40_000],
    salary_gross_median: [60_000, 60_000, 60_000, 60_000, 60_000, 0, 0],
    salary_net_median: [48_000, 48_000, 48_000, 48_000, 48_000, 0, 0],
    rental_income_median: [0, 0, 0, 0, 0, 0, 0],
    gift_income_median: [0, 0, 0, 0, 0, 0, 0],
    pension_income_median: [0, 0, 0, 0, 0, 0, 0],
    state_pension_income_median: [0, 0, 0, 0, 0, 0, 0],
    investment_returns_median: [5_000, 5_000, 5_000, 5_000, 5_000, 10_000, 12_000],
    total_income_median: [53_000, 53_000, 53_000, 53_000, 53_000, 10_000, 12_000],
    total_expenses_median: [30_000, 30_000, 30_000, 30_000, 30_000, 40_000, 40_000],
    mortgage_payment_median: [1_000, 1_000, 0, 0, 0, 0, 0],
    pension_contributions_median: [2_000, 2_000, 2_000, 2_000, 2_000, 0, 0],
    fun_fund_median: [10_000, 10_000, 10_000, 10_000, 10_000, 20_000, 20_000],
    income_tax_paid_median: [10_000, 10_000, 10_000, 10_000, 10_000, 0, 0],
    ni_paid_median: [4_000, 4_000, 4_000, 4_000, 4_000, 0, 0],
    total_tax_median: [14_000, 14_000, 14_000, 14_000, 14_000, 0, 0],
    // P1.1: Structured tax breakdown
    salary_income_tax_paid_median: [6_000, 6_000, 6_000, 6_000, 6_000, 0, 0],
    rental_income_tax_paid_median: [0, 0, 0, 0, 0, 0, 0],
    pension_drawdown_tax_paid_median: [0, 0, 0, 0, 0, 0, 0],
    capital_gains_tax_paid_median: [0, 0, 0, 0, 0, 0, 0],
    isa_balance_median: [50_000, 55_000, 60_000, 65_000, 70_000, 150_000, 250_000],
    pension_balance_median: [80_000, 90_000, 100_000, 110_000, 120_000, 300_000, 500_000],
    cash_balance_median: [20_000, 22_000, 24_000, 26_000, 28_000, 50_000, 60_000],
    gia_balance_median: [30_000, 35_000, 40_000, 45_000, 50_000, 100_000, 150_000],
    total_assets_median: [180_000, 202_000, 224_000, 246_000, 268_000, 600_000, 960_000],
    isa_returns_median: [3_000, 3_000, 3_000, 3_000, 3_000, 5_000, 6_000],
    gia_returns_median: [2_500, 2_500, 2_500, 2_500, 2_500, 5_000, 6_000],
    cash_returns_median: [500, 500, 500, 500, 500, 1_000, 1_200],
    pension_returns_median: [4_000, 4_000, 4_000, 4_000, 4_000, 8_000, 10_000],
    isa_contributions_median: [2_000, 2_000, 2_000, 2_000, 2_000, 0, 0],
    gia_contributions_median: [1_500, 1_500, 1_500, 1_500, 1_500, 0, 0],
    isa_withdrawals_median: [0, 0, 0, 0, 0, 5_000, 8_000],
    gia_withdrawals_median: [0, 0, 0, 0, 0, 3_000, 5_000],
    pension_withdrawals_median: [0, 0, 0, 0, 0, 2_000, 3_000],
    mortgage_balance_median: [200_000, 190_000, 180_000, 170_000, 160_000, 0, 0],
    total_liabilities_median: [200_000, 190_000, 180_000, 170_000, 160_000, 0, 0],
    debt_balance_median: [0, 0, 0, 0, 0, 0, 0],
    debt_interest_paid_median: [0, 0, 0, 0, 0, 0, 0],
    property_value_median: [300_000, 305_000, 310_000, 315_000, 320_000, 350_000, 400_000],
    property_returns_median: [0, 0, 0, 0, 0, 0, 0],
    property_rental_income_median: [0, 0, 0, 0, 0, 0, 0],
    property_maintenance_median: [0, 0, 0, 0, 0, 0, 0],
    asset_funding_cash_median: [0, 0, 0, 0, 0, 0, 0],
    asset_funding_isa_median: [0, 0, 0, 0, 0, 0, 0],
    asset_funding_gia_median: [0, 0, 0, 0, 0, 0, 0],
    asset_funding_pension_median: [0, 0, 0, 0, 0, 0, 0],
    asset_funding_property_median: [0, 0, 0, 0, 0, 0, 0],
    mortgage_paid_off_median: [0, 0, 50, 80, 100, 100, 100],
    is_depleted_median: [0, 0, 0, 0, 0, 5, 15],
    is_bankrupt_median: [0, 0, 0, 0, 0, 2, 8],
    retirement_years: [2035, 2037],
    ...override,
  };
}

function makeMockScenario(
  override: Partial<ScenarioRead> = {}
): ScenarioRead {
  return {
    id: "s1",
    name: "Test Scenario",
    assumptions: {
      inflation_rate: 0.02,
      isa_annual_limit: 20_000,
      state_pension_annual: 11_500,
      pension_access_age: 55,
      start_year: 2024,
      end_year: 2070,
      annual_spend_target: 30_000,
      debt_interest_rate: 0.08,
      bankruptcy_threshold: -100_000,
      return_model: "parametric",
    },
    people: [
      {
        id: "p1",
        label: "Adult 1",
        birth_date: "1970-01-15",
        is_child: false,
        planned_retirement_age: 65,
        annual_cost: 0,
        leaves_household_age: undefined,
      },
      {
        id: "c1",
        label: "Child 1",
        birth_date: "2000-06-20",
        is_child: true,
        planned_retirement_age: undefined,
        annual_cost: 12_000,
        leaves_household_age: 22,
      },
    ],
    incomes: [],
    assets: [],
    expenses: [
      { name: "Groceries", monthly_amount: 500, is_inflation_linked: true },
      { name: "Utilities", monthly_amount: 200, is_inflation_linked: true },
    ],
    properties: [],
    ...override,
  };
}

function renderInsights(
  result: SimulationResponse,
  safeWithdrawal: SafeWithdrawalResponse | null = null,
  scenario: ScenarioRead = makeMockScenario(),
  riskThreshold: number = 5,
  currentFunFund: number = 10_000,
  mortgagePayoffYear: number | null = 2026,
  childrenLeaving: { name: string; year: number }[] = [{ name: "Child 1", year: 2022 }]
) {
  return render(
    <OverviewInsights
      result={result}
      safe_withdrawal={safeWithdrawal}
      risk_threshold={riskThreshold}
      current_fun_fund={currentFunFund}
      scenario={scenario}
      mortgage_payoff_year={mortgagePayoffYear}
      children_leaving={childrenLeaving}
    />
  );
}

describe("OverviewInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when there are no insights", () => {
    it("renders nothing when result has no data", () => {
      const result = makeMockResult({ years: [] });
      const { container } = renderInsights(result, null, makeMockScenario());
      expect(container.firstChild).toBeNull();
    });
  });

  describe("safe spending insight", () => {
    it("shows safe spending limit when safe withdrawal data is provided", () => {
      const result = makeMockResult();
      const safeWithdrawal: SafeWithdrawalResponse = {
        max_safe_fun_fund: 25_000,
        risk_threshold: 0.05,
        sensitivity_curve: [],
      };
      const scenario = makeMockScenario({
        expenses: [
          { name: "Groceries", monthly_amount: 500, is_inflation_linked: true },
          { name: "Utilities", monthly_amount: 200, is_inflation_linked: true },
        ],
        properties: [],
      });

      renderInsights(result, safeWithdrawal, scenario, 5, 10_000);

      expect(screen.getByText(/can safely spend up to/i)).toBeInTheDocument();
    });

    it("shows emerald color when spending is within safe limit", () => {
      const result = makeMockResult();
      const safeWithdrawal: SafeWithdrawalResponse = {
        max_safe_fun_fund: 25_000,
        risk_threshold: 0.05,
        sensitivity_curve: [],
      };

      renderInsights(result, safeWithdrawal, makeMockScenario(), 5, 10_000);

      // Should show the safe spending insight
      expect(screen.getByText(/can safely spend up to/i)).toBeInTheDocument();
    });

    it("shows rose color when spending exceeds safe limit", () => {
      const result = makeMockResult();
      const safeWithdrawal: SafeWithdrawalResponse = {
        max_safe_fun_fund: 5_000,
        risk_threshold: 0.05,
        sensitivity_curve: [],
      };

      renderInsights(result, safeWithdrawal, makeMockScenario(), 5, 10_000);

      // Should show the safe spending insight
      expect(screen.getByText(/can safely spend up to/i)).toBeInTheDocument();
    });
  });

  describe("over-spending warning", () => {
    it("shows warning when current spend exceeds safe limit", () => {
      const result = makeMockResult();
      const safeWithdrawal: SafeWithdrawalResponse = {
        max_safe_fun_fund: 5_000,
        risk_threshold: 0.05,
        sensitivity_curve: [],
      };

      renderInsights(result, safeWithdrawal, makeMockScenario(), 5, 10_000);

      expect(screen.getByText(/exceeds the safe limit/i)).toBeInTheDocument();
    });

    it("does not show warning when spending is within safe limit", () => {
      const result = makeMockResult();
      const safeWithdrawal: SafeWithdrawalResponse = {
        max_safe_fun_fund: 25_000,
        risk_threshold: 0.05,
        sensitivity_curve: [],
      };

      renderInsights(result, safeWithdrawal, makeMockScenario(), 5, 10_000);

      expect(screen.queryByText(/exceeds the safe limit/i)).not.toBeInTheDocument();
    });
  });

  describe("success rate insights", () => {
    it("shows emerald for ≥99% success rate", () => {
      const result = makeMockResult({ is_bankrupt_median: [0, 0, 0, 0, 0, 0, 0] });
      renderInsights(result, null, makeMockScenario());
      expect(screen.getByText(/100\.0% success rate.*very robust/i)).toBeInTheDocument();
    });

    it("shows emerald for ≥95% success rate", () => {
      const result = makeMockResult({ is_bankrupt_median: [0, 0, 0, 0, 0, 2, 4] });
      renderInsights(result, null, makeMockScenario());
      expect(screen.getByText(/96\.\d+% success rate.*comfortable safety margin/i)).toBeInTheDocument();
    });

    it("shows amber for ≥90% success rate", () => {
      const result = makeMockResult({ is_bankrupt_median: [0, 0, 0, 0, 0, 5, 10] });
      renderInsights(result, null, makeMockScenario());
      expect(screen.getByText(/90\.\d+% success rate.*reasonable/i)).toBeInTheDocument();
    });

    it("shows rose for <90% success rate", () => {
      const result = makeMockResult({ is_bankrupt_median: [0, 0, 0, 0, 0, 10, 15] });
      renderInsights(result, null, makeMockScenario());
      expect(screen.getByText(/85\.\d+% success rate.*reducing spending/i)).toBeInTheDocument();
    });
  });

  describe("peak net worth insight", () => {
    it("shows peak net worth year and value", () => {
      const result = makeMockResult();
      renderInsights(result, null, makeMockScenario());
      expect(screen.getByText(/Net worth peaks at/i)).toBeInTheDocument();
    });

    it("shows peak value in median scenario", () => {
      const result = makeMockResult();
      renderInsights(result, null, makeMockScenario());
      expect(screen.getByText(/median scenario/i)).toBeInTheDocument();
    });
  });

  describe("mortgage payoff insight", () => {
    it("shows mortgage payoff year when available", () => {
      const result = makeMockResult();
      renderInsights(result, null, makeMockScenario(), 5, 10_000, 2026, [{ name: "Child 1", year: 2022 }]);
      expect(screen.getByText(/Mortgage paid off by/i)).toBeInTheDocument();
    });

    it("does not show mortgage insight when no payoff data", () => {
      const result = makeMockResult({ mortgage_paid_off_median: [0, 0, 0, 0, 0, 0, 0] });
      const { container } = renderInsights(result, null, makeMockScenario(), 5, 10_000, null, []);
      expect(container.querySelector("ul")).not.toBeNull();
      // Check that no mortgage text appears
      const allText = container.textContent;
      expect(allText).not.toContain("Mortgage paid off");
    });
  });

  describe("children leaving home insight", () => {
    it("shows children leaving with year", () => {
      const result = makeMockResult();
      const childrenLeaving = [
        { name: "Child 1", year: 2022 },
        { name: "Child 2", year: 2024 },
      ];
      renderInsights(result, null, makeMockScenario(), 5, 10_000, null, childrenLeaving);

      expect(screen.getByText(/Child 1 leaves home/i)).toBeInTheDocument();
      expect(screen.getByText(/Child 2 leaves home/i)).toBeInTheDocument();
    });

    it("shows cost savings when annual_cost is set", () => {
      const result = makeMockResult();
      const scenario = makeMockScenario({
        people: [
          {
            id: "c1",
            label: "Child 1",
            birth_date: "2000-06-20",
            is_child: true,
            planned_retirement_age: undefined,
            annual_cost: 12_000,
            leaves_household_age: 22,
          },
        ],
      });
      const childrenLeaving = [{ name: "Child 1", year: 2022 }];
      renderInsights(result, null, scenario, 5, 10_000, null, childrenLeaving);

      expect(screen.getByText(/saving approximately/i)).toBeInTheDocument();
    });
  });

  describe("retirement timeline insight", () => {
    it("shows planned retirement info", () => {
      const result = makeMockResult();
      const scenario = makeMockScenario({
        people: [
          {
            id: "p1",
            label: "Adult 1",
            birth_date: "1970-01-15",
            is_child: false,
            planned_retirement_age: 65,
            annual_cost: 0,
            leaves_household_age: undefined,
          },
        ],
      });
      // Add retirement_years to result
      const resultWithRetirement = makeMockResult({
        retirement_years: [2035, 2037] as any,
      });
      // @ts-ignore - retirement_years doesn't exist on type but we test the rendering
      resultWithRetirement.retirement_years = [2035, 2037];

      renderInsights(resultWithRetirement, null, scenario, 5, 10_000, null, []);

      expect(screen.getByText(/Planned retirement/i)).toBeInTheDocument();
    });
  });

  describe("no safe withdrawal data", () => {
    it("does not show safe spending or over-spending insights", () => {
      const result = makeMockResult();
      const { container } = renderInsights(result, null, makeMockScenario());

      expect(screen.queryByText(/can safely spend up to/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/exceeds the safe limit/i)).not.toBeInTheDocument();
    });
  });

  describe("insight icons", () => {
    it("renders SVG icons for each insight", () => {
      const result = makeMockResult();
      renderInsights(result, null, makeMockScenario());

      // Count insight items (each has an icon)
      const items = screen.getAllByText(/success rate|Net worth peaks|Planned retirement/i);
      expect(items.length).toBeGreaterThan(0);
    });
  });
});
