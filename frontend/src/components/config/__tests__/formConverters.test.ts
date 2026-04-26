import { describe, it, expect } from "vitest";
import { to_form_values, to_scenario_create } from "../formConverters";
import type { ScenarioRead } from "../../../types";

function createMockScenario(): ScenarioRead {
  return {
    id: "test-scenario-1",
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
      tax_year: "2024-25",
      return_model: "parametric",
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
      {
        id: "p2",
        label: "Child 1",
        birth_date: "2010-06-20",
        is_child: true,
        annual_cost: 10000,
        leaves_household_age: 18,
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
    properties: [
      {
        person_id: "p1",
        name: "Main House",
        value: 500000,
        appreciation_rate_mean: 0.03,
        appreciation_rate_std: 0.05,
        monthly_rental_income: 0,
        rental_growth_rate: 0,
        occupancy_rate: 1,
        mortgage_ltv: 0.6,
        mortgage_rate: 0.04,
        mortgage_term_years: 25,
        annual_maintenance_cost: 2000,
        maintenance_is_inflation_linked: true,
        withdrawal_priority: 15,
      },
    ],
    expenses: [
      {
        name: "Groceries",
        monthly_amount: 500,
        is_inflation_linked: true,
      },
      {
        name: "Utilities",
        monthly_amount: 150,
        is_inflation_linked: false,
      },
    ],
  };
}

describe("to_form_values", () => {
  it("converts a scenario to form values with correct assumptions", () => {
    const scenario = createMockScenario();
    const formValues = to_form_values(scenario);

    expect(formValues.name).toBe("Test Scenario");
    expect(formValues.assumptions.inflation_rate).toBe(0.02);
    expect(formValues.assumptions.isa_annual_limit).toBe(20000);
    expect(formValues.assumptions.state_pension_annual).toBe(11500);
    expect(formValues.assumptions.pension_access_age).toBe(55);
    expect(formValues.assumptions.start_year).toBe(2024);
    expect(formValues.assumptions.end_year).toBe(2084);
    expect(formValues.assumptions.annual_spend_target).toBe(30000);
    expect(formValues.assumptions.debt_interest_rate).toBe(0.08);
    expect(formValues.assumptions.bankruptcy_threshold).toBe(-100000);
    expect(formValues.assumptions.tax_year).toBe("2024-25");
    expect(formValues.assumptions.return_model).toBe("parametric");
  });

  it("converts people correctly", () => {
    const scenario = createMockScenario();
    const formValues = to_form_values(scenario);

    expect(formValues.people).toHaveLength(2);
    expect(formValues.people[0].label).toBe("Adult 1");
    expect(formValues.people[0].is_child).toBe(false);
    expect(formValues.people[0].planned_retirement_age).toBe(65);
    expect(formValues.people[1].label).toBe("Child 1");
    expect(formValues.people[1].is_child).toBe(true);
    expect(formValues.people[1].annual_cost).toBe(10000);
  });

  it("converts incomes correctly", () => {
    const scenario = createMockScenario();
    const formValues = to_form_values(scenario);

    expect(formValues.incomes).toHaveLength(1);
    expect(formValues.incomes[0].gross_annual).toBe(50000);
    expect(formValues.incomes[0].kind).toBe("salary");
  });

  it("converts assets correctly", () => {
    const scenario = createMockScenario();
    const formValues = to_form_values(scenario);

    expect(formValues.assets).toHaveLength(1);
    expect(formValues.assets[0].asset_type).toBe("ISA");
    expect(formValues.assets[0].balance).toBe(50000);
    expect(formValues.assets[0].bond_allocation).toBe(0.3);
  });

  it("converts properties correctly", () => {
    const scenario = createMockScenario();
    const formValues = to_form_values(scenario);

    expect(formValues.properties).toHaveLength(1);
    expect(formValues.properties[0].value).toBe(500000);
    expect(formValues.properties[0].mortgage_ltv).toBe(0.6);
  });

  it("converts expenses correctly", () => {
    const scenario = createMockScenario();
    const formValues = to_form_values(scenario);

    expect(formValues.expenses).toHaveLength(2);
    expect(formValues.expenses[0].name).toBe("Groceries");
    expect(formValues.expenses[0].monthly_amount).toBe(500);
    expect(formValues.expenses[1].is_inflation_linked).toBe(false);
  });
});

describe("to_scenario_create", () => {
  it("converts form values back to a scenario create payload", () => {
    const scenario = createMockScenario();
    const formValues = to_form_values(scenario);
    const result = to_scenario_create(formValues, scenario);

    expect(result.name).toBe("Test Scenario");
    expect(result.assumptions.inflation_rate).toBe(0.02);
    expect(result.people).toHaveLength(2);
    expect(result.incomes).toHaveLength(1);
    expect(result.assets).toHaveLength(1);
    expect(result.properties).toHaveLength(1);
    expect(result.expenses).toHaveLength(2);
  });

  it("preserves scenario name", () => {
    const scenario = createMockScenario();
    const formValues = to_form_values(scenario);
    const result = to_scenario_create(formValues, scenario);

    expect(result.name).toBe("Test Scenario");
  });

  it("round-trips correctly", () => {
    const scenario = createMockScenario();
    const formValues = to_form_values(scenario);
    const result = to_scenario_create(formValues, scenario);

    // Check key fields round-trip
    expect(result.name).toBe(scenario.name);
    expect(result.assumptions.inflation_rate).toBe(scenario.assumptions.inflation_rate);
    expect(result.assumptions.return_model).toBe(scenario.assumptions.return_model);
    expect(result.people[0].label).toBe(scenario.people[0].label);
    expect(result.assets[0].balance).toBe(scenario.assets[0].balance);
    expect(result.properties[0].value).toBe(scenario.properties[0].value);
    expect(result.expenses[0].monthly_amount).toBe(scenario.expenses[0].monthly_amount);
  });
});
