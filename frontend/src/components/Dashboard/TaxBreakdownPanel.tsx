import { useMemo } from "react";
import type { SimulationResponse } from "../../types";

type Props = {
  display_result: SimulationResponse;
  percentile: number;
  selectedYearIndex: number | null;
};

export type TaxBreakdownSummary = {
  selected_year: number;
  total_tax: number;
  income_tax_bucket: number;
  national_insurance: number;
  state_pension_tax: number | null;
  state_pension_tax_share_pct: number | null;
  peak_state_pension_tax: number | null;
  peak_state_pension_tax_year: number | null;
  salary_tax: number;
  rental_tax: number;
  pension_drawdown_tax: number;
  cgt: number;
};

const sanitize = (value: number | undefined | null): number => {
  const num = value ?? 0;
  return Number.isFinite(num) ? num : 0;
};

export function getTaxBreakdownSummary(
  result: SimulationResponse,
  yearIndex: number,
): TaxBreakdownSummary | null {
  if (!result.years.length) return null;

  const total_tax = sanitize(result.total_tax_median[yearIndex]);
  const income_tax_bucket = sanitize(result.income_tax_paid_median[yearIndex]);
  const national_insurance = sanitize(result.ni_paid_median[yearIndex]);
  const salary_tax = sanitize(result.salary_income_tax_paid_median[yearIndex]);
  const rental_tax = sanitize(result.rental_income_tax_paid_median[yearIndex]);
  const pension_drawdown_tax = sanitize(result.pension_drawdown_tax_paid_median[yearIndex]);
  const cgt = sanitize(result.capital_gains_tax_paid_median[yearIndex]);
  const state_pension_tax_series = result.state_pension_tax_paid_median;

  let state_pension_tax: number | null = null;
  let state_pension_tax_share_pct: number | null = null;
  let peak_state_pension_tax: number | null = null;
  let peak_state_pension_tax_year: number | null = null;

  if (state_pension_tax_series?.length) {
    state_pension_tax = sanitize(state_pension_tax_series[yearIndex]);
    state_pension_tax_share_pct = total_tax > 0 ? (state_pension_tax / total_tax) * 100 : 0;

    peak_state_pension_tax = 0;
    peak_state_pension_tax_year = result.years[0];
    for (let i = 0; i < result.years.length; i++) {
      const value = sanitize(state_pension_tax_series[i]);
      if (value > peak_state_pension_tax) {
        peak_state_pension_tax = value;
        peak_state_pension_tax_year = result.years[i];
      }
    }
  }

  return {
    selected_year: result.years[yearIndex],
    total_tax,
    income_tax_bucket,
    national_insurance,
    state_pension_tax,
    state_pension_tax_share_pct,
    peak_state_pension_tax,
    peak_state_pension_tax_year,
    salary_tax,
    rental_tax,
    pension_drawdown_tax,
    cgt,
  };
}

function formatCurrency(value: number): string {
  return `£${Math.round(value).toLocaleString()}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function TaxMetricCard({
  label,
  value,
  detail,
  tone = "slate",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "slate" | "cyan" | "amber";
}) {
  const toneClasses = {
    slate: "text-slate-100 border-slate-700/50 bg-slate-900/60",
    cyan: "text-cyan-200 border-cyan-300/20 bg-cyan-300/10",
    amber: "text-amber-200 border-amber-300/20 bg-amber-300/10",
  };

  return (
    <div className={`rounded-lg border p-4 ${toneClasses[tone]}`}>
      <div className="text-xs font-medium text-slate-400 mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function TaxLineItem({
  label,
  value,
  detail,
  tone,
  totalTax,
  muted = false,
}: {
  label: string;
  value: number | null;
  detail: string;
  tone: "slate" | "cyan" | "amber" | "rose";
  totalTax: number;
  muted?: boolean;
}) {
  const displayValue = value ?? 0;
  const width = totalTax > 0 && value !== null ? Math.min((displayValue / totalTax) * 100, 100) : 0;
  const toneClasses = {
    slate: {
      text: "text-slate-200",
      bar: "bg-slate-500/60",
      rail: "bg-slate-800/70",
    },
    cyan: {
      text: "text-cyan-200",
      bar: "bg-cyan-400/80",
      rail: "bg-cyan-950/60",
    },
    amber: {
      text: "text-amber-200",
      bar: "bg-amber-400/80",
      rail: "bg-amber-950/60",
    },
    rose: {
      text: "text-rose-200",
      bar: "bg-rose-400/80",
      rail: "bg-rose-950/60",
    },
  };

  return (
    <div className={`rounded-lg border border-slate-800/80 bg-slate-950/40 p-3 ${muted ? "opacity-75" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`text-sm font-medium ${toneClasses[tone].text}`}>{label}</div>
          <div className="mt-1 text-xs text-slate-500">{detail}</div>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold text-slate-100">
            {value === null ? "Not returned" : formatCurrency(displayValue)}
          </div>
          {value !== null && totalTax > 0 && (
            <div className="mt-1 text-xs text-slate-500">{formatPercent((displayValue / totalTax) * 100)} of total tax</div>
          )}
        </div>
      </div>
      <div className={`mt-3 h-2 overflow-hidden rounded-full ${toneClasses[tone].rail}`}>
        <div className={`h-full rounded-full ${toneClasses[tone].bar}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function TaxBreakdownPanel({
  display_result,
  percentile,
  selectedYearIndex,
}: Props) {
  const resolvedIndex =
    selectedYearIndex ?? display_result.years.length - 1;
  const summary = useMemo(
    () => getTaxBreakdownSummary(display_result, resolvedIndex),
    [display_result, resolvedIndex],
  );
  if (!summary) return null;

  const has_state_pension_tax = summary.state_pension_tax !== null;
  const statePensionDetail = has_state_pension_tax
    ? `${formatPercent(summary.state_pension_tax_share_pct ?? 0)} of total tax; peak ${formatCurrency(summary.peak_state_pension_tax ?? 0)} in ${summary.peak_state_pension_tax_year}`
    : "Run against a newer backend to see this source-specific field";

  return (
    <section className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold">
              Tax Breakdown
              {percentile !== 50 && (
                <span className="ml-2 text-xs font-normal text-amber-400">(P{percentile})</span>
              )}
            </div>
            <span className="rounded-full border border-slate-700 bg-slate-950/60 px-2 py-0.5 text-xs text-slate-400">
              {summary.selected_year}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Built like a tax P&amp;L for the selected year: source taxes roll into the income tax bucket, then National Insurance is added to reach the final total.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-100">Income Tax Build-Up</div>
              <div className="mt-1 text-xs text-slate-500">Each source below contributes to the income tax bucket before NI is added.</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-500">Subtotal</div>
              <div className="text-lg font-semibold text-slate-100">{formatCurrency(summary.income_tax_bucket)}</div>
            </div>
          </div>

          <div className="space-y-3">
            <TaxLineItem
              label="Salary income tax"
              value={summary.salary_tax}
              detail="Income tax charged on employment income, excluding NI"
              tone="rose"
              totalTax={summary.total_tax}
            />
            <TaxLineItem
              label="Rental income tax"
              value={summary.rental_tax}
              detail="Marginal income tax from rental property income"
              tone="amber"
              totalTax={summary.total_tax}
            />
            <TaxLineItem
              label="Pension drawdown tax"
              value={summary.pension_drawdown_tax}
              detail="Income tax triggered by private pension withdrawals"
              tone="amber"
              totalTax={summary.total_tax}
            />
            <TaxLineItem
              label="State pension tax"
              value={summary.state_pension_tax}
              detail={statePensionDetail}
              tone="amber"
              totalTax={summary.total_tax}
              muted={!has_state_pension_tax}
            />
            <TaxLineItem
              label="Capital gains tax"
              value={summary.cgt}
              detail="Tax on realised investment and property gains"
              tone="cyan"
              totalTax={summary.total_tax}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-950/30 p-4">
            <div className="text-xs uppercase tracking-wide text-cyan-200/80">Roll-Up</div>
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <div className="text-xs text-slate-500">Income tax bucket</div>
                <div className="mt-1 text-xl font-semibold text-slate-100">{formatCurrency(summary.income_tax_bucket)}</div>
              </div>
              <div className="flex items-center justify-center text-slate-500">+</div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <div className="text-xs text-slate-500">National Insurance</div>
                <div className="mt-1 text-xl font-semibold text-slate-100">{formatCurrency(summary.national_insurance)}</div>
              </div>
              <div className="flex items-center justify-center text-slate-500">=</div>
              <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3">
                <div className="text-xs text-cyan-200/80">Total tax</div>
                <div className="mt-1 text-2xl font-bold text-cyan-100">{formatCurrency(summary.total_tax)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
