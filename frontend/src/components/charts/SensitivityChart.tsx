import { useMemo } from "react";
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
import type { SensitivityPoint } from "../../types";

type Props = {
  sensitivity_curve: SensitivityPoint[];
  current_fun_fund: number;
  max_safe_fun_fund: number;
  risk_threshold: number;
  net_worth_deflator?: number;
};

export function SensitivityChart({
  sensitivity_curve,
  current_fun_fund,
  max_safe_fun_fund,
  risk_threshold,
  net_worth_deflator = 1,
}: Props) {
  if (sensitivity_curve.length === 0) return null;

  const data = useMemo(() => sensitivity_curve.map((pt) => ({
    fun_fund: pt.fun_fund,
    bankruptcy_pct: pt.bankruptcy_pct,
    depletion_pct: pt.depletion_pct,
    p10_net_worth: pt.p10_final_net_worth * net_worth_deflator,
  })), [sensitivity_curve, net_worth_deflator]);

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3 text-sm font-semibold">
        Fun Fund Sensitivity
        <span className="ml-2 text-xs font-normal text-slate-400">
          How risk changes with retirement spending
        </span>
      </div>
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 24, right: 20, bottom: 20, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="fun_fund"
              type="number"
              domain={["dataMin", "dataMax"]}
              stroke="#94a3b8"
              tickFormatter={(v) => `£${Math.round(v / 1000)}k`}
              label={{
                value: "Annual Fun Fund",
                position: "insideBottom",
                offset: -10,
                fill: "#64748b",
                fontSize: 12,
              }}
            />
            <YAxis
              yAxisId="pct"
              stroke="#94a3b8"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              label={{
                value: "Risk %",
                angle: -90,
                position: "insideLeft",
                fill: "#64748b",
                fontSize: 12,
              }}
            />
            <YAxis
              yAxisId="money"
              orientation="right"
              stroke="#94a3b8"
              tickFormatter={(v) => `£${Math.round(v / 1000)}k`}
            />
            <Tooltip
              contentStyle={{
                background: "#0b1220",
                border: "1px solid #1f2937",
                color: "#e2e8f0",
              }}
              formatter={(value: number, name: string) => {
                if (name === "p10_net_worth")
                  return [
                    `£${Math.round(value).toLocaleString()}`,
                    "P10 Final Net Worth",
                  ];
                const label =
                  name === "bankruptcy_pct"
                    ? "Bankruptcy Risk"
                    : "Asset Depletion";
                return [`${value.toFixed(1)}%`, label];
              }}
              labelFormatter={(label) =>
                `Fun Fund: £${Math.round(Number(label)).toLocaleString()}/year`
              }
            />
            <Legend
              wrapperStyle={{ paddingTop: "10px", color: "#e2e8f0" }}
              iconType="line"
              formatter={(value) => {
                if (value === "bankruptcy_pct") return "Bankruptcy risk";
                if (value === "depletion_pct") return "Asset depletion";
                if (value === "p10_net_worth") return "P10 final net worth";
                if (value === "safe_limit") return "Safe limit";
                if (value === "current_spend") return "Current spend";
                return value;
              }}
            />

            {/* Safe zone shading */}
            {max_safe_fun_fund > 0 && (
              <Area
                type="monotone"
                dataKey={() => 100}
                yAxisId="pct"
                fill="#22c55e"
                fillOpacity={0.04}
                stroke="none"
                tooltipType="none"
                legendType="none"
                isAnimationActive={false}
              />
            )}

            {/* Risk threshold horizontal line */}
            <ReferenceLine
              y={risk_threshold}
              yAxisId="pct"
              stroke="#6366f1"
              strokeDasharray="6 3"
              strokeWidth={1}
              label={{
                value: `${risk_threshold}% threshold`,
                position: "right",
                fill: "#6366f1",
                fontSize: 11,
              }}
            />

            {/* Max safe fun fund vertical line */}
            {max_safe_fun_fund > 0 && (
              <ReferenceLine
                x={max_safe_fun_fund}
                yAxisId="pct"
                stroke="#22c55e"
                strokeDasharray="4 4"
                strokeWidth={2}
                name="safe_limit"
                label={{
                  value: `Safe: £${Math.round(max_safe_fun_fund / 1000)}k`,
                  position: "top",
                  fill: "#22c55e",
                  fontSize: 11,
                }}
              />
            )}

            {/* Current fun fund vertical line */}
            {current_fun_fund > 0 && (
              <ReferenceLine
                x={current_fun_fund}
                yAxisId="pct"
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={2}
                name="current_spend"
                label={{
                  value: `Current: £${Math.round(current_fun_fund / 1000)}k`,
                  position: "insideTop",
                  fill: "#f59e0b",
                  fontSize: 11,
                  offset: -24,
                }}
              />
            )}

            {/* P10 net worth (right axis) */}
            <Line
              type="monotone"
              dataKey="p10_net_worth"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={false}
              yAxisId="money"
              name="p10_net_worth"
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
