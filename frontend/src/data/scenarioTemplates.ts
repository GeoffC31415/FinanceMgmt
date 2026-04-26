import type { ScenarioCreate } from "../types";

const year = new Date().getFullYear();

export const starterScenario: ScenarioCreate = {
  name: "Starter retirement plan",
  assumptions: {
    inflation_rate: 0.02,
    isa_annual_limit: 20000,
    state_pension_annual: 11500,
    pension_access_age: 55,
    start_year: year,
    end_year: year + 60,
    annual_spend_target: 30000,
    debt_interest_rate: 0.08,
    bankruptcy_threshold: -100000,
    return_model: "historical_bootstrap",
  },
  people: [
    {
      label: "you",
      birth_date: "1985-01-01",
      planned_retirement_age: 60,
      state_pension_age: 67,
      is_child: false,
    }
  ],
  incomes: [
    {
      kind: "salary",
      gross_annual: 60000,
      annual_growth_rate: 0.02,
      employee_pension_pct: 0.05,
      employer_pension_pct: 0.05,
      person_id: null,
    }
  ],
  assets: [
    { name: "Cash buffer", asset_type: "CASH", withdrawal_priority: 0, balance: 20000, annual_contribution: 0, growth_rate_mean: 0, growth_rate_std: 0, contributions_end_at_retirement: false, bond_allocation: 0, person_id: null },
    { name: "ISA", asset_type: "ISA", withdrawal_priority: 30, balance: 50000, annual_contribution: 10000, growth_rate_mean: 0.05, growth_rate_std: 0.1, contributions_end_at_retirement: false, bond_allocation: 0.2, person_id: null },
    { name: "Pension", asset_type: "PENSION", withdrawal_priority: 10, balance: 150000, annual_contribution: 0, growth_rate_mean: 0.05, growth_rate_std: 0.1, contributions_end_at_retirement: false, bond_allocation: 0.3, person_id: null },
  ],
  properties: [],
  expenses: [{ name: "Household essentials", monthly_amount: 2500, is_inflation_linked: true }],
};

export const sampleScenario: ScenarioCreate = {
  name: "Sample couple with mortgage",
  assumptions: {
    ...starterScenario.assumptions,
    annual_spend_target: 36000,
    end_year: year + 55,
  },
  people: [
    { label: "Alex", birth_date: "1982-03-12", planned_retirement_age: 62, state_pension_age: 67, is_child: false },
    { label: "Sam", birth_date: "1984-07-22", planned_retirement_age: 62, state_pension_age: 67, is_child: false },
    { label: "Child", birth_date: "2018-09-01", is_child: true, annual_cost: 9000, leaves_household_age: 21 },
  ],
  incomes: [
    { kind: "salary", gross_annual: 70000, annual_growth_rate: 0.025, employee_pension_pct: 0.06, employer_pension_pct: 0.06, person_id: null },
    { kind: "salary", gross_annual: 42000, annual_growth_rate: 0.02, employee_pension_pct: 0.05, employer_pension_pct: 0.04, person_id: null },
  ],
  assets: [
    { name: "Cash buffer", asset_type: "CASH", withdrawal_priority: 0, balance: 30000, annual_contribution: 0, growth_rate_mean: 0, growth_rate_std: 0, contributions_end_at_retirement: false, bond_allocation: 0, person_id: null },
    { name: "Family ISA", asset_type: "ISA", withdrawal_priority: 30, balance: 90000, annual_contribution: 18000, growth_rate_mean: 0.05, growth_rate_std: 0.1, contributions_end_at_retirement: false, bond_allocation: 0.25, person_id: null },
    { name: "Taxable investments", asset_type: "GIA", withdrawal_priority: 20, balance: 45000, annual_contribution: 0, growth_rate_mean: 0.05, growth_rate_std: 0.1, contributions_end_at_retirement: false, bond_allocation: 0.2, person_id: null },
    { name: "Alex pension", asset_type: "PENSION", withdrawal_priority: 10, balance: 210000, annual_contribution: 0, growth_rate_mean: 0.05, growth_rate_std: 0.1, contributions_end_at_retirement: false, bond_allocation: 0.35, person_id: null },
    { name: "Sam pension", asset_type: "PENSION", withdrawal_priority: 10, balance: 125000, annual_contribution: 0, growth_rate_mean: 0.05, growth_rate_std: 0.1, contributions_end_at_retirement: false, bond_allocation: 0.35, person_id: null },
  ],
  properties: [
    {
      name: "Home",
      value: 520000,
      appreciation_rate_mean: 0.025,
      appreciation_rate_std: 0.04,
      monthly_rental_income: 0,
      rental_growth_rate: 0,
      occupancy_rate: 1,
      mortgage_ltv: 0.45,
      mortgage_rate: 0.045,
      mortgage_term_years: 23,
      annual_maintenance_cost: 4500,
      maintenance_is_inflation_linked: true,
      withdrawal_priority: 5,
      person_id: null,
    }
  ],
  expenses: [
    { name: "Household essentials", monthly_amount: 3200, is_inflation_linked: true },
    { name: "Holidays and hobbies", monthly_amount: 700, is_inflation_linked: true },
  ],
};
