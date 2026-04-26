export type BondAllocations = {
  ISA: number;
  GIA: number;
  PENSION: number;
};

/**
 * Extract bond allocation percentages from a scenario's assets.
 * Returns values as percentages (0-100) for ISA, GIA, and PENSION.
 */
export function getScenarioBondAllocations(
  scenario: { assets?: Array<{ asset_type?: string; bond_allocation?: number }> } | null | undefined
): BondAllocations {
  const allocations: BondAllocations = { ISA: 0, GIA: 0, PENSION: 0 };
  for (const asset of scenario?.assets ?? []) {
    const asset_type = asset.asset_type?.toUpperCase();
    if (asset_type === "ISA" || asset_type === "GIA" || asset_type === "PENSION") {
      allocations[asset_type] = Math.round(((asset.bond_allocation ?? 0) as number) * 100);
    }
  }
  return allocations;
}

/**
 * Format a number as a compact currency string.
 * Values >= 1M are shown as £X.Xm, others as £X,XXX.
 */
export function format_currency_compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `£${(value / 1_000_000).toFixed(1)}m`;
  }
  return `£${Math.round(value).toLocaleString()}`;
}
