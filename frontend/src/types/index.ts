export type PersonCreate = {
  id?: string | null;
  label: string;
  birth_date: string; // YYYY-MM-DD
  
  // Adult-specific fields (required for adults, optional for children)
  planned_retirement_age?: number | null;
  state_pension_age?: number | null;
  
  // Child-specific fields
  is_child?: boolean;
  annual_cost?: number | null;  // Annual cost of raising the child
  leaves_household_age?: number | null;  // Age when child leaves household (default: 18)
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
  asset_type: "CASH" | "ISA" | "GIA" | "PENSION";
  withdrawal_priority: number;
  bond_allocation: number;
};

export type PropertyCreate = {
  person_id?: string | null;
  name: string;
  value: number;
  appreciation_rate_mean: number;
  appreciation_rate_std: number;
  monthly_rental_income: number;
  rental_growth_rate: number;
  occupancy_rate: number;
  mortgage_ltv: number;
  mortgage_rate: number;
  mortgage_term_years: number;
  annual_maintenance_cost: number;
  maintenance_is_inflation_linked: boolean;
  withdrawal_priority: number;
};

export type ExpenseCreate = {
  name: string;
  monthly_amount: number;
  start_year?: number | null;
  end_year?: number | null;
  is_inflation_linked: boolean;
};

export type ReturnModel = "parametric" | "historical_bootstrap";

export type Assumptions = {
  inflation_rate: number;
  isa_annual_limit: number;
  state_pension_annual: number;
  pension_access_age: number;
  start_year: number;
  end_year: number;
  annual_spend_target: number;
  debt_interest_rate: number;
  bankruptcy_threshold: number;
  tax_year?: string;
  return_model: ReturnModel;
};

export type HistoricalReturnsStats = {
  count: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  min_year: number;
  max_year: number;
  first_year: number;
  last_year: number;
};

export type ScenarioCreate = {
  name: string;
  assumptions: Assumptions;
  people: PersonCreate[];
  incomes: IncomeCreate[];
  assets: AssetCreate[];
  properties: PropertyCreate[];
  expenses: ExpenseCreate[];
};

export type AssetRead = AssetCreate & {
  person_id?: string | null;
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
  rental_income_median: number[];
  gift_income_median: number[];
  pension_income_median: number[];
  state_pension_income_median: number[];
  investment_returns_median: number[];
  total_income_median: number[];
  
  // Expenses
  total_expenses_median: number[];
  mortgage_payment_median: number[];
  pension_contributions_median: number[];
  fun_fund_median: number[];
  
  // Tax
  income_tax_paid_median: number[];
  ni_paid_median: number[];
  total_tax_median: number[];
  
  // Assets
  isa_balance_median: number[];
  pension_balance_median: number[];
  cash_balance_median: number[];
  gia_balance_median: number[];
  property_value_median: number[];
  total_assets_median: number[];

  // Per-type investment returns
  isa_returns_median: number[];
  gia_returns_median: number[];
  cash_returns_median: number[];
  pension_returns_median: number[];
  property_returns_median: number[];

  // Per-type contributions
  isa_contributions_median: number[];
  gia_contributions_median: number[];

  // Per-type withdrawals
  isa_withdrawals_median: number[];
  gia_withdrawals_median: number[];
  pension_withdrawals_median: number[];
  property_rental_income_median: number[];
  property_maintenance_median: number[];
  
  // Liabilities
  mortgage_balance_median: number[];
  total_liabilities_median: number[];
  
  // Other
  mortgage_paid_off_median: number[];  // percentage of runs where mortgage is paid off
  is_depleted_median: number[];  // percentage of runs where assets are depleted
  is_bankrupt_median: number[];  // percentage of runs where net worth is below bankruptcy threshold
  debt_balance_median: number[];  // median debt balance
  debt_interest_paid_median: number[];  // median debt interest paid
};

export type SimulationInitResponse = SimulationResponse & {
  session_id: string;
};

export type SimulationRecalcRequest = {
  session_id: string;
  annual_spend_target?: number | null;
  retirement_age_offset?: number | null;
  percentile?: number | null;
};

export type SafeWithdrawalRequest = {
  session_id: string;
  retirement_age_offset?: number;
  risk_threshold?: number;
  max_spend?: number;
  steps?: number;
};

export type SensitivityPoint = {
  fun_fund: number;
  bankruptcy_pct: number;
  depletion_pct: number;
  p10_final_net_worth: number;
};

export type SafeWithdrawalResponse = {
  max_safe_fun_fund: number;
  risk_threshold: number;
  sensitivity_curve: SensitivityPoint[];
};

export type BondSweepRequest = {
  session_id: string;
  retirement_age_offset?: number;
  risk_threshold?: number;
  target_year?: number | null;
  max_spend?: number;
};

export type BondCombo = {
  isa_bond_pct: number;
  gia_bond_pct: number;
  pension_bond_pct: number;
  bankruptcy_pct: number;
  depletion_pct: number;
  max_safe_fun_fund: number;
};

export type MarginalPoint = {
  bond_pct: number;
  avg_bankruptcy_pct: number;
  avg_max_fun_fund: number;
  min_bankruptcy_pct: number;
  best_max_fun_fund: number;
};

export type MarginalCurve = {
  asset_class: string;
  points: MarginalPoint[];
};

export type BondSweepResponse = {
  asset_classes: string[];
  optimal: BondCombo;
  top_combos: BondCombo[];
  marginals: MarginalCurve[];
  target_year: number;
  total_combos_tested: number;
};

export type BondOverrideRequest = Omit<SimulationRequest, "scenario_id"> & {
  session_id: string;
  isa_bond_pct: number;
  gia_bond_pct: number;
  pension_bond_pct: number;
  annual_spend_target?: number | null;
  retirement_age_offset?: number | null;
  percentile?: number | null;
};
