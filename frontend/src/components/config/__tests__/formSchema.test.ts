import { describe, it, expect } from "vitest";
import { scenarioSchema } from "../formSchema";
import type { FormValues } from "../formSchema";

describe("scenarioSchema", () => {
  it("validates a complete valid scenario", () => {
    const validData = {
      name: "Test Scenario",
      assumptions: {
        inflation_rate: 0.02,
        isa_annual_limit: 20000,
        state_pension_annual: 11500,
        pension_access_age: 55,
        start_year: 2024,
        end_year: 2084,
        annual_spend_target: 30000,
        debt_interest_rate: 0.08,
        bankruptcy_threshold: -100000,
        return_model: "parametric" as const,
      },
      people: [
        {
          id: "p1",
          label: "Adult 1",
          birth_date: "1980-01-15",
          planned_retirement_age: 65,
          state_pension_age: 67,
          is_child: false,
        },
      ],
      incomes: [
        {
          person_id: "p1",
          kind: "salary",
          gross_annual: 50000,
          annual_growth_rate: 0.02,
          employee_pension_pct: 0.05,
          employer_pension_pct: 0.03,
        },
      ],
      assets: [
        {
          person_id: "p1",
          name: "ISA Account",
          asset_type: "ISA",
          withdrawal_priority: 100,
          balance: 50000,
          annual_contribution: 5000,
          growth_rate_mean: 0.06,
          growth_rate_std: 0.15,
          contributions_end_at_retirement: true,
          bond_allocation: 0.3,
        },
      ],
      properties: [],
      expenses: [
        {
          name: "Groceries",
          monthly_amount: 500,
          is_inflation_linked: true,
        },
      ],
    };

    const result = scenarioSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = scenarioSchema.safeParse({
      name: "",
      assumptions: {
        inflation_rate: 0.02,
        isa_annual_limit: 20000,
        state_pension_annual: 11500,
        pension_access_age: 55,
        start_year: 2024,
        end_year: 2084,
        annual_spend_target: 30000,
        debt_interest_rate: 0.08,
        bankruptcy_threshold: -100000,
        return_model: "parametric" as const,
      },
      people: [{ id: "p1", label: "Adult 1", birth_date: "1980-01-15", is_child: false }],
      incomes: [],
      assets: [],
      properties: [],
      expenses: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid birth_date format", () => {
    const result = scenarioSchema.safeParse({
      name: "Test",
      assumptions: {
        inflation_rate: 0.02,
        isa_annual_limit: 20000,
        state_pension_annual: 11500,
        pension_access_age: 55,
        start_year: 2024,
        end_year: 2084,
        annual_spend_target: 30000,
        debt_interest_rate: 0.08,
        bankruptcy_threshold: -100000,
        return_model: "parametric" as const,
      },
      people: [{ id: "p1", label: "Adult 1", birth_date: "01-15-1980", is_child: false }],
      incomes: [],
      assets: [],
      properties: [],
      expenses: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing people", () => {
    const result = scenarioSchema.safeParse({
      name: "Test",
      assumptions: {
        inflation_rate: 0.02,
        isa_annual_limit: 20000,
        state_pension_annual: 11500,
        pension_access_age: 55,
        start_year: 2024,
        end_year: 2084,
        annual_spend_target: 30000,
        debt_interest_rate: 0.08,
        bankruptcy_threshold: -100000,
        return_model: "parametric" as const,
      },
      people: [],
      incomes: [],
      assets: [],
      properties: [],
      expenses: [],
    });
    expect(result.success).toBe(false);
  });

  it("coerces string numbers to numbers", () => {
    const result = scenarioSchema.safeParse({
      name: "Test",
      assumptions: {
        inflation_rate: "0.02",
        isa_annual_limit: "20000",
        state_pension_annual: "11500",
        pension_access_age: "55",
        start_year: "2024",
        end_year: "2084",
        annual_spend_target: "30000",
        debt_interest_rate: "0.08",
        bankruptcy_threshold: "-100000",
        return_model: "parametric" as const,
      },
      people: [{ id: "p1", label: "Adult 1", birth_date: "1980-01-15", is_child: false }],
      incomes: [],
      assets: [],
      properties: [],
      expenses: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assumptions.inflation_rate).toBe(0.02);
      expect(result.data.assumptions.isa_annual_limit).toBe(20000);
    }
  });

  it("defaults return_model to parametric", () => {
    const input = {
      name: "Test",
      assumptions: {
        inflation_rate: 0.02,
        isa_annual_limit: 20000,
        state_pension_annual: 11500,
        pension_access_age: 55,
        start_year: 2024,
        end_year: 2084,
        annual_spend_target: 30000,
        debt_interest_rate: 0.08,
        bankruptcy_threshold: -100000,
      },
      people: [{ id: "p1", label: "Adult 1", birth_date: "1980-01-15", is_child: false }],
      incomes: [],
      assets: [],
      properties: [],
      expenses: [],
    } as unknown as FormValues;

    const result = scenarioSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assumptions.return_model).toBe("parametric");
    }
  });

  it("validates asset_type enum", () => {
    const validTypes = ["CASH", "ISA", "GIA", "PENSION"] as const;
    for (const assetType of validTypes) {
      const result = scenarioSchema.safeParse({
        name: "Test",
        assumptions: {
          inflation_rate: 0.02,
          isa_annual_limit: 20000,
          state_pension_annual: 11500,
          pension_access_age: 55,
          start_year: 2024,
          end_year: 2084,
          annual_spend_target: 30000,
          debt_interest_rate: 0.08,
          bankruptcy_threshold: -100000,
          return_model: "parametric" as const,
        },
        people: [{ id: "p1", label: "Adult 1", birth_date: "1980-01-15", is_child: false }],
        incomes: [],
        assets: [{
          person_id: "p1",
          name: "Test",
          asset_type: assetType,
          withdrawal_priority: 100,
          balance: 50000,
          annual_contribution: 5000,
          growth_rate_mean: 0.06,
          growth_rate_std: 0.15,
          contributions_end_at_retirement: true,
          bond_allocation: 0.3,
        }],
        properties: [],
        expenses: [],
      });
      expect(result.success).toBe(true);
    }
  });
});
