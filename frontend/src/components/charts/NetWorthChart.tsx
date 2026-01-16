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
  income_median: number[];
  spend_median: number[];
  retirement_years: number[];
};

export function NetWorthChart({
  years,
  net_worth_p10,
  net_worth_median,
  net_worth_p90,
  income_median,
  spend_median,
  retirement_years
}: Props) {
  const data = years.map((year, idx) => {
    const p10 = net_worth_p10[idx] ?? 0;
    const p90 = net_worth_p90[idx] ?? 0;
    return {
      year,
      net_worth_median: net_worth_median[idx] ?? 0,
      net_worth_p10: p10,
      net_worth_p90: p90,
      net_worth_p10_p90_band: p90 - p10,
      income_median: income_median[idx] ?? 0,
      spend_median: spend_median[idx] ?? 0
    };
  });

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3 text-sm font-semibold">Net worth (median)</div>
      <div className="h-[576px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="year" stroke="#94a3b8" />
            <YAxis
              yAxisId="left"
              stroke="#94a3b8"
              tickFormatter={(v) => `£${Math.round(v / 1000)}k`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#94a3b8"
              tickFormatter={(v) => `£${Math.round(v / 1000)}k`}
            />
            <Tooltip
              contentStyle={{ background: "#0b1220", border: "1px solid #1f2937", color: "#e2e8f0" }}
              formatter={(value, name) => {
                const label =
                  name === "net_worth_p10"
                    ? "P10 net worth"
                    : name === "net_worth_p90"
                      ? "P90 net worth"
                  : name === "income_median"
                    ? "Median income"
                    : name === "spend_median"
                      ? "Median spending"
                      : "Median net worth";
                return [`£${Math.round(Number(value)).toLocaleString()}`, label];
              }}
              labelFormatter={(label) => `Year ${label}`}
            />
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              iconType="line"
              formatter={(value) => {
                if (value === "net_worth_p10_p90") return "P10-P90 net worth range";
                if (value === "net_worth_median") return "Median net worth";
                if (value === "income_median") return "Median income";
                if (value === "spend_median") return "Median spending";
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
              dataKey="income_median"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              yAxisId="right"
              name="income_median"
            />
            <Line
              type="monotone"
              dataKey="spend_median"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              yAxisId="right"
              name="spend_median"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

