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

// Child leaving home marker info
type ChildLeavingInfo = {
  name: string;
  year: number;
};

type Props = {
  years: number[];
  total_expenses_median: number[];
  mortgage_payment_median: number[];
  pension_contributions_median: number[];
  total_tax_median: number[];
  fun_fund_median: number[];
  retirement_years: number[];
  children_leaving?: ChildLeavingInfo[];
  mortgage_payoff_year?: number | null;
  percentile?: number;
};

// Custom label component for child leaving markers
function ChildLeavingLabel({ viewBox, name }: { viewBox?: { x?: number; y?: number }; name: string }) {
  const x = viewBox?.x ?? 0;
  const y = 25;
  return (
    <g>
      {/* Graduation cap icon */}
      <text x={x} y={y} textAnchor="middle" fontSize={16} fill="#38bdf8">
        🎓
      </text>
      <text x={x} y={y + 14} textAnchor="middle" fontSize={10} fill="#38bdf8" fontWeight="500">
        {name}
      </text>
    </g>
  );
}

// Custom label component for mortgage payoff marker
function MortgagePayoffLabel({ viewBox }: { viewBox?: { x?: number; y?: number } }) {
  const x = viewBox?.x ?? 0;
  const y = 25;
  return (
    <g>
      {/* House icon */}
      <text x={x} y={y} textAnchor="middle" fontSize={16} fill="#22c55e">
        🏠
      </text>
      <text x={x} y={y + 14} textAnchor="middle" fontSize={10} fill="#22c55e" fontWeight="500">
        Paid off
      </text>
    </g>
  );
}

export function ExpensesChart({
  years,
  total_expenses_median,
  mortgage_payment_median,
  pension_contributions_median,
  total_tax_median,
  fun_fund_median,
  retirement_years,
  children_leaving = [],
  mortgage_payoff_year = null,
  percentile = 50
}: Props) {
  const [useLogScale, setUseLogScale] = useState(false);

  // Clamp values for log scale (must be > 0)
  const LOG_MIN = 10000;
  const clampForLog = (v: number) => (useLogScale ? Math.max(v, LOG_MIN) : v);
  
  // Sanitize values: convert NaN/Infinity to 0
  const sanitize = (v: number | undefined | null): number => {
    const num = v ?? 0;
    return isNaN(num) || !isFinite(num) ? 0 : num;
  };

  const data = years.map((year, idx) => {
    // Backend total_expenses = expenses + mortgage + fun_fund
    const total_expenses = sanitize(total_expenses_median[idx]);
    const mortgage_payment = sanitize(mortgage_payment_median[idx]);
    const total_tax = sanitize(total_tax_median[idx]);
    const fun_fund = sanitize(fun_fund_median[idx]);
    
    // Living expenses = total_expenses - mortgage - fun_fund (what's left after known components)
    const living_expenses = Math.max(0, total_expenses - mortgage_payment - fun_fund);
    
    // Total outgoings includes: living expenses + mortgage + tax + fun fund
    // Note: Pension contributions are excluded as they are investments, not expenses
    const total_outgoings = living_expenses + mortgage_payment + total_tax + fun_fund;
    
    return {
      year,
      total_outgoings: clampForLog(total_outgoings),
      living_expenses: clampForLog(living_expenses),
      mortgage_payment: clampForLog(mortgage_payment),
      total_tax: clampForLog(total_tax),
      fun_fund: clampForLog(fun_fund)
    };
  });

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">
          Outgoings Breakdown
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
          <ComposedChart data={data} margin={{ top: 45, right: 20, bottom: 20, left: 0 }}>
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
                  name === "total_outgoings"
                    ? "Total outgoings"
                    : name === "mortgage_payment"
                      ? "Mortgage"
                      : name === "total_tax"
                        ? "Tax"
                        : name === "living_expenses"
                          ? "Living expenses"
                          : name === "fun_fund"
                            ? "Fun fund"
                            : name;
                return [`£${Math.round(Number(value)).toLocaleString()}`, label];
              }}
              labelFormatter={(label) => `Year ${label}`}
            />
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              iconType="line"
              contentStyle={{ color: "#e2e8f0" }}
              formatter={(value) => {
                if (value === "total_outgoings") return "Total outgoings";
                if (value === "mortgage_payment") return "Mortgage";
                if (value === "total_tax") return "Tax";
                if (value === "living_expenses") return "Living expenses";
                if (value === "fun_fund") return "Fun fund";
                return value;
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
            {children_leaving.map((child) => (
              <ReferenceLine
                key={`child-leave-${child.name}-${child.year}`}
                x={child.year}
                stroke="#38bdf8"
                strokeDasharray="3 3"
                yAxisId="left"
                label={<ChildLeavingLabel name={child.name} />}
              />
            ))}
            {mortgage_payoff_year && (
              <ReferenceLine
                key="mortgage-payoff"
                x={mortgage_payoff_year}
                stroke="#22c55e"
                strokeDasharray="3 3"
                yAxisId="left"
                label={<MortgagePayoffLabel />}
              />
            )}
            <Line
              type="monotone"
              dataKey="total_outgoings"
              stroke="#ef4444"
              strokeWidth={3}
              dot={false}
              yAxisId="left"
              name="total_outgoings"
            />
            <Line
              type="monotone"
              dataKey="living_expenses"
              stroke="#a78bfa"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="living_expenses"
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
              dataKey="total_tax"
              stroke="#fbbf24"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="total_tax"
            />
            <Line
              type="monotone"
              dataKey="fun_fund"
              stroke="#ec4899"
              strokeWidth={1.5}
              dot={false}
              yAxisId="left"
              name="fun_fund"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
