import { useState } from "react";
import {
  Area,
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
  net_worth_p10: number[];
  net_worth_median: number[];
  net_worth_p90: number[];
  retirement_years: number[];
  isa_balance_median?: number[];
  pension_balance_median?: number[];
  cash_balance_median?: number[];
  total_assets_median?: number[];
  percentile?: number;
};

export function NetWorthChart({
  years,
  net_worth_p10,
  net_worth_median,
  net_worth_p90,
  retirement_years,
  isa_balance_median = [],
  pension_balance_median = [],
  cash_balance_median = [],
  total_assets_median = [],
  percentile = 50
}: Props) {
  const [useLogScale, setUseLogScale] = useState(false);

  // Clamp values for log scale (must be > 0)
  const LOG_MIN = 10000;
  const clampForLog = (v: number) => (useLogScale ? Math.max(v, LOG_MIN) : v);

  const data = years.map((year, idx) => {
    const p10 = net_worth_p10[idx] ?? 0;
    const p90 = net_worth_p90[idx] ?? 0;
    const isa = isa_balance_median[idx] ?? 0;
    const pension = pension_balance_median[idx] ?? 0;
    const cash = cash_balance_median[idx] ?? 0;
    const totalAssets = total_assets_median[idx] ?? 0;
    // GIA = total assets - ISA - pension - cash
    const gia = totalAssets - isa - pension - cash;
    
    return {
      year,
      net_worth_median: clampForLog(net_worth_median[idx] ?? 0),
      net_worth_p10: clampForLog(p10),
      net_worth_p90: clampForLog(p90),
      net_worth_p10_p90_band: clampForLog(p90 - p10),
      isa_balance: clampForLog(isa),
      pension_balance: clampForLog(pension),
      cash_balance: clampForLog(cash),
      gia_balance: clampForLog(gia)
    };
  });

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">
          Net Worth
          {percentile !== 50 && (
            <span className="ml-2 text-xs font-normal text-amber-400">
              (P{percentile})
            </span>
          )}
        </div>
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
                const percentileLabel = percentile === 50 ? "Median" : `P${percentile}`;
                const label =
                  name === "net_worth_p10"
                    ? "P10 net worth"
                    : name === "net_worth_p90"
                      ? "P90 net worth"
                      : name === "cash_balance"
                        ? "Cash"
                        : name === "isa_balance"
                          ? "ISA"
                          : name === "pension_balance"
                            ? "Pension"
                            : name === "gia_balance"
                              ? "GIA"
                              : `${percentileLabel} net worth`;
                return [`£${Math.round(Number(value)).toLocaleString()}`, label];
              }}
              labelFormatter={(label) => `Year ${label}`}
            />
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              iconType="line"
              formatter={(value) => {
                const percentileLabel = percentile === 50 ? "Median" : `P${percentile}`;
                if (value === "net_worth_p10_p90") return "P10-P90 range";
                if (value === "net_worth_p10") return "P10 net worth";
                if (value === "net_worth_median") return `${percentileLabel} net worth`;
                if (value === "net_worth_p90") return "P90 net worth";
                if (value === "cash_balance") return "Cash";
                if (value === "isa_balance") return "ISA";
                if (value === "pension_balance") return "Pension";
                if (value === "gia_balance") return "GIA";
                if (value === "retirement") return "Retirement year";
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
                name="retirement"
              />
            ))}
            <Area
              type="monotone"
              dataKey="net_worth_p10"
              baseLine={0}
              stroke="none"
              fill="transparent"
              yAxisId="left"
              stackId="band-base"
              tooltipType="none"
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="net_worth_p10_p90_band"
              baseLine={0}
              stroke="none"
              fill="#7c3aed"
              fillOpacity={0.15}
              yAxisId="left"
              stackId="band-base"
              name="net_worth_p10_p90"
              tooltipType="none"
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey="net_worth_p10"
              stroke="#8b5cf6"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              yAxisId="left"
              name="net_worth_p10"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="net_worth_median"
              stroke="#a78bfa"
              strokeWidth={2}
              dot={false}
              yAxisId="left"
              name="net_worth_median"
            />
            <Line
              type="monotone"
              dataKey="net_worth_p90"
              stroke="#8b5cf6"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              yAxisId="left"
              name="net_worth_p90"
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

