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
  kind: string;
  balance: number;
  annual_contribution: number;
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

export type SimulationResponse = {
  years: number[];
  net_worth_p10: number[];
  net_worth_median: number[];
  net_worth_p90: number[];
  income_median: number[];
  spend_median: number[];
  retirement_years: number[];
};

