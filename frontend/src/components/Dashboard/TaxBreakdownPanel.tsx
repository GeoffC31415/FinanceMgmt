import type { SimulationResponse } from "../../types";

type Props = {
  display_result: SimulationResponse;
  percentile: number;
};

export type TaxBreakdownSummary = {
  final_year: number;
  total_tax: number;
  income_tax_bucket: number;
  national_insurance: number;
  state_pension_tax: number | null;
  state_pension_tax_share_pct: number | null;
  peak_state_pension_tax: number | null;
  peak_state_pension_tax_year: number | null;
};

const sanitize = (value: number | undefined | null): number => {
  const num = value ?? 0;
  return Number.isFinite(num) ? num : 0;
};

export function getTaxBreakdownSummary(result: SimulationResponse): TaxBreakdownSummary | null {
  if (!result.years.length) return null;

  const last_idx = result.years.length - 1;
  const total_tax = sanitize(result.total_tax_median[last_idx]);
  const income_tax_bucket = sanitize(result.income_tax_paid_median[last_idx]);
  const national_insurance = sanitize(result.ni_paid_median[last_idx]);
  const state_pension_tax_series = result.state_pension_tax_paid_median;

  let state_pension_tax: number | null = null;
  let state_pension_tax_share_pct: number | null = null;
  let peak_state_pension_tax: number | null = null;
  let peak_state_pension_tax_year: number | null = null;

  if (state_pension_tax_series?.length) {
    state_pension_tax = sanitize(state_pension_tax_series[last_idx]);
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
    final_year: result.years[last_idx],
    total_tax,
    income_tax_bucket,
    national_insurance,
    state_pension_tax,
    state_pension_tax_share_pct,
    peak_state_pension_tax,
    peak_state_pension_tax_year,
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

export function TaxBreakdownPanel({ display_result, percentile }: Props) {
  const summary = getTaxBreakdownSummary(display_result);
  if (!summary) return null;

  const has_state_pension_tax = summary.state_pension_tax !== null;

  return (
    <section className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold">
          Tax Breakdown
          {percentile !== 50 && (
            <span className="ml-2 text-xs font-normal text-amber-400">(P{percentile})</span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Median annual tax in {summary.final_year}. Income tax is still a legacy aggregate that may include pension drawdown tax and CGT; state pension tax is shown separately because it is calculated per person.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TaxMetricCard
          label="Total tax"
          value={formatCurrency(summary.total_tax)}
          detail="Income tax bucket plus National Insurance"
          tone="cyan"
        />
        <TaxMetricCard
          label="Income tax bucket"
          value={formatCurrency(summary.income_tax_bucket)}
          detail="Salary, rental, pension drawdown, state pension and CGT combined"
        />
        <TaxMetricCard
          label="National Insurance"
          value={formatCurrency(summary.national_insurance)}
          detail="Class 1 employee NI on salary"
        />
        <TaxMetricCard
          label="State pension tax"
          value={has_state_pension_tax ? formatCurrency(summary.state_pension_tax!) : "Not returned"}
          detail={
            has_state_pension_tax
              ? `${formatPercent(summary.state_pension_tax_share_pct ?? 0)} of total tax; peak ${formatCurrency(summary.peak_state_pension_tax ?? 0)} in ${summary.peak_state_pension_tax_year}`
              : "Run against a newer backend to see this source-specific field"
          }
          tone={has_state_pension_tax ? "amber" : "slate"}
        />
      </div>
    </section>
  );
}
