import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BondSweepResponse } from "../../types";

const CLASS_CONFIG: Record<string, { color: string; label: string }> = {
  ISA: { color: "#22c55e", label: "ISA" },
  GIA: { color: "#3b82f6", label: "GIA" },
  PENSION: { color: "#eab308", label: "Pension" },
};

function fmt_money(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `\u00A3${(v / 1_000_000).toFixed(1)}m`;
  return `\u00A3${Math.round(v / 1000)}k`;
}

type Props = {
  data: BondSweepResponse;
};

export function BondSweepChart({ data }: Props) {
  const [view, setView] = useState<"risk" | "wealth">("risk");

  // Merge marginal curves into chart-ready format
  const merged = useMemo(() => {
    const map = new Map<number, Record<string, number>>();
    for (const curve of data.marginals) {
      const cls = curve.asset_class;
      for (const pt of curve.points) {
        const existing = map.get(pt.bond_pct) ?? { bond_pct: pt.bond_pct };
        existing[`${cls}_avg_risk`] = pt.avg_bankruptcy_pct;
        existing[`${cls}_min_risk`] = pt.min_bankruptcy_pct;
        existing[`${cls}_avg_nw`] = pt.avg_median_net_worth;
        existing[`${cls}_max_nw`] = pt.max_median_net_worth;
        map.set(pt.bond_pct, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.bond_pct - b.bond_pct);
  }, [data.marginals]);

  const classes = data.asset_classes;

  return (
    <div className="space-y-4">
      {/* Marginal effect chart */}
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">
            Marginal Effect by Asset Class
            <span className="ml-2 text-xs font-normal text-slate-400">
              Each line averages over all combinations of the other classes. Dashed = best achievable.
            </span>
          </div>
          <div className="flex gap-1 rounded bg-slate-800 p-0.5 text-xs">
            <button
              className={`rounded px-3 py-1 transition-colors ${view === "risk" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              onClick={() => setView("risk")}
            >
              Risk
            </button>
            <button
              className={`rounded px-3 py-1 transition-colors ${view === "wealth" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              onClick={() => setView("wealth")}
            >
              Wealth
            </button>
          </div>
        </div>

        <div className="h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={merged} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="bond_pct"
                stroke="#94a3b8"
                tickFormatter={(v) => `${v}%`}
                label={{ value: "Bond Allocation %", position: "insideBottom", offset: -10, fill: "#64748b", fontSize: 12 }}
              />

              {view === "risk" ? (
                <>
                  <YAxis yAxisId="pct" stroke="#94a3b8" domain={[0, "auto"]} tickFormatter={(v) => `${v}%`}
                    label={{ value: "Bankruptcy Risk %", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: "#0b1220", border: "1px solid #1f2937", color: "#e2e8f0" }}
                    formatter={(value: number, name: string) => {
                      const cls = name.split("_")[0];
                      const label = CLASS_CONFIG[cls]?.label ?? cls;
                      if (name.includes("min_risk")) return [`${value.toFixed(1)}%`, `${label} best-case`];
                      if (name.includes("avg_risk")) return [`${value.toFixed(1)}%`, `${label} average`];
                      return [String(value), name];
                    }}
                    labelFormatter={(label) => `Bond: ${label}%`}
                  />
                  <Legend wrapperStyle={{ paddingTop: "10px" }} iconType="line" contentStyle={{ color: "#e2e8f0" }}
                    formatter={(value: string) => {
                      const cls = value.split("_")[0];
                      const label = CLASS_CONFIG[cls]?.label ?? cls;
                      if (value.includes("min_risk")) return `${label} best-case`;
                      if (value.includes("avg_risk")) return `${label} average`;
                      return value;
                    }} />
                  {classes.map((cls) => (
                    <Area key={`${cls}_band`} type="monotone" dataKey={`${cls}_avg_risk`}
                      stroke="none" fill={CLASS_CONFIG[cls]?.color ?? "#94a3b8"} fillOpacity={0.06}
                      yAxisId="pct" legendType="none" isAnimationActive={false} />
                  ))}
                  {classes.map((cls) => (
                    <Line key={`${cls}_avg_risk`} type="monotone" dataKey={`${cls}_avg_risk`}
                      stroke={CLASS_CONFIG[cls]?.color ?? "#94a3b8"} strokeWidth={2.5} dot={false} yAxisId="pct" />
                  ))}
                  {classes.map((cls) => (
                    <Line key={`${cls}_min_risk`} type="monotone" dataKey={`${cls}_min_risk`}
                      stroke={CLASS_CONFIG[cls]?.color ?? "#94a3b8"} strokeWidth={1.5} strokeDasharray="4 2"
                      dot={false} yAxisId="pct" />
                  ))}
                </>
              ) : (
                <>
                  <YAxis yAxisId="money" stroke="#94a3b8" tickFormatter={fmt_money}
                    label={{ value: "Median Final Net Worth", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: "#0b1220", border: "1px solid #1f2937", color: "#e2e8f0" }}
                    formatter={(value: number, name: string) => {
                      const cls = name.split("_")[0];
                      const label = CLASS_CONFIG[cls]?.label ?? cls;
                      if (name.includes("max_nw")) return [fmt_money(value), `${label} best-case`];
                      if (name.includes("avg_nw")) return [fmt_money(value), `${label} average`];
                      return [String(value), name];
                    }}
                    labelFormatter={(label) => `Bond: ${label}%`}
                  />
                  <Legend wrapperStyle={{ paddingTop: "10px" }} iconType="line" contentStyle={{ color: "#e2e8f0" }}
                    formatter={(value: string) => {
                      const cls = value.split("_")[0];
                      const label = CLASS_CONFIG[cls]?.label ?? cls;
                      if (value.includes("max_nw")) return `${label} best-case`;
                      if (value.includes("avg_nw")) return `${label} average`;
                      return value;
                    }} />
                  {classes.map((cls) => (
                    <Area key={`${cls}_band`} type="monotone" dataKey={`${cls}_max_nw`}
                      stroke="none" fill={CLASS_CONFIG[cls]?.color ?? "#94a3b8"} fillOpacity={0.06}
                      yAxisId="money" legendType="none" isAnimationActive={false} />
                  ))}
                  {classes.map((cls) => (
                    <Line key={`${cls}_avg_nw`} type="monotone" dataKey={`${cls}_avg_nw`}
                      stroke={CLASS_CONFIG[cls]?.color ?? "#94a3b8"} strokeWidth={2.5} dot={false} yAxisId="money" />
                  ))}
                  {classes.map((cls) => (
                    <Line key={`${cls}_max_nw`} type="monotone" dataKey={`${cls}_max_nw`}
                      stroke={CLASS_CONFIG[cls]?.color ?? "#94a3b8"} strokeWidth={1.5} strokeDasharray="4 2"
                      dot={false} yAxisId="money" />
                  ))}
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top combos table */}
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <div className="mb-3 text-sm font-semibold">
          Top Combinations
          <span className="ml-2 text-xs font-normal text-slate-400">
            {data.total_combos_tested.toLocaleString()} combinations tested, ranked by median net worth (bankruptcy &le; 5%)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="px-3 py-2 text-left">#</th>
                {data.asset_classes.includes("ISA") && <th className="px-3 py-2 text-right text-green-400">ISA bonds</th>}
                {data.asset_classes.includes("GIA") && <th className="px-3 py-2 text-right text-blue-400">GIA bonds</th>}
                {data.asset_classes.includes("PENSION") && <th className="px-3 py-2 text-right text-yellow-400">Pension bonds</th>}
                <th className="px-3 py-2 text-right">Median NW</th>
                <th className="px-3 py-2 text-right">P10 NW</th>
                <th className="px-3 py-2 text-right">Bankruptcy</th>
              </tr>
            </thead>
            <tbody>
              {data.top_combos.map((combo, i) => {
                const is_optimal = combo.isa_bond_pct === data.optimal.isa_bond_pct
                  && combo.gia_bond_pct === data.optimal.gia_bond_pct
                  && combo.pension_bond_pct === data.optimal.pension_bond_pct;
                return (
                  <tr key={i} className={`border-b border-slate-800/50 ${is_optimal ? "bg-indigo-950/30" : "hover:bg-slate-800/30"}`}>
                    <td className="px-3 py-2 text-slate-400">{is_optimal ? "\u2605" : i + 1}</td>
                    {data.asset_classes.includes("ISA") && <td className="px-3 py-2 text-right font-mono">{combo.isa_bond_pct}%</td>}
                    {data.asset_classes.includes("GIA") && <td className="px-3 py-2 text-right font-mono">{combo.gia_bond_pct}%</td>}
                    {data.asset_classes.includes("PENSION") && <td className="px-3 py-2 text-right font-mono">{combo.pension_bond_pct}%</td>}
                    <td className="px-3 py-2 text-right font-mono">{fmt_money(combo.median_final_net_worth)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">{fmt_money(combo.p10_final_net_worth)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${combo.bankruptcy_pct <= 5 ? "text-green-400" : combo.bankruptcy_pct <= 10 ? "text-amber-400" : "text-red-400"}`}>
                      {combo.bankruptcy_pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
