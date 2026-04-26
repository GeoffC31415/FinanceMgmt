import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  years: number[];
  is_depleted_median: number[];
  is_bankrupt_median: number[];
  retirement_years: number[];
};

export function RiskTimelineChart({
  years,
  is_depleted_median,
  is_bankrupt_median,
  retirement_years,
}: Props) {
  // Don't render if there's no risk data at all
  const has_any_risk =
    is_depleted_median.some((v) => v > 0) ||
    is_bankrupt_median.some((v) => v > 0);

  if (!has_any_risk) return null;

  const data = useMemo(() => {
    return years.map((year, idx) => ({
    year,
    depletion_pct: is_depleted_median[idx] ?? 0,
    bankruptcy_pct: is_bankrupt_median[idx] ?? 0,
  }));
  }, [years, is_depleted_median, is_bankrupt_median]);

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3 text-sm font-semibold">
        Risk Over Time
        <span className="ml-2 text-xs font-normal text-slate-400">
          Probability of financial distress by year
        </span>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 20, bottom: 20, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="year" stroke="#94a3b8" />
            <YAxis
              yAxisId="pct"
              stroke="#94a3b8"
              domain={[0, "auto"]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                background: "#0b1220",
                border: "1px solid #1f2937",
                color: "#e2e8f0",
              }}
              formatter={(value: number, name: string) => {
                const label =
                  name === "bankruptcy_pct"
                    ? "Bankruptcy probability"
                    : "Asset depletion probability";
                return [`${value.toFixed(1)}%`, label];
              }}
              labelFormatter={(label) => `Year ${label}`}
            />
            <Legend
              wrapperStyle={{ paddingTop: "10px" }}
              iconType="line"
              formatter={(value) => {
                if (value === "bankruptcy_pct") return "Bankruptcy probability";
                if (value === "depletion_pct")
                  return "Asset depletion probability";
                return value;
              }}
            />
            {retirement_years.map((year) => (
              <ReferenceLine
                key={`retire-${year}`}
                x={year}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                yAxisId="pct"
              />
            ))}
            <Area
              type="monotone"
              dataKey="depletion_pct"
              stroke="#f97316"
              fill="#f97316"
              fillOpacity={0.15}
              strokeWidth={2}
              dot={false}
              yAxisId="pct"
              name="depletion_pct"
            />
            <Area
              type="monotone"
              dataKey="bankruptcy_pct"
              stroke="#ef4444"
              fill="#ef4444"
              fillOpacity={0.2}
              strokeWidth={2}
              dot={false}
              yAxisId="pct"
              name="bankruptcy_pct"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
