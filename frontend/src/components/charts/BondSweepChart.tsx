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
  YAxis,
} from "recharts";
import type { BondSweepPoint } from "../../types";

type Props = {
  points: BondSweepPoint[];
  optimal_bond_pct: number;
};

export function BondSweepChart({ points, optimal_bond_pct }: Props) {
  if (points.length === 0) return null;

  const data = points.map((pt) => ({
    bond_pct: pt.bond_pct,
    bankruptcy_pct: pt.bankruptcy_pct,
    depletion_pct: pt.depletion_pct,
    median_nw: pt.median_final_net_worth,
    p10_nw: pt.p10_final_net_worth,
    p90_nw: pt.p90_final_net_worth,
  }));

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3 text-sm font-semibold">
        Bond Allocation Sweep
        <span className="ml-2 text-xs font-normal text-slate-400">
          Equity/bond blend vs. risk and final net worth
        </span>
      </div>
      <div className="h-[450px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 20, bottom: 20, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="bond_pct"
              stroke="#94a3b8"
              tickFormatter={(v) => `${v}%`}
              label={{
                value: "Bond Allocation %",
                position: "insideBottom",
                offset: -10,
                fill: "#64748b",
                fontSize: 12,
              }}
            />
            <YAxis
              yAxisId="money"
              stroke="#94a3b8"
              tickFormatter={(v) => {
                if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}m`;
                return `£${Math.round(v / 1000)}k`;
              }}
              label={{
                value: "Final Net Worth",
                angle: -90,
                position: "insideLeft",
                fill: "#64748b",
                fontSize: 12,
              }}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              stroke="#94a3b8"
              domain={[0, "auto"]}
              tickFormatter={(v) => `${v}%`}
              label={{
                value: "Risk %",
                angle: 90,
                position: "insideRight",
                fill: "#64748b",
                fontSize: 12,
              }}
            />
            <Tooltip
              contentStyle={{
                background: "#0b1220",
                border: "1px solid #1f2937",
                color: "#e2e8f0",
              }}
              formatter={(value: number, name: string) => {
                if (name === "median_nw")
                  return [`£${Math.round(value).toLocaleString()}`, "Median Final Net Worth"];
                if (name === "p10_nw")
                  return [`£${Math.round(value).toLocaleString()}`, "P10 Final Net Worth"];
                if (name === "p90_nw")
                  return [`£${Math.round(value).toLocaleString()}`, "P90 Final Net Worth"];
                if (name === "bankruptcy_pct")
                  return [`${value.toFixed(1)}%`, "Bankruptcy Risk"];
                if (name === "depletion_pct")
                  return [`${value.toFixed(1)}%`, "Asset Depletion"];
                return [String(value), name];
              }}
              labelFormatter={(label) => `Bond Allocation: ${label}%`}
            />
            <Legend
              wrapperStyle={{ paddingTop: "10px" }}
              iconType="line"
              contentStyle={{ color: "#e2e8f0" }}
              formatter={(value) => {
                if (value === "median_nw") return "Median final net worth";
                if (value === "p10_nw") return "P10 final net worth";
                if (value === "p90_nw") return "P90 final net worth";
                if (value === "bankruptcy_pct") return "Bankruptcy risk";
                if (value === "depletion_pct") return "Asset depletion";
                return value;
              }}
            />

            {/* P10-P90 band */}
            <Area
              type="monotone"
              dataKey="p90_nw"
              stroke="none"
              fill="#3b82f6"
              fillOpacity={0.08}
              yAxisId="money"
              name="p90_nw"
              legendType="none"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="p10_nw"
              stroke="none"
              fill="#0f172a"
              fillOpacity={1}
              yAxisId="money"
              name="p10_nw"
              legendType="none"
              isAnimationActive={false}
            />

            {/* Optimal bond allocation vertical line */}
            <ReferenceLine
              x={optimal_bond_pct}
              yAxisId="money"
              stroke="#22c55e"
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{
                value: `Optimal: ${optimal_bond_pct}%`,
                position: "top",
                fill: "#22c55e",
                fontSize: 11,
              }}
            />

            {/* P10 net worth line */}
            <Line
              type="monotone"
              dataKey="p10_nw"
              stroke="#60a5fa"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              yAxisId="money"
              name="p10_nw"
            />

            {/* Median net worth line */}
            <Line
              type="monotone"
              dataKey="median_nw"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={false}
              yAxisId="money"
              name="median_nw"
            />

            {/* Bankruptcy percentage */}
            <Line
              type="monotone"
              dataKey="bankruptcy_pct"
              stroke="#ef4444"
              strokeWidth={2.5}
              dot={false}
              yAxisId="pct"
              name="bankruptcy_pct"
            />

            {/* Depletion percentage */}
            <Line
              type="monotone"
              dataKey="depletion_pct"
              stroke="#f97316"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              yAxisId="pct"
              name="depletion_pct"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
