import { describe, it, expect } from "vitest";
import type { Assumptions, ReturnModel } from "../../types";

describe("Assumptions type", () => {
  it("has all required fields with correct types", () => {
    const validAssumptions: Assumptions = {
      inflation_rate: 0.02,
      isa_annual_limit: 20000,
      state_pension_annual: 11500,
      pension_access_age: 55,
      start_year: 2024,
      end_year: 2084,
      annual_spend_target: 30000,
      debt_interest_rate: 0.08,
      bankruptcy_threshold: -100000,
      return_model: "historical_bootstrap",
    };
    
    // TypeScript enforces the type at compile time
    expect(validAssumptions.inflation_rate).toBe(0.02);
    expect(validAssumptions.isa_annual_limit).toBe(20000);
    expect(validAssumptions.state_pension_annual).toBe(11500);
    expect(validAssumptions.pension_access_age).toBe(55);
    expect(validAssumptions.start_year).toBe(2024);
    expect(validAssumptions.end_year).toBe(2084);
    expect(validAssumptions.annual_spend_target).toBe(30000);
    expect(validAssumptions.debt_interest_rate).toBe(0.08);
    expect(validAssumptions.bankruptcy_threshold).toBe(-100000);
    expect(validAssumptions.return_model).toBe("historical_bootstrap");
  });

  it("allows optional tax_year field", () => {
    const withTaxYear: Assumptions = {
      inflation_rate: 0.02,
      isa_annual_limit: 20000,
      state_pension_annual: 11500,
      pension_access_age: 55,
      start_year: 2024,
      end_year: 2084,
      annual_spend_target: 30000,
      debt_interest_rate: 0.08,
      bankruptcy_threshold: -100000,
      tax_year: "2024-25",
      return_model: "parametric",
    };
    
    expect(withTaxYear.tax_year).toBe("2024-25");
    expect(withTaxYear.return_model).toBe("parametric");
  });

  it("return_model accepts both valid values", () => {
    const parametric: Assumptions = {
      inflation_rate: 0.02,
      isa_annual_limit: 20000,
      state_pension_annual: 11500,
      pension_access_age: 55,
      start_year: 2024,
      end_year: 2084,
      annual_spend_target: 30000,
      debt_interest_rate: 0.08,
      bankruptcy_threshold: -100000,
      return_model: "parametric",
    };
    
    const bootstrap: Assumptions = {
      inflation_rate: 0.02,
      isa_annual_limit: 20000,
      state_pension_annual: 11500,
      pension_access_age: 55,
      start_year: 2024,
      end_year: 2084,
      annual_spend_target: 30000,
      debt_interest_rate: 0.08,
      bankruptcy_threshold: -100000,
      return_model: "historical_bootstrap",
    };
    
    expect(parametric.return_model).toBe("parametric");
    expect(bootstrap.return_model).toBe("historical_bootstrap");
  });
});

describe("ReturnModel type", () => {
  it("is a union of two string literals", () => {
    const model1: ReturnModel = "parametric";
    const model2: ReturnModel = "historical_bootstrap";
    
    expect(model1).toBe("parametric");
    expect(model2).toBe("historical_bootstrap");
  });
});
