import type { ScenarioRead, ScenarioCreate, Assumptions, ReturnModel } from "../../types";
import type { FormValues } from "./formSchema";

/**
 * Parse a number input string to a number.
 * Handles locale-aware thousands separators and empty strings.
 */
export function parse_number_input(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return 0;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Format a number for display with locale-aware thousands separators.
 */
export function format_number_input(value: number): string {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString(undefined, { maximumFractionDigits: 20 });
}

/**
 * Parse a percent input string to a decimal (e.g. "5" → 0.05).
 */
export function parse_percent_input(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  return value / 100;
}

/**
 * Format a decimal as a percent string (e.g. 0.05 → "5").
 */
export function format_percent_input(value: number): string {
  if (!Number.isFinite(value)) return "";
  return (value * 100).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/**
 * Calculate the mortgage balance from property value and LTV.
 */
export function property_mortgage_balance(property: {
  value: number;
  mortgage_ltv: number;
}): number {
  return (Number(property.value) || 0) * (Number(property.mortgage_ltv) || 0);
}

/**
 * Calculate the monthly mortgage payment using the standard amortization formula.
 */
export function property_mortgage_monthly_payment(property: {
  value: number;
  mortgage_ltv: number;
  mortgage_rate: number;
  mortgage_term_years: number;
}): number {
  const balance = property_mortgage_balance(property);
  const annual_rate = Number(property.mortgage_rate) || 0;
  const term_years = Number(property.mortgage_term_years) || 0;
  if (balance <= 0 || annual_rate < 0) return 0;

  const monthly_rate = annual_rate / 12;
  if (term_years <= 0) return balance * monthly_rate;

  const periods = term_years * 12;
  if (monthly_rate === 0) return periods > 0 ? balance / periods : 0;

  const growth = (1 + monthly_rate) ** periods;
  return (balance * monthly_rate * growth) / (growth - 1);
}

/**
 * Convert a ScenarioRead to form values for editing.
 */
export function to_form_values(scenario: ScenarioRead): FormValues {
  const assumptions = scenario.assumptions as Assumptions;

  const inflation_rate = assumptions.inflation_rate ?? 0.02;
  const isa_annual_limit = assumptions.isa_annual_limit ?? 20000;
  const state_pension_annual = assumptions.state_pension_annual ?? 11500;
  const pension_access_age = assumptions.pension_access_age ?? 55;
  const start_year = assumptions.start_year ?? new Date().getFullYear();
  const end_year = assumptions.end_year ?? start_year + 60;
  const annual_spend_target = assumptions.annual_spend_target ?? 30000;
  const debt_interest_rate = assumptions.debt_interest_rate ?? 0.08;
  const bankruptcy_threshold = assumptions.bankruptcy_threshold ?? -100000;
  const return_model = assumptions.return_model ?? "historical_bootstrap" as ReturnModel;
  const tax_year = assumptions.tax_year;

  return {
    name: scenario.name,
    assumptions: {
      inflation_rate,
      isa_annual_limit,
      state_pension_annual,
      pension_access_age,
      start_year,
      end_year,
      annual_spend_target,
      debt_interest_rate,
      bankruptcy_threshold,
      tax_year,
      return_model,
    },
    people: scenario.people.map((p) => ({
      id: p.id,
      label: p.label,
      birth_date: p.birth_date,
      planned_retirement_age: p.planned_retirement_age,
      state_pension_age: p.state_pension_age,
      is_child: p.is_child ?? false,
      annual_cost: p.annual_cost,
      leaves_household_age: p.leaves_household_age,
    })),
    incomes: scenario.incomes.map((inc) => ({
      person_id: inc.person_id,
      kind: inc.kind,
      gross_annual: inc.gross_annual,
      annual_growth_rate: inc.annual_growth_rate,
      employee_pension_pct: inc.employee_pension_pct,
      employer_pension_pct: inc.employer_pension_pct,
    })),
    assets: scenario.assets.map((a) => ({
      person_id: a.person_id,
      name: a.name,
      asset_type: a.asset_type ?? "GIA",
      withdrawal_priority: a.withdrawal_priority ?? 100,
      balance: a.balance,
      annual_contribution: a.annual_contribution,
      growth_rate_mean: a.growth_rate_mean,
      growth_rate_std: a.growth_rate_std,
      contributions_end_at_retirement: a.contributions_end_at_retirement,
      bond_allocation: a.bond_allocation ?? 0,
    })),
    properties: scenario.properties.map((p) => ({
      person_id: p.person_id,
      name: p.name,
      value: p.value,
      appreciation_rate_mean: p.appreciation_rate_mean,
      appreciation_rate_std: p.appreciation_rate_std,
      monthly_rental_income: p.monthly_rental_income,
      rental_growth_rate: p.rental_growth_rate,
      occupancy_rate: p.occupancy_rate ?? 1,
      mortgage_ltv: p.mortgage_ltv ?? 0,
      mortgage_rate: p.mortgage_rate ?? 0,
      mortgage_term_years: p.mortgage_term_years ?? 0,
      annual_maintenance_cost: p.annual_maintenance_cost,
      maintenance_is_inflation_linked: p.maintenance_is_inflation_linked ?? true,
      withdrawal_priority: p.withdrawal_priority ?? 15,
    })),
    expenses: scenario.expenses.map((e) => ({
      name: e.name,
      monthly_amount: e.monthly_amount,
      is_inflation_linked: e.is_inflation_linked,
    })),
  };
}

/**
 * Normalize a person_id that may be null or undefined.
 */
export function normalize_person_id(person_id: string | null | undefined): string | null {
  return person_id ?? null;
}

/**
 * Convert form values back to a ScenarioCreate for saving.
 */
export function to_scenario_create(values: FormValues, original: ScenarioRead): ScenarioCreate {
  return {
    name: values.name,
    assumptions: {
      ...values.assumptions,
    },
    people: values.people.map((p) => ({
      id: p.id ?? null,
      label: p.label,
      birth_date: p.birth_date,
      planned_retirement_age: p.planned_retirement_age,
      state_pension_age: p.state_pension_age,
      is_child: p.is_child,
      annual_cost: p.annual_cost,
      leaves_household_age: p.leaves_household_age,
    })),
    incomes: values.incomes.map((inc) => ({
      person_id: normalize_person_id(inc.person_id),
      kind: inc.kind,
      gross_annual: inc.gross_annual,
      annual_growth_rate: inc.annual_growth_rate,
      employee_pension_pct: inc.employee_pension_pct,
      employer_pension_pct: inc.employer_pension_pct,
    })),
    assets: values.assets.map((a) => ({
      person_id: normalize_person_id(a.person_id),
      name: a.name,
      asset_type: a.asset_type,
      withdrawal_priority: a.withdrawal_priority,
      balance: a.balance,
      annual_contribution: a.annual_contribution,
      growth_rate_mean: a.growth_rate_mean,
      growth_rate_std: a.growth_rate_std,
      contributions_end_at_retirement: a.contributions_end_at_retirement,
      bond_allocation: a.bond_allocation,
    })),
    properties: values.properties.map((p) => ({
      person_id: normalize_person_id(p.person_id),
      name: p.name,
      value: p.value,
      appreciation_rate_mean: p.appreciation_rate_mean,
      appreciation_rate_std: p.appreciation_rate_std,
      monthly_rental_income: p.monthly_rental_income,
      rental_growth_rate: p.rental_growth_rate,
      occupancy_rate: p.occupancy_rate,
      mortgage_ltv: p.mortgage_ltv,
      mortgage_rate: p.mortgage_rate,
      mortgage_term_years: p.mortgage_term_years,
      annual_maintenance_cost: p.annual_maintenance_cost,
      maintenance_is_inflation_linked: p.maintenance_is_inflation_linked,
      withdrawal_priority: p.withdrawal_priority,
    })),
    expenses: values.expenses.map((e) => ({
      name: e.name,
      monthly_amount: e.monthly_amount,
      is_inflation_linked: e.is_inflation_linked,
    })),
  };
}
