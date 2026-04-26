import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BondSweepResponse, MarginalCurve } from "../../types";

const CLASS_STYLE: Record<string, { color: string; label: string }> = {
  ISA: { color: "#22c55e", label: "ISA" },
  GIA: { color: "#3b82f6", label: "GIA" },
  PENSION: { color: "#eab308", label: "Pension" },
};

function fmt_money(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `\u00A3${(v / 1_000_000).toFixed(1)}m`;
  if (Math.abs(v) >= 1_000) return `\u00A3${Math.round(v / 1000)}k`;
  return `\u00A3${Math.round(v)}`;
}

function risk_label(pct: number): string {
  if (pct <= 2) return "Safe";
  if (pct <= 5) return "Low risk";
  if (pct <= 10) return "Moderate";
  if (pct <= 20) return "Risky";
  return "Dangerous";
}

function fun_fund_color(value: number, min_value: number, max_value: number): string {
  const spread = Math.max(max_value - min_value, 1);
  const ratio = Math.max(0, Math.min(1, (value - min_value) / spread));
  const hue = 10 + ratio * 110; // red -> green
  return `hsl(${hue}, 75%, 50%)`;
}

/** Single asset-class panel with heatmap strip + dual-axis chart */
function ClassPanel({ curve, optimal_pct }: { curve: MarginalCurve; optimal_pct: number }) {
  const style = CLASS_STYLE[curve.asset_class] ?? { color: "#94a3b8", label: curve.asset_class };
  const pts = curve.points;

  // Build heatmap segments from the best-case risk at each bond %
  const segments = useMemo(() => {
    const sorted = [...pts].sort((a, b) => a.bond_pct - b.bond_pct);
    return sorted.map((pt) => ({
      bond_pct: pt.bond_pct,
      risk: pt.min_bankruptcy_pct,
      avg_risk: pt.avg_bankruptcy_pct,
      best_fun_fund: pt.best_max_fun_fund,
      avg_fun_fund: pt.avg_max_fun_fund,
    }));
  }, [pts]);

  if (segments.length === 0) return null;

  const min_fun_fund = Math.min(...segments.map((seg) => seg.best_fun_fund));
  const max_fun_fund = Math.max(...segments.map((seg) => seg.best_fun_fund));

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full" style={{ background: style.color }} />
        <span className="text-sm font-semibold" style={{ color: style.color }}>{style.label}</span>
        <span className="text-xs text-slate-400">
          Optimal: {optimal_pct}% bonds
        </span>
      </div>

      {/* Risk heatmap strip — 0-100% uniform scale */}
      <div className="mb-1">
        <div className="text-[10px] text-slate-500 mb-1">Safe fun fund by bond allocation (best achievable at selected risk)</div>
        <div className="relative h-6 rounded overflow-hidden border border-slate-700 bg-slate-800">
          {segments.map((seg, i) => {
            const next = segments[i + 1];
            const left = seg.bond_pct;
            const right = next ? next.bond_pct : Math.min(seg.bond_pct + 1, 100);
            const is_optimal = Math.abs(seg.bond_pct - optimal_pct) < 0.5;
            return (
              <div
                key={seg.bond_pct}
                className="absolute inset-y-0"
                style={{
                  left: `${left}%`,
                  width: `${Math.max(right - left, 0.3)}%`,
                  background: fun_fund_color(seg.best_fun_fund, min_fun_fund, max_fun_fund),
                  opacity: is_optimal ? 1 : 0.7,
                  borderRight: is_optimal ? "2px solid white" : undefined,
                  borderLeft: is_optimal ? "2px solid white" : undefined,
                }}
                title={`${seg.bond_pct}% bonds: ${fmt_money(seg.best_fun_fund)} safe fun fund, ${seg.risk.toFixed(1)}% bankruptcy (${risk_label(seg.risk)})`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Dual-axis chart: risk + safe fun fund */}
      <div className="h-[180px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart isAnimationActive={false} data={segments} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="bond_pct" type="number" domain={[0, 100]} stroke="#64748b"
              tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`}
              ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]} />
            <YAxis yAxisId="risk" stroke="#64748b" tick={{ fontSize: 10 }} domain={[0, "auto"]}
              tickFormatter={(v) => `${v}%`} width={40} />
            <YAxis yAxisId="fund" orientation="right" stroke="#64748b" tick={{ fontSize: 10 }}
              tickFormatter={fmt_money} width={55} />
            <Tooltip
              contentStyle={{ background: "#0b1220", border: "1px solid #1f2937", color: "#e2e8f0", fontSize: 11 }}
              formatter={(value: number, name: string) => {
                if (name === "avg_risk") return [`${value.toFixed(1)}%`, "Avg bankruptcy"];
                if (name === "risk") return [`${value.toFixed(1)}%`, "Best-case bankruptcy"];
                if (name === "avg_fun_fund") return [fmt_money(value), "Avg max safe fun fund"];
                if (name === "best_fun_fund") return [fmt_money(value), "Best max safe fun fund"];
                return [String(value), name];
              }}
              labelFormatter={(l) => `${l}% bonds`}
            />
            {/* Risk area */}
            <Area type="monotone" dataKey="avg_risk" yAxisId="risk" fill="#ef4444" fillOpacity={0.1}
              stroke="#ef4444" strokeWidth={1.5} dot={false} name="avg_risk" />
            <Line type="monotone" dataKey="risk" yAxisId="risk" stroke="#ef4444" strokeWidth={1}
              strokeDasharray="3 2" dot={false} name="risk" />
            {/* Safe fun fund line */}
            <Line type="monotone" dataKey="avg_fun_fund" yAxisId="fund" stroke={style.color} strokeWidth={2}
              dot={false} name="avg_fun_fund" />
            <Line type="monotone" dataKey="best_fun_fund" yAxisId="fund" stroke={style.color} strokeWidth={1}
              strokeDasharray="3 2" dot={false} name="best_fun_fund" />
            {/* Optimal marker */}
            <ReferenceLine x={optimal_pct} yAxisId="risk" stroke="white" strokeDasharray="4 4"
              strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-1 text-[10px] text-slate-400 justify-center">
        <span><span className="inline-block w-3 h-0.5 bg-red-500 mr-1 align-middle" /> Avg risk</span>
        <span><span className="inline-block w-3 h-0.5 border-t border-dashed border-red-500 mr-1 align-middle" /> Best risk</span>
        <span><span className="inline-block w-3 h-0.5 mr-1 align-middle" style={{ background: style.color }} /> Avg max safe fun fund</span>
        <span><span className="inline-block w-3 h-0.5 border-t border-dashed mr-1 align-middle" style={{ borderColor: style.color }} /> Best max safe fun fund</span>
      </div>
    </div>
  );
}

type Props = {
  data: BondSweepResponse;
};

export function BondSweepChart({ data }: Props) {
  // Map optimal per class from the overall optimal combo
  const optimal_by_class: Record<string, number> = {
    ISA: data.optimal.isa_bond_pct,
    GIA: data.optimal.gia_bond_pct,
    PENSION: data.optimal.pension_bond_pct,
  };

  return (
    <div className="space-y-4">
      {/* Risk legend */}
      <div className="rounded border border-slate-800 bg-slate-900/30 p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">
            Sensitivity by Asset Class
            <span className="ml-2 text-xs font-normal text-slate-400">
              How does varying each class's bond % affect outcomes? (other classes held at their tested combos)
            </span>
          </div>
          <div className="flex gap-2 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "#22c55e" }} /> Safe</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "#86efac" }} /> Low</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "#fbbf24" }} /> Moderate</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "#f97316" }} /> Risky</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: "#ef4444" }} /> Dangerous</span>
          </div>
        </div>
      </div>

      {/* Per-class panels */}
      {data.marginals.map((curve) => (
        <ClassPanel
          key={curve.asset_class}
          curve={curve}
          optimal_pct={optimal_by_class[curve.asset_class] ?? 0}
        />
      ))}

      {/* Top combos table */}
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <div className="mb-3 text-sm font-semibold">
          Top Combinations
          <span className="ml-2 text-xs font-normal text-slate-400">
            {data.total_combos_tested.toLocaleString()} tested, ranked by max safe fun fund at {data.target_year} within risk threshold
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
                <th className="px-3 py-2 text-right">Max Fun Fund</th>
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
                    <td className="px-3 py-2 text-right font-mono">{fmt_money(combo.max_safe_fun_fund)}</td>
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
