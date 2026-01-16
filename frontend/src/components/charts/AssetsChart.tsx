import { useState } from "react";
import {
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

type Props = {
  years: number[];
  isa_balance_median: number[];
  pension_balance_median: number[];
  cash_balance_median: number[];
  total_assets_median: number[];
  retirement_years: number[];
};

export function AssetsChart({
  years,
  isa_balance_median,
  pension_balance_median,
  cash_balance_median,
  total_assets_median,
  retirement_years
}: Props) {
  const [useLogScale, setUseLogScale] = useState(false);

  // Clamp values for log scale (must be > 0)
  const LOG_MIN = 10000;
  const clampForLog = (v: number) => (useLogScale ? Math.max(v, LOG_MIN) : v);

  const data = years.map((year, idx) => {
    const isa = isa_balance_median[idx] ?? 0;
    const pension = pension_balance_median[idx] ?? 0;
    const cash = cash_balance_median[idx] ?? 0;
    const totalAssets = total_assets_median[idx] ?? 0;
    // GIA = total assets - ISA - pension - cash
    const gia = totalAssets - isa - pension - cash;
    
    return {
      year,
      isa_balance: clampForLog(isa),
      pension_balance: clampForLog(pension),
      cash_balance: clampForLog(cash),
      gia_balance: clampForLog(gia),
      total_assets: clampForLog(totalAssets)
    };
  });

  // Get last year's values for legend
  const lastIdx = years.length - 1;
  const formatCurrency = (value: number) => `£${Math.round(value).toLocaleString()}`;
  const lastIsa = lastIdx >= 0 ? isa_balance_median[lastIdx] ?? 0 : 0;
  const lastPension = lastIdx >= 0 ? pension_balance_median[lastIdx] ?? 0 : 0;
  const lastCash = lastIdx >= 0 ? cash_balance_median[lastIdx] ?? 0 : 0;
  const lastTotal = lastIdx >= 0 ? total_assets_median[lastIdx] ?? 0 : 0;
  const lastGia = lastTotal - lastIsa - lastPension - lastCash;

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Asset Classes</div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={useLogScale}
            onChange={(e) => setUseLogScale(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
          />
          Log scale
        </label>
      </div>
      <div className="h-[576px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="year" stroke="#94a3b8" />
            <YAxis
              yAxisId="left"
              stroke="#94a3b8"
              scale={useLogScale ? "log" : "linear"}
              domain={useLogScale ? [LOG_MIN, "auto"] : ["auto", "auto"]}
              allowDataOverflow={useLogScale}
              tickFormatter={(v) => `£${Math.round(v / 1000)}k`}
            />
            <Tooltip
              contentStyle={{ background: "#0b1220", border: "1px solid #1f2937", color: "#e2e8f0" }}
              formatter={(value, name) => {
                const label =
                  name === "total_assets"
                    ? "Total assets"
                    : name === "cash_balance"
                      ? "Cash"
                      : name === "isa_balance"
                        ? "ISA"
                        : name === "pension_balance"
                          ? "Pension"
                          : name === "gia_balance"
                            ? "GIA"
                            : name;
                return [`£${Math.round(Number(value)).toLocaleString()}`, label];
              }}
              labelFormatter={(label) => `Year ${label}`}
            />
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              iconType="line"
              formatter={(value) => {
                if (value === "total_assets") return `Total assets (${formatCurrency(lastTotal)})`;
                if (value === "cash_balance") return `Cash (${formatCurrency(lastCash)})`;
                if (value === "isa_balance") return `ISA (${formatCurrency(lastIsa)})`;
                if (value === "pension_balance") return `Pension (${formatCurrency(lastPension)})`;
                if (value === "gia_balance") return `GIA (${formatCurrency(lastGia)})`;
                return value;
              }}
              contentStyle={{ color: "#e2e8f0" }}
            />
            {retirement_years.map((year) => (
              <ReferenceLine
                key={`retire-${year}`}
                x={year}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                yAxisId="left"
              />
            ))}
            <Line
              type="monotone"
              dataKey="total_assets"
              stroke="#a78bfa"
              strokeWidth={2}
              dot={false}
              yAxisId="left"
              name="total_assets"
            />
            <Line
              type="monotone"
              dataKey="cash_balance"
              stroke="#60a5fa"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="cash_balance"
            />
            <Line
              type="monotone"
              dataKey="isa_balance"
              stroke="#34d399"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="isa_balance"
            />
            <Line
              type="monotone"
              dataKey="pension_balance"
              stroke="#fbbf24"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="pension_balance"
            />
            <Line
              type="monotone"
              dataKey="gia_balance"
              stroke="#fb7185"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="gia_balance"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
