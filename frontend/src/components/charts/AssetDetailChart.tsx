import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type AssetGroup = "ISA" | "GIA" | "CASH" | "PENSION" | "PROPERTY" | "DEBT";

type BondAllocationChanges = {
  ISA?: number;
  GIA?: number;
  PENSION?: number;
};

type Props = {
  years: number[];
  retirement_years: number[];
  percentile?: number;

  // Balances
  isa_balance_median: number[];
  gia_balance_median: number[];
  cash_balance_median: number[];
  pension_balance_median: number[];
  property_value_median: number[];
  debt_balance_median: number[];

  // Flows
  pension_contributions_median: number[]; // salary contributions (employee + employer)
  debt_interest_paid_median: number[];

  isa_returns_median: number[];
  gia_returns_median: number[];
  cash_returns_median: number[];
  pension_returns_median: number[];
  property_returns_median: number[];

  isa_contributions_median: number[];
  gia_contributions_median: number[];

  isa_withdrawals_median: number[];
  gia_withdrawals_median: number[];
  pension_withdrawals_median: number[];
  property_rental_income_median: number[];
  property_maintenance_median: number[];

  // Current bond allocations (from scenario config)
  currentBondAllocations?: BondAllocationChanges;
  
  // Callbacks for bond allocation changes
  onBondAllocationChange?: (assetType: "ISA" | "GIA" | "PENSION", value: number) => void;
  onSaveBondAllocations?: (allocations: BondAllocationChanges) => void;
  onResetBondAllocations?: () => void;
  isSaving?: boolean;
  canEditBondAllocations?: boolean;
};

const sanitize = (v: number | undefined | null): number => {
  const num = v ?? 0;
  return isNaN(num) || !isFinite(num) ? 0 : num;
};

const formatGBP = (v: number) => `£${Math.round(v).toLocaleString()}`;

export function AssetDetailChart({
  years,
  retirement_years,
  percentile = 50,
  isa_balance_median,
  gia_balance_median,
  cash_balance_median,
  pension_balance_median,
  property_value_median,
  debt_balance_median,
  pension_contributions_median,
  debt_interest_paid_median,
  isa_returns_median,
  gia_returns_median,
  cash_returns_median,
  pension_returns_median,
  property_returns_median,
  isa_contributions_median,
  gia_contributions_median,
  isa_withdrawals_median,
  gia_withdrawals_median,
  pension_withdrawals_median,
  property_rental_income_median,
  property_maintenance_median,
  currentBondAllocations = {},
  onBondAllocationChange,
  onSaveBondAllocations,
  onResetBondAllocations,
  isSaving = false,
  canEditBondAllocations = true
}: Props) {
  const [selected, setSelected] = useState<AssetGroup>("ISA");
  const [localAllocations, setLocalAllocations] = useState<BondAllocationChanges>(currentBondAllocations);

  useEffect(() => {
    setLocalAllocations(currentBondAllocations);
  }, [currentBondAllocations]);

  const selectedBondAssetType =
    selected === "ISA" || selected === "GIA" || selected === "PENSION" ? selected : null;
  const savedSelectedAllocation = selectedBondAssetType
    ? currentBondAllocations[selectedBondAssetType] ?? 0
    : 0;
  const localSelectedAllocation = selectedBondAssetType
    ? localAllocations[selectedBondAssetType] ?? savedSelectedAllocation
    : 0;
  const hasChanges = selectedBondAssetType
    ? localSelectedAllocation !== savedSelectedAllocation
    : false;

  const handleBondChange = (assetType: "ISA" | "GIA" | "PENSION", value: number) => {
    setLocalAllocations((prev) => ({
      ...prev,
      [assetType]: value,
    }));

    if (onBondAllocationChange) {
      onBondAllocationChange(assetType, value);
    }
  };

  const { balanceLabel, data } = useMemo(() => {
    const balanceByType: Record<AssetGroup, number[]> = {
      ISA: isa_balance_median,
      GIA: gia_balance_median,
      CASH: cash_balance_median,
      PENSION: pension_balance_median,
      PROPERTY: property_value_median,
      DEBT: debt_balance_median
    };

    const returnsByType: Record<AssetGroup, number[]> = {
      ISA: isa_returns_median,
      GIA: gia_returns_median,
      CASH: cash_returns_median,
      PENSION: pension_returns_median,
      PROPERTY: property_returns_median,
      DEBT: []
    };

    const contributionsByType: Record<AssetGroup, number[]> = {
      ISA: isa_contributions_median,
      GIA: gia_contributions_median,
      CASH: [],
      PENSION: pension_contributions_median,
      PROPERTY: property_rental_income_median,
      DEBT: []
    };

    const withdrawalsByType: Record<AssetGroup, number[]> = {
      ISA: isa_withdrawals_median,
      GIA: gia_withdrawals_median,
      CASH: [],
      PENSION: pension_withdrawals_median,
      PROPERTY: property_maintenance_median,
      DEBT: []
    };

    const label: Record<AssetGroup, string> = {
      ISA: "ISA balance",
      GIA: "GIA balance",
      CASH: "Cash balance",
      PENSION: "Pension balance",
      PROPERTY: "Property value",
      DEBT: "Debt balance"
    };

    const rows = years.map((year, idx) => {
      const balance = sanitize(balanceByType[selected]?.[idx]);
      const returns = sanitize(returnsByType[selected]?.[idx]);
      const contributions = sanitize(contributionsByType[selected]?.[idx]);
      const withdrawals = sanitize(withdrawalsByType[selected]?.[idx]);
      const debtInterest = sanitize(debt_interest_paid_median?.[idx]);

      return {
        year,
        balance,
        contributions,
        returns,
        withdrawals: -withdrawals, // show outflows below 0
        debt_interest: selected === "DEBT" ? -debtInterest : 0
      };
    });

    return { balanceLabel: label[selected], data: rows };
  }, [
    years,
    selected,
    isa_balance_median,
    gia_balance_median,
    cash_balance_median,
    pension_balance_median,
    property_value_median,
    debt_balance_median,
    pension_contributions_median,
    debt_interest_paid_median,
    isa_returns_median,
    gia_returns_median,
    cash_returns_median,
    pension_returns_median,
    property_returns_median,
    isa_contributions_median,
    gia_contributions_median,
    isa_withdrawals_median,
    gia_withdrawals_median,
    pension_withdrawals_median,
    property_rental_income_median,
    property_maintenance_median
  ]);

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">
          Asset type breakdown
          {percentile !== 50 && (
            <span className="ml-2 text-xs font-normal text-amber-400">(P{percentile})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Asset type</label>
          <select
            className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            value={selected}
            onChange={(e) => setSelected(e.target.value as AssetGroup)}
          >
            <option value="ISA">ISA</option>
            <option value="GIA">GIA</option>
            <option value="CASH">Cash</option>
            <option value="PENSION">Pension</option>
            <option value="PROPERTY">Property</option>
            <option value="DEBT">Debt</option>
          </select>
        </div>
      </div>

      {/* Bond Allocation Controls for investable assets */}
      {canEditBondAllocations && selected !== "CASH" && selected !== "PROPERTY" && selected !== "DEBT" && (
        <div className="mb-4 rounded-lg border border-indigo-900/50 bg-indigo-950/20 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-indigo-300">Bond Allocation for {selected}</div>
              <div className="text-xs text-indigo-400/70">
                Adjust the bond percentage for this asset type. Changes are reflected immediately. Use Save below to make them permanent.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Current:</span>
              <span className="min-w-[60px] text-right text-sm font-semibold text-indigo-400">
                {localSelectedAllocation}%
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>100% Equity</span>
                <span>100% Bonds</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={localSelectedAllocation}
                onChange={(e) => handleBondChange(selected as "ISA" | "GIA" | "PENSION", parseInt(e.target.value, 10))}
                className={`h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 ${
                  selected === "ISA"
                    ? "accent-blue-500"
                    : selected === "GIA"
                      ? "accent-green-500"
                      : "accent-purple-500"
                }`}
                disabled={isSaving}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!selectedBondAssetType) return;
                  setLocalAllocations((prev) => ({
                    ...prev,
                    [selectedBondAssetType]: savedSelectedAllocation,
                  }));
                  onResetBondAllocations?.();
                  onBondAllocationChange?.(selectedBondAssetType, savedSelectedAllocation);
                }}
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                disabled={isSaving || !hasChanges}
              >
                Reset
              </button>
            </div>
          </div>

          {hasChanges && onSaveBondAllocations && selectedBondAssetType && (
            <div className="mt-3 flex items-center justify-between border-t border-indigo-900/50 pt-3">
              <span className="text-xs text-amber-300">
                ⚠️ Unsaved change to {selected} bond allocation
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setLocalAllocations((prev) => ({
                      ...prev,
                      [selectedBondAssetType]: savedSelectedAllocation,
                    }));
                    onResetBondAllocations?.();
                    onBondAllocationChange?.(selectedBondAssetType, savedSelectedAllocation);
                  }}
                  className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700"
                  disabled={isSaving}
                >
                  Discard
                </button>
                <button
                  onClick={async () => {
                    await onSaveBondAllocations({
                      ...currentBondAllocations,
                      [selectedBondAssetType]: localSelectedAllocation,
                    });
                  }}
                  className="rounded bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : `Save ${selected} to Config`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-[360px] rounded border border-slate-800/60 bg-slate-950/20 p-3">
          <div className="mb-2 text-xs font-medium text-slate-300">Balance</div>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="year" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={(v) => `£${Math.round(v / 1000)}k`} />
              <Tooltip
                contentStyle={{ background: "#0b1220", border: "1px solid #1f2937", color: "#e2e8f0" }}
                formatter={(value) => [formatGBP(Number(value)), balanceLabel]}
                labelFormatter={(label) => `Year ${label}`}
              />
              {retirement_years.map((year) => (
                <ReferenceLine key={`retire-${year}`} x={year} stroke="#f59e0b" strokeDasharray="4 4" />
              ))}
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#a78bfa"
                strokeWidth={2.5}
                dot={false}
                name="balance"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="h-[360px] rounded border border-slate-800/60 bg-slate-950/20 p-3">
          <div className="mb-2 text-xs font-medium text-slate-300">Incomings and outgoings</div>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="year" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={(v) => `£${Math.round(v / 1000)}k`} />
              <ReferenceLine y={0} stroke="#334155" />
              <Tooltip
                contentStyle={{ background: "#0b1220", border: "1px solid #1f2937", color: "#e2e8f0" }}
                formatter={(value, name) => {
                  const n = String(name);
                  const label =
                    n === "contributions"
                      ? "Contributions"
                      : n === "returns"
                        ? "Investment returns"
                        : n === "withdrawals"
                          ? "Withdrawals"
                          : n === "debt_interest"
                            ? "Debt interest"
                            : n;
                  return [formatGBP(Number(value)), label];
                }}
                labelFormatter={(label) => `Year ${label}`}
              />
              <Legend
                wrapperStyle={{ paddingTop: "8px" }}
                iconType="rect"
                formatter={(value) => {
                  if (value === "contributions") return "Contributions";
                  if (value === "returns") return "Investment returns";
                  if (value === "withdrawals") return "Withdrawals";
                  if (value === "debt_interest") return "Debt interest";
                  return String(value);
                }}
              />
              <Bar dataKey="contributions" stackId="in" fill="#34d399" name="contributions" />
              <Bar dataKey="returns" stackId="in" fill="#60a5fa" name="returns" />
              <Bar dataKey="withdrawals" stackId="out" fill="#fb7185" name="withdrawals" />
              <Bar dataKey="debt_interest" stackId="out" fill="#fbbf24" name="debt_interest" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

