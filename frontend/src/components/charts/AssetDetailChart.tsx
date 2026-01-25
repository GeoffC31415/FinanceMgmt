import { useMemo, useState } from "react";
import {
  Bar,
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

type AssetGroup = "ISA" | "GIA" | "CASH" | "PENSION" | "DEBT";

type Props = {
  years: number[];
  retirement_years: number[];
  percentile?: number;

  // Balances
  isa_balance_median: number[];
  gia_balance_median: number[];
  cash_balance_median: number[];
  pension_balance_median: number[];
  debt_balance_median: number[];

  // Flows
  pension_contributions_median: number[]; // salary contributions (employee + employer)
  debt_interest_paid_median: number[];

  isa_returns_median: number[];
  gia_returns_median: number[];
  cash_returns_median: number[];
  pension_returns_median: number[];

  isa_contributions_median: number[];
  gia_contributions_median: number[];

  isa_withdrawals_median: number[];
  gia_withdrawals_median: number[];
  pension_withdrawals_median: number[];
};

const sanitize = (v: number | undefined | null): number => {
  const num = v ?? 0;
  return isNaN(num) || !isFinite(num) ? 0 : num;
};

const formatGBP = (v: number) => `£${Math.round(v).toLocaleString()}`;

export function AssetDetailChart({
  years,
  retirement_years,
  percentile = 50,
  isa_balance_median,
  gia_balance_median,
  cash_balance_median,
  pension_balance_median,
  debt_balance_median,
  pension_contributions_median,
  debt_interest_paid_median,
  isa_returns_median,
  gia_returns_median,
  cash_returns_median,
  pension_returns_median,
  isa_contributions_median,
  gia_contributions_median,
  isa_withdrawals_median,
  gia_withdrawals_median,
  pension_withdrawals_median
}: Props) {
  const [selected, setSelected] = useState<AssetGroup>("ISA");

  const { balanceLabel, data } = useMemo(() => {
    const balanceByType: Record<AssetGroup, number[]> = {
      ISA: isa_balance_median,
      GIA: gia_balance_median,
      CASH: cash_balance_median,
      PENSION: pension_balance_median,
      DEBT: debt_balance_median
    };

    const returnsByType: Record<AssetGroup, number[]> = {
      ISA: isa_returns_median,
      GIA: gia_returns_median,
      CASH: cash_returns_median,
      PENSION: pension_returns_median,
      DEBT: []
    };

    const contributionsByType: Record<AssetGroup, number[]> = {
      ISA: isa_contributions_median,
      GIA: gia_contributions_median,
      CASH: [],
      PENSION: pension_contributions_median,
      DEBT: []
    };

    const withdrawalsByType: Record<AssetGroup, number[]> = {
      ISA: isa_withdrawals_median,
      GIA: gia_withdrawals_median,
      CASH: [],
      PENSION: pension_withdrawals_median,
      DEBT: []
    };

    const label: Record<AssetGroup, string> = {
      ISA: "ISA balance",
      GIA: "GIA balance",
      CASH: "Cash balance",
      PENSION: "Pension balance",
      DEBT: "Debt balance"
    };

    const rows = years.map((year, idx) => {
      const balance = sanitize(balanceByType[selected]?.[idx]);
      const returns = sanitize(returnsByType[selected]?.[idx]);
      const contributions = sanitize(contributionsByType[selected]?.[idx]);
      const withdrawals = sanitize(withdrawalsByType[selected]?.[idx]);
      const debtInterest = sanitize(debt_interest_paid_median?.[idx]);

      return {
        year,
        balance,
        contributions,
        returns,
        withdrawals: -withdrawals, // show outflows below 0
        debt_interest: selected === "DEBT" ? -debtInterest : 0
      };
    });

    return { balanceLabel: label[selected], data: rows };
  }, [
    years,
    selected,
    isa_balance_median,
    gia_balance_median,
    cash_balance_median,
    pension_balance_median,
    debt_balance_median,
    pension_contributions_median,
    debt_interest_paid_median,
    isa_returns_median,
    gia_returns_median,
    cash_returns_median,
    pension_returns_median,
    isa_contributions_median,
    gia_contributions_median,
    isa_withdrawals_median,
    gia_withdrawals_median,
    pension_withdrawals_median
  ]);

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">
          Asset type breakdown
          {percentile !== 50 && (
            <span className="ml-2 text-xs font-normal text-amber-400">(P{percentile})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Asset type</label>
          <select
            className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            value={selected}
            onChange={(e) => setSelected(e.target.value as AssetGroup)}
          >
            <option value="ISA">ISA</option>
            <option value="GIA">GIA</option>
            <option value="CASH">Cash</option>
            <option value="PENSION">Pension</option>
            <option value="DEBT">Debt</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-[360px] rounded border border-slate-800/60 bg-slate-950/20 p-3">
          <div className="mb-2 text-xs font-medium text-slate-300">Balance</div>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="year" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={(v) => `£${Math.round(v / 1000)}k`} />
              <Tooltip
                contentStyle={{ background: "#0b1220", border: "1px solid #1f2937", color: "#e2e8f0" }}
                formatter={(value) => [formatGBP(Number(value)), balanceLabel]}
                labelFormatter={(label) => `Year ${label}`}
              />
              {retirement_years.map((year) => (
                <ReferenceLine key={`retire-${year}`} x={year} stroke="#f59e0b" strokeDasharray="4 4" />
              ))}
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#a78bfa"
                strokeWidth={2.5}
                dot={false}
                name="balance"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="h-[360px] rounded border border-slate-800/60 bg-slate-950/20 p-3">
          <div className="mb-2 text-xs font-medium text-slate-300">Incomings and outgoings</div>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="year" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={(v) => `£${Math.round(v / 1000)}k`} />
              <ReferenceLine y={0} stroke="#334155" />
              <Tooltip
                contentStyle={{ background: "#0b1220", border: "1px solid #1f2937", color: "#e2e8f0" }}
                formatter={(value, name) => {
                  const n = String(name);
                  const label =
                    n === "contributions"
                      ? "Contributions"
                      : n === "returns"
                        ? "Investment returns"
                        : n === "withdrawals"
                          ? "Withdrawals"
                          : n === "debt_interest"
                            ? "Debt interest"
                            : n;
                  return [formatGBP(Number(value)), label];
                }}
                labelFormatter={(label) => `Year ${label}`}
              />
              <Legend
                wrapperStyle={{ paddingTop: "8px" }}
                iconType="rect"
                formatter={(value) => {
                  if (value === "contributions") return "Contributions";
                  if (value === "returns") return "Investment returns";
                  if (value === "withdrawals") return "Withdrawals";
                  if (value === "debt_interest") return "Debt interest";
                  return String(value);
                }}
                contentStyle={{ color: "#e2e8f0" }}
              />
              <Bar dataKey="contributions" stackId="in" fill="#34d399" name="contributions" />
              <Bar dataKey="returns" stackId="in" fill="#60a5fa" name="returns" />
              <Bar dataKey="withdrawals" stackId="out" fill="#fb7185" name="withdrawals" />
              <Bar dataKey="debt_interest" stackId="out" fill="#fbbf24" name="debt_interest" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

