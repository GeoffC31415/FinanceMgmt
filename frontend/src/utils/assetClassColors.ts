/**
 * Consistent color scheme for asset classes across all charts.
 * Colors sourced from the Assets : Asset Classes chart.
 */
export const ASSET_CLASS_COLORS: Record<string, string> = {
  CASH: "#60a5fa",    // blue
  PROPERTY: "#f97316", // orange
  ISA: "#34d399",      // green
  GIA: "#fb7185",      // pink/red
  PENSION: "#fbbf24",  // yellow
};

export const ASSET_CLASS_ORDER = ["CASH", "ISA", "GIA", "PENSION", "PROPERTY"] as const;

export function getAssetClassColor(assetClass: string): string {
  return ASSET_CLASS_COLORS[assetClass] ?? "#94a3b8";
}
