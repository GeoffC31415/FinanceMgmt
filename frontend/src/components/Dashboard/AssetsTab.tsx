import type { SimulationResponse } from "../../types";
import { AssetsChart } from "../charts/AssetsChart";
import { AssetDetailChart } from "../charts/AssetDetailChart";
import type { BondAllocations } from "./utils";

type Props = {
  display_result: SimulationResponse | null;
  percentile: number;
  saved_bond_allocations: BondAllocations;
  bond_allocations: BondAllocations;
  is_saving_bonds: boolean;
  bond_save_error: string | null;
  onBondAllocationChange: (assetType: keyof BondAllocations, value: number) => void;
  onSaveBondAllocations: (allocations: Partial<BondAllocations>) => Promise<void>;
};

export function AssetsTab({
  display_result,
  percentile,
  saved_bond_allocations,
  bond_allocations,
  is_saving_bonds,
  bond_save_error,
  onBondAllocationChange,
  onSaveBondAllocations,
}: Props) {
  if (!display_result) return null;

  return (
    <>
      <AssetsChart
        years={display_result.years}
        isa_balance_median={display_result.isa_balance_median}
        pension_balance_median={display_result.pension_balance_median}
        cash_balance_median={display_result.cash_balance_median}
        property_value_median={display_result.property_value_median}
        total_assets_median={display_result.total_assets_median}
        retirement_years={display_result.retirement_years}
        percentile={percentile}
      />
      <AssetDetailChart
        years={display_result.years}
        retirement_years={display_result.retirement_years}
        percentile={percentile}
        isa_balance_median={display_result.isa_balance_median}
        gia_balance_median={display_result.gia_balance_median}
        cash_balance_median={display_result.cash_balance_median}
        pension_balance_median={display_result.pension_balance_median}
        property_value_median={display_result.property_value_median}
        debt_balance_median={display_result.debt_balance_median}
        pension_contributions_median={display_result.pension_contributions_median}
        debt_interest_paid_median={display_result.debt_interest_paid_median}
        isa_returns_median={display_result.isa_returns_median}
        gia_returns_median={display_result.gia_returns_median}
        cash_returns_median={display_result.cash_returns_median}
        pension_returns_median={display_result.pension_returns_median}
        property_returns_median={display_result.property_returns_median}
        isa_contributions_median={display_result.isa_contributions_median}
        gia_contributions_median={display_result.gia_contributions_median}
        isa_withdrawals_median={display_result.isa_withdrawals_median}
        gia_withdrawals_median={display_result.gia_withdrawals_median}
        pension_withdrawals_median={display_result.pension_withdrawals_median}
        property_rental_income_median={display_result.property_rental_income_median}
        property_maintenance_median={display_result.property_maintenance_median}
        currentBondAllocations={saved_bond_allocations}
        onBondAllocationChange={onBondAllocationChange}
        onSaveBondAllocations={onSaveBondAllocations}
        isSaving={is_saving_bonds}
        canEditBondAllocations={false}
      />
    </>
  );
}
