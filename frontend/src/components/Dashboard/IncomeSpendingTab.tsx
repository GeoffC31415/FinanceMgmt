import type { SimulationResponse } from "../../types";
import { IncomeChart } from "../charts/IncomeChart";
import { ExpensesChart } from "../charts/ExpensesChart";
import { TaxBreakdownPanel } from "./TaxBreakdownPanel";

type Props = {
  display_result: SimulationResponse | null;
  children_leaving: { name: string; year: number }[];
  mortgage_payoff_year: number | null;
  percentile: number;
};

export function IncomeSpendingTab({
  display_result,
  children_leaving,
  mortgage_payoff_year,
  percentile,
}: Props) {
  if (!display_result) return null;

  return (
    <>
      <IncomeChart
        years={display_result.years}
        salary_gross_median={display_result.salary_gross_median}
        salary_net_median={display_result.salary_net_median}
        rental_income_median={display_result.rental_income_median}
        gift_income_median={display_result.gift_income_median}
        pension_income_median={display_result.pension_income_median}
        state_pension_income_median={display_result.state_pension_income_median}
        investment_returns_median={display_result.investment_returns_median}
        total_income_median={display_result.total_income_median}
        retirement_years={display_result.retirement_years}
        percentile={percentile}
      />
      <ExpensesChart
        years={display_result.years}
        total_expenses_median={display_result.total_expenses_median}
        mortgage_payment_median={display_result.mortgage_payment_median}
        pension_contributions_median={display_result.pension_contributions_median}
        total_tax_median={display_result.total_tax_median}
        fun_fund_median={display_result.fun_fund_median}
        property_maintenance_median={display_result.property_maintenance_median}
        retirement_years={display_result.retirement_years}
        children_leaving={children_leaving}
        mortgage_payoff_year={mortgage_payoff_year}
        percentile={percentile}
      />
      <TaxBreakdownPanel display_result={display_result} percentile={percentile} />
    </>
  );
}
