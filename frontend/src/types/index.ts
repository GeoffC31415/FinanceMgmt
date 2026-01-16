export type PersonCreate = {
  id?: string | null;
  label: string;
  birth_date: string; // YYYY-MM-DD
  planned_retirement_age: number;
  state_pension_age: number;
};

export type IncomeCreate = {
  person_id?: string | null;
  kind: string;
  gross_annual: number;
  annual_growth_rate: number;
  employee_pension_pct: number;
  employer_pension_pct: number;
  start_year?: number | null;
  end_year?: number | null;
};

export type AssetCreate = {
  person_id?: string | null;
  name: string;
  balance: number;
  annual_contribution: number;
  growth_rate_mean: number;
  growth_rate_std: number;
  contributions_end_at_retirement: boolean;
  asset_type?: "CASH" | "ISA" | "GIA" | "PENSION";
  withdrawal_priority?: number;
};

export type MortgageCreate = {
  balance: number;
  annual_interest_rate: number;
  monthly_payment: number;
  months_remaining: number;
};

export type ExpenseCreate = {
  name: string;
  monthly_amount: number;
  start_year?: number | null;
  end_year?: number | null;
  is_inflation_linked: boolean;
};

export type ScenarioCreate = {
  name: string;
  assumptions: Record<string, unknown>;
  people: PersonCreate[];
  incomes: IncomeCreate[];
  assets: AssetCreate[];
  mortgage?: MortgageCreate | null;
  expenses: ExpenseCreate[];
};

export type ScenarioRead = ScenarioCreate & {
  id: string;
};

export type SimulationRequest = {
  scenario_id: string;
  iterations?: number;
  seed?: number;
  annual_spend_target?: number | null;
  end_year?: number | null;
};

export type SimulationInitRequest = {
  scenario_id: string;
  iterations?: number;
  seed?: number;
  annual_spend_target?: number | null;
  end_year?: number | null;
};

export type SimulationResponse = {
  years: number[];
  net_worth_p10: number[];
  net_worth_median: number[];
  net_worth_p90: number[];
  income_median: number[];
  spend_median: number[];
  retirement_years: number[];
  
  // Inflation adjustment parameters (for real-value toggle)
  inflation_rate: number;
  start_year: number;
  
  // Detailed fields for export
  // Incomes
  salary_gross_median: number[];
  salary_net_median: number[];
  pension_income_median: number[];
  state_pension_income_median: number[];
  investment_returns_median: number[];
  total_income_median: number[];
  
  // Expenses
  total_expenses_median: number[];
  mortgage_payment_median: number[];
  pension_contributions_median: number[];
  
  // Tax
  income_tax_paid_median: number[];
  ni_paid_median: number[];
  total_tax_median: number[];
  
  // Assets
  isa_balance_median: number[];
  pension_balance_median: number[];
  cash_balance_median: number[];
  total_assets_median: number[];
  
  // Liabilities
  mortgage_balance_median: number[];
  total_liabilities_median: number[];
  
  // Other
  mortgage_paid_off_median: number[];  // percentage of runs where mortgage is paid off
  is_depleted_median: number[];  // percentage of runs where assets are depleted
};

export type SimulationInitResponse = SimulationResponse & {
  session_id: string;
};

export type SimulationRecalcRequest = {
  session_id: string;
  annual_spend_target?: number | null;
  retirement_age_offset?: number | null;
};
