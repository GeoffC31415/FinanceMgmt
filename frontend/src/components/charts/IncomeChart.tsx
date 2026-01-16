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
  salary_gross_median: number[];
  salary_net_median: number[];
  rental_income_median: number[];
  gift_income_median: number[];
  pension_income_median: number[];
  state_pension_income_median: number[];
  investment_returns_median: number[];
  total_income_median: number[];
  retirement_years: number[];
  percentile?: number;
};

export function IncomeChart({
  years,
  salary_gross_median,
  salary_net_median,
  rental_income_median,
  gift_income_median,
  pension_income_median,
  state_pension_income_median,
  investment_returns_median,
  total_income_median,
  retirement_years,
  percentile = 50
}: Props) {
  const [useLogScale, setUseLogScale] = useState(false);

  // Clamp values for log scale (must be > 0)
  const LOG_MIN = 10000;
  const clampForLog = (v: number) => (useLogScale ? Math.max(v, LOG_MIN) : v);

  const data = years.map((year, idx) => ({
    year,
    salary_gross: clampForLog(salary_gross_median[idx] ?? 0),
    salary_net: clampForLog(salary_net_median[idx] ?? 0),
    rental_income: clampForLog(rental_income_median[idx] ?? 0),
    gift_income: clampForLog(gift_income_median[idx] ?? 0),
    pension_income: clampForLog(pension_income_median[idx] ?? 0),
    state_pension_income: clampForLog(state_pension_income_median[idx] ?? 0),
    investment_returns: clampForLog(investment_returns_median[idx] ?? 0),
    total_income: clampForLog(total_income_median[idx] ?? 0)
  }));

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">
          Income by Source
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
                const labelMap: Record<string, string> = {
                  total_income: "Total income",
                  salary_gross: "Salary (gross)",
                  salary_net: "Salary (net)",
                  rental_income: "Rental income",
                  gift_income: "Gift income",
                  pension_income: "Pension income",
                  state_pension_income: "State pension",
                  investment_returns: "Investment returns"
                };
                const label = labelMap[name as string] ?? name;
                return [`£${Math.round(Number(value)).toLocaleString()}`, label];
              }}
              labelFormatter={(label) => `Year ${label}`}
            />
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              iconType="line"
              contentStyle={{ color: "#e2e8f0" }}
              formatter={(value) => {
                const labelMap: Record<string, string> = {
                  total_income: "Total income",
                  salary_gross: "Salary (gross)",
                  salary_net: "Salary (net)",
                  rental_income: "Rental income",
                  gift_income: "Gift income",
                  pension_income: "Pension income",
                  state_pension_income: "State pension",
                  investment_returns: "Investment returns"
                };
                return labelMap[value] ?? value;
              }}
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
              dataKey="total_income"
              stroke="#22c55e"
              strokeWidth={3}
              dot={false}
              yAxisId="left"
              name="total_income"
            />
            <Line
              type="monotone"
              dataKey="salary_gross"
              stroke="#4ade80"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="salary_gross"
            />
            <Line
              type="monotone"
              dataKey="salary_net"
              stroke="#86efac"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="salary_net"
            />
            <Line
              type="monotone"
              dataKey="rental_income"
              stroke="#a78bfa"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="rental_income"
            />
            <Line
              type="monotone"
              dataKey="gift_income"
              stroke="#f472b6"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="gift_income"
            />
            <Line
              type="monotone"
              dataKey="pension_income"
              stroke="#fbbf24"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="pension_income"
            />
            <Line
              type="monotone"
              dataKey="state_pension_income"
              stroke="#fcd34d"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="state_pension_income"
            />
            <Line
              type="monotone"
              dataKey="investment_returns"
              stroke="#60a5fa"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="investment_returns"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
