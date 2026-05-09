import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ASSET_CLASS_COLORS } from "../../utils/assetClassColors";

type Props = {
  years: number[];
  total_outgoings_median: number[];
  total_tax_median: number[];
  state_pension_income_median: number[];
  asset_funding_cash_median: number[];
  asset_funding_isa_median: number[];
  asset_funding_gia_median: number[];
  asset_funding_pension_median: number[];
  asset_funding_property_median: number[];
  retirement_years: number[];
  percentile?: number;
};

const formatGBP = (v: number) => `£${Math.round(v).toLocaleString()}`;

const ASSET_LABELS: Record<string, string> = {
  INCOME: "Other income",
  CASH: "Cash",
  ISA: "ISA",
  GIA: "GIA",
  PENSION: "Pension",
  PROPERTY: "Property",
};

const INCOME_COLOR = "#22c55e";

export function OutgoingsFundingChart({
  years,
  total_outgoings_median,
  total_tax_median,
  state_pension_income_median,
  asset_funding_cash_median,
  asset_funding_isa_median,
  asset_funding_gia_median,
  asset_funding_pension_median,
  asset_funding_property_median,
  retirement_years,
  percentile = 50,
}: Props) {
  // Guard against missing data (e.g., before backend restart or during initial render)
  const hasData =
    asset_funding_cash_median &&
    asset_funding_isa_median &&
    asset_funding_gia_median &&
    asset_funding_pension_median &&
    asset_funding_property_median &&
    years?.length > 0;

  const data = useMemo(() => {
    if (!hasData) return [];
    return years.map((year, idx) => {
      // Match the Outgoings Breakdown chart: backend total_expenses excludes
      // tax because tax is withheld from net income, while the displayed
      // outgoings chart adds tax back as a visible outgoing.
      const total = (total_outgoings_median[idx] || 0) + (total_tax_median[idx] || 0);
      const cash = asset_funding_cash_median[idx] || 0;
      const isa = asset_funding_isa_median[idx] || 0;
      const gia = asset_funding_gia_median[idx] || 0;
      const privatePension = asset_funding_pension_median[idx] || 0;
      const property = asset_funding_property_median[idx] || 0;
      const assetFunding = cash + isa + gia + privatePension + property;
      const incomeBeforeStatePensionSplit = Math.max(0, total - assetFunding);
      const statePension = Math.min(state_pension_income_median[idx] || 0, incomeBeforeStatePensionSplit);
      const income = Math.max(0, incomeBeforeStatePensionSplit - statePension);
      const pension = privatePension + statePension;
      const totalFunding = income + cash + isa + gia + pension + property;

      // Calculate percentages for 100% stacked bar
      const incomePct = totalFunding > 0 ? (income / totalFunding) * 100 : 0;
      const cashPct = totalFunding > 0 ? (cash / totalFunding) * 100 : 0;
      const isaPct = totalFunding > 0 ? (isa / totalFunding) * 100 : 0;
      const giaPct = totalFunding > 0 ? (gia / totalFunding) * 100 : 0;
      const pensionPct = totalFunding > 0 ? (pension / totalFunding) * 100 : 0;
      const propertyPct = totalFunding > 0 ? (property / totalFunding) * 100 : 0;

      return {
        year,
        total_outgoings: total,
        income: incomePct,
        cash: cashPct,
        isa: isaPct,
        gia: giaPct,
        pension: pensionPct,
        property: propertyPct,
        // Raw amounts for tooltip
        _income: income,
        _cash: cash,
        _isa: isa,
        _gia: gia,
        _pension: pension,
        _state_pension: statePension,
        _private_pension: privatePension,
        _property: property,
      };
    });
  }, [
    hasData,
    years,
    total_outgoings_median,
    total_tax_median,
    state_pension_income_median,
    asset_funding_cash_median,
    asset_funding_isa_median,
    asset_funding_gia_median,
    asset_funding_pension_median,
    asset_funding_property_median,
  ]);

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">
          Outgoings Funded By Income / Asset Burndown
          {percentile !== 50 && (
            <span className="ml-2 text-xs font-normal text-amber-400">
              (P{percentile})
            </span>
          )}
        </div>
      </div>
      <div className="h-[400px]">
        {!hasData ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No data available — run a simulation to see asset class breakdown
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="year" stroke="#94a3b8" />
              <YAxis
                stroke="#94a3b8"
                tickFormatter={(v) => `${Math.round(Number(v))}%`}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                allowDecimals={false}
                width={48}
              />
              <Tooltip
                contentStyle={{ background: "#0b1220", border: "1px solid #1f2937", color: "#e2e8f0" }}
                formatter={(value: number, name: string, item) => {
                  const pctStr = `${value.toFixed(1)}%`;
                  const key = name as keyof typeof ASSET_LABELS;
                  const label = ASSET_LABELS[key] ?? name;
                  const rawKey = `_${String(name).toLowerCase()}`;
                  const rawValue = item?.payload?.[rawKey];
                  if (typeof rawValue === "number") {
                    if (name === "PENSION") {
                      const statePension = item?.payload?._state_pension;
                      const privatePension = item?.payload?._private_pension;
                      const details = [
                        typeof statePension === "number" && statePension > 0 ? `state ${formatGBP(statePension)}` : null,
                        typeof privatePension === "number" && privatePension > 0 ? `private ${formatGBP(privatePension)}` : null,
                      ].filter(Boolean).join("; ");
                      return [`${pctStr} (${formatGBP(rawValue)}${details ? ` — ${details}` : ""})`, label];
                    }
                    return [`${pctStr} (${formatGBP(rawValue)})`, label];
                  }
                  return [pctStr, label];
                }}
                labelFormatter={(label) => `Year ${label}`}
              />
              <Legend
                wrapperStyle={{ paddingTop: "10px" }}
                iconType="rect"
                formatter={(value) => {
                  const key = value as keyof typeof ASSET_LABELS;
                  return ASSET_LABELS[key] ?? value;
                }}
              />
              <Bar
                dataKey="income"
                stackId="funding"
                fill={INCOME_COLOR}
                name="INCOME"
              />
              <Bar
                dataKey="cash"
                stackId="funding"
                fill={ASSET_CLASS_COLORS.CASH}
                name="CASH"
              />
              <Bar
                dataKey="isa"
                stackId="funding"
                fill={ASSET_CLASS_COLORS.ISA}
                name="ISA"
              />
              <Bar
                dataKey="gia"
                stackId="funding"
                fill={ASSET_CLASS_COLORS.GIA}
                name="GIA"
              />
              <Bar
                dataKey="pension"
                stackId="funding"
                fill={ASSET_CLASS_COLORS.PENSION}
                name="PENSION"
              />
              <Bar
                dataKey="property"
                stackId="funding"
                fill={ASSET_CLASS_COLORS.PROPERTY}
                name="PROPERTY"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
