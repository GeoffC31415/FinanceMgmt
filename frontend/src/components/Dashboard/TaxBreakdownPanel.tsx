import { useMemo, type ReactNode } from "react";
import type { SimulationResponse } from "../../types";

type Props = {
  display_result: SimulationResponse;
  percentile: number;
  selectedYearIndex: number | null;
};

export type SalaryTaxBandBreakdown = {
  personal_allowance_used: number;
  personal_allowance_lost: number;
  basic_band_amount: number;
  basic_band_tax: number;
  higher_band_amount: number;
  higher_band_tax: number;
  additional_band_amount: number;
  additional_band_tax: number;
  allowance_taper_tax: number;
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
  gia_cgt: number;
  property_cgt: number;
  salary_band_breakdown: SalaryTaxBandBreakdown | null;
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
  const gia_cgt = sanitize(result.gia_cgt_paid_median?.[yearIndex]);
  const property_cgt = sanitize(result.property_cgt_paid_median?.[yearIndex]);
  const state_pension_tax_series = result.state_pension_tax_paid_median;
  const has_salary_band_breakdown = Boolean(result.salary_income_tax_basic_band_tax_median?.length);
  const salary_band_breakdown: SalaryTaxBandBreakdown | null = has_salary_band_breakdown
    ? {
        personal_allowance_used: sanitize(result.salary_income_tax_personal_allowance_used_median?.[yearIndex]),
        personal_allowance_lost: sanitize(result.salary_income_tax_personal_allowance_lost_median?.[yearIndex]),
        basic_band_amount: sanitize(result.salary_income_tax_basic_band_amount_median?.[yearIndex]),
        basic_band_tax: sanitize(result.salary_income_tax_basic_band_tax_median?.[yearIndex]),
        higher_band_amount: sanitize(result.salary_income_tax_higher_band_amount_median?.[yearIndex]),
        higher_band_tax: sanitize(result.salary_income_tax_higher_band_tax_median?.[yearIndex]),
        additional_band_amount: sanitize(result.salary_income_tax_additional_band_amount_median?.[yearIndex]),
        additional_band_tax: sanitize(result.salary_income_tax_additional_band_tax_median?.[yearIndex]),
        allowance_taper_tax: sanitize(result.salary_income_tax_allowance_taper_tax_median?.[yearIndex]),
      }
    : null;

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
    gia_cgt,
    property_cgt,
    salary_band_breakdown,
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
  children,
}: {
  label: string;
  value: number | null;
  detail: string;
  tone: "slate" | "cyan" | "amber" | "rose";
  totalTax: number;
  muted?: boolean;
  children?: ReactNode;
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
      {children}
    </div>
  );
}

function SalaryTaxBandBreakdownTable({ breakdown }: { breakdown: SalaryTaxBandBreakdown }) {
  const rateLabel = (tax: number, amount: number) => (amount > 0 ? formatPercent((tax / amount) * 100) : "—");
  const rows = [
    {
      label: "Personal allowance used",
      amount: breakdown.personal_allowance_used,
      rate: "0%",
      tax: 0,
      detail: "Tax-free salary allowance remaining after taper",
    },
    {
      label: "Basic rate band",
      amount: breakdown.basic_band_amount,
      rate: rateLabel(breakdown.basic_band_tax, breakdown.basic_band_amount),
      tax: breakdown.basic_band_tax,
      detail: "Salary income taxed at the basic rate",
    },
    {
      label: "Higher rate band",
      amount: breakdown.higher_band_amount,
      rate: rateLabel(breakdown.higher_band_tax, breakdown.higher_band_amount),
      tax: breakdown.higher_band_tax,
      detail: "Salary income taxed at the higher rate",
    },
    {
      label: "Additional rate band",
      amount: breakdown.additional_band_amount,
      rate: rateLabel(breakdown.additional_band_tax, breakdown.additional_band_amount),
      tax: breakdown.additional_band_tax,
      detail: "Salary income taxed at the additional rate",
    },
    {
      label: "Personal allowance taper",
      amount: breakdown.personal_allowance_lost,
      rate: "lost PA",
      tax: breakdown.allowance_taper_tax,
      detail: "Extra tax caused by losing £1 of allowance for each £2 above £100k",
      emphasize: breakdown.allowance_taper_tax > 0,
    },
  ];

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
      <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300">
        Salary income tax by band, with allowance taper shown separately
      </div>
      <div className="divide-y divide-slate-800/80">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-xs sm:grid-cols-[1fr_auto_auto_auto]">
            <div>
              <div className={row.emphasize ? "font-semibold text-amber-200" : "font-medium text-slate-200"}>{row.label}</div>
              <div className="mt-0.5 text-slate-500">{row.detail}</div>
            </div>
            <div className="text-right text-slate-300">{formatCurrency(row.amount)}</div>
            <div className="hidden min-w-16 text-right text-slate-500 sm:block">{row.rate}</div>
            <div className={row.emphasize ? "min-w-20 text-right font-semibold text-amber-200" : "min-w-20 text-right text-slate-100"}>
              {formatCurrency(row.tax)}
            </div>
          </div>
        ))}
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
            Built like a tax P&amp;L for the selected year: income taxes, CGT, and National Insurance roll up to total tax.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-100">Tax Build-Up</div>
              <div className="mt-1 text-xs text-slate-500">Income-tax sources contribute to the subtotal; CGT and NI are added separately in total tax.</div>
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
            >
              {summary.salary_band_breakdown ? (
                <SalaryTaxBandBreakdownTable breakdown={summary.salary_band_breakdown} />
              ) : (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-500">
                  Run against a newer backend to see salary tax by band and personal allowance taper.
                </div>
              )}
            </TaxLineItem>
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
            >
              {(summary.gia_cgt > 0 || summary.property_cgt > 0) ? (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <div className="text-slate-500">GIA CGT</div>
                    <div className="mt-1 font-semibold text-slate-100">{formatCurrency(summary.gia_cgt)}</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <div className="text-slate-500">Property CGT</div>
                    <div className="mt-1 font-semibold text-slate-100">{formatCurrency(summary.property_cgt)}</div>
                  </div>
                </div>
              ) : null}
            </TaxLineItem>
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
              <div className="flex items-center justify-center text-slate-500">+</div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <div className="text-xs text-slate-500">Capital gains tax</div>
                <div className="mt-1 text-xl font-semibold text-slate-100">{formatCurrency(summary.cgt)}</div>
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
