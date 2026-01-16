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
  total_expenses_median: number[];
  mortgage_payment_median: number[];
  pension_contributions_median: number[];
  total_tax_median: number[];
  spend_median: number[];
  retirement_years: number[];
};

export function ExpensesChart({
  years,
  total_expenses_median,
  mortgage_payment_median,
  pension_contributions_median,
  total_tax_median,
  spend_median,
  retirement_years
}: Props) {
  const [useLogScale, setUseLogScale] = useState(false);

  // Clamp values for log scale (must be > 0)
  const LOG_MIN = 10000;
  const clampForLog = (v: number) => (useLogScale ? Math.max(v, LOG_MIN) : v);

  const data = years.map((year, idx) => {
    const total_expenses = total_expenses_median[idx] ?? 0;
    const mortgage_payment = mortgage_payment_median[idx] ?? 0;
    const pension_contributions = pension_contributions_median[idx] ?? 0;
    const total_tax = total_tax_median[idx] ?? 0;
    const spend = spend_median[idx] ?? 0;
    const other_expenses = Math.max(0, total_expenses - mortgage_payment - pension_contributions - total_tax - spend);
    
    return {
      year,
      total_expenses: clampForLog(total_expenses),
      mortgage_payment: clampForLog(mortgage_payment),
      pension_contributions: clampForLog(pension_contributions),
      total_tax: clampForLog(total_tax),
      spend: clampForLog(spend),
      other_expenses: clampForLog(other_expenses)
    };
  });

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Expenses Breakdown</div>
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
                  name === "total_expenses"
                    ? "Total expenses"
                    : name === "mortgage_payment"
                      ? "Mortgage payment"
                      : name === "pension_contributions"
                        ? "Pension contributions"
                        : name === "total_tax"
                          ? "Total tax"
                          : name === "spend"
                            ? "Annual spending"
                            : name === "other_expenses"
                              ? "Other expenses"
                              : name;
                return [`£${Math.round(Number(value)).toLocaleString()}`, label];
              }}
              labelFormatter={(label) => `Year ${label}`}
            />
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              iconType="line"
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
              dataKey="total_expenses"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              yAxisId="left"
              name="total_expenses"
            />
            <Line
              type="monotone"
              dataKey="mortgage_payment"
              stroke="#f87171"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="mortgage_payment"
            />
            <Line
              type="monotone"
              dataKey="pension_contributions"
              stroke="#fb923c"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="pension_contributions"
            />
            <Line
              type="monotone"
              dataKey="total_tax"
              stroke="#fbbf24"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="total_tax"
            />
            <Line
              type="monotone"
              dataKey="spend"
              stroke="#f472b6"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="spend"
            />
            <Line
              type="monotone"
              dataKey="other_expenses"
              stroke="#a78bfa"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="other_expenses"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
