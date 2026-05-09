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
  // P1.5/P1.6: Pension rules
  pension_annual_allowance_charge: number;
  pension_tax_free_cash_remaining: number;
  pension_tax_free_cash_taken: number;
  pension_mpaa_active: number;
  pension_annual_allowance: number;
  pension_is_tapered: number;
  pension_tapered_allowance: number;
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

  // P1.5/P1.6: Pension rules
  const pension_aa_charge = sanitize(result.pension_annual_allowance_charge_median?.[yearIndex]);
  const pension_tax_free_remaining = sanitize(result.pension_tax_free_cash_remaining_median?.[yearIndex]);
  const pension_tax_free_taken = sanitize(result.pension_tax_free_cash_taken_median?.[yearIndex]);
  const pension_mpaa_active = sanitize(result.pension_mpaa_active_median?.[yearIndex]);
  const pension_aa = sanitize(result.pension_annual_allowance_median?.[yearIndex]);
  const pension_is_tapered = sanitize(result.pension_is_tapered_median?.[yearIndex]);
  const pension_tapered_aa = sanitize(result.pension_tapered_allowance_median?.[yearIndex]);

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
    // P1.5/P1.6: Pension rules
    pension_annual_allowance_charge: pension_aa_charge,
    pension_tax_free_cash_remaining: pension_tax_free_remaining,
    pension_tax_free_cash_taken: pension_tax_free_taken,
    pension_mpaa_active: pension_mpaa_active,
    pension_annual_allowance: pension_aa,
    pension_is_tapered: pension_is_tapered,
    pension_tapered_allowance: pension_tapered_aa,
  };
}

function formatCurrency(value: number): string {
  return `£${Math.round(value).toLocaleString()}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

/* ─── Salary tax band table (kept as-is) ─── */

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
        Salary income tax by band
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

/* ─── Income tax source breakdown ─── */

function TaxSourceRow({
  label,
  value,
  detail,
  tone,
  muted = false,
  children,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "rose" | "amber" | "cyan";
  muted?: boolean;
  children?: ReactNode;
}) {
  const width = 100; // 100% of the income tax bucket
  const toneClasses = {
    rose: { bar: "bg-rose-400/80", rail: "bg-rose-950/60" },
    amber: { bar: "bg-amber-400/80", rail: "bg-amber-950/60" },
    cyan: { bar: "bg-cyan-400/80", rail: "bg-cyan-950/60" },
  };

  return (
    <div className={`rounded-lg border border-slate-800/80 ${muted ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
        <div className="flex-1">
          <span className="font-medium text-slate-200">{label}</span>
          <span className="ml-2 text-xs text-slate-500">{detail}</span>
        </div>
        <span className="text-base font-semibold text-slate-100">{formatCurrency(value)}</span>
      </div>
      <div className={`h-1 overflow-hidden rounded-full ${toneClasses[tone].rail}`}>
        <div className={`h-full rounded-full ${toneClasses[tone].bar}`} style={{ width: `${width}%` }} />
      </div>
      {children}
    </div>
  );
}

/* ─── Pension rules compact strip ─── */

function PensionRulesStrip({
  isTapered,
  taperedAllowance,
  aaCharge,
  taxFreeRemaining,
  taxFreeTaken,
  mpaaActive,
  annualAllowance,
}: {
  isTapered: number;
  taperedAllowance: number;
  aaCharge: number;
  taxFreeRemaining: number;
  taxFreeTaken: number;
  mpaaActive: number;
  annualAllowance: number;
}) {
  const hasAlerts = aaCharge > 0 || isTapered > 0.5 || mpaaActive > 0.5;

  return (
    <div className={`rounded-lg border ${hasAlerts ? "border-amber-800/40 bg-amber-950/20" : "border-slate-800 bg-slate-950/30"} px-3 py-2.5`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-slate-500">AA: <span className="font-medium text-slate-300">{formatCurrency(annualAllowance)}</span></span>
        {isTapered > 0.5 && (
          <span className="flex items-center gap-1 text-amber-300">
            ⚠ Tapered → <span className="font-medium">{formatCurrency(taperedAllowance)}</span>
          </span>
        )}
        {aaCharge > 0 && (
          <span className="flex items-center gap-1 text-red-300">
            AA charge: <span className="font-medium">{formatCurrency(aaCharge)}</span>
          </span>
        )}
        <span className="text-slate-500">Tax-free: <span className="font-medium text-slate-300">{formatCurrency(taxFreeRemaining)}</span> left</span>
        <span className="text-slate-500">Taken: <span className="font-medium text-slate-300">{formatCurrency(taxFreeTaken)}</span></span>
        {mpaaActive > 0.5 && (
          <span className="flex items-center gap-1 text-orange-300">
            MPAA active
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Main panel ─── */

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

  const {
    total_tax,
    income_tax_bucket,
    national_insurance,
    cgt,
    salary_tax,
    rental_tax,
    pension_drawdown_tax,
    state_pension_tax,
    gia_cgt,
    property_cgt,
    salary_band_breakdown,
    // Pension rules
    pension_annual_allowance_charge,
    pension_tax_free_cash_remaining,
    pension_tax_free_cash_taken,
    pension_mpaa_active,
    pension_annual_allowance,
    pension_is_tapered,
    pension_tapered_allowance,
  } = summary;

  const has_state_pension_tax = state_pension_tax !== null;

  return (
    <section className="rounded border border-slate-800 bg-slate-900/30 p-4">
      {/* Header */}
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
            Income tax, CGT, and NI roll up to total tax for the selected year.
          </p>
        </div>
      </div>

      {/* ─── Total Tax hero ─── */}
      <div className="mb-6 rounded-xl border border-cyan-300/20 bg-cyan-950/30 p-5">
        <div className="text-xs uppercase tracking-wide text-cyan-200/70">Total Tax</div>
        <div className="mt-1 text-3xl font-bold text-cyan-100">{formatCurrency(total_tax)}</div>
        <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
          <span>{formatCurrency(income_tax_bucket)} income tax</span>
          <span>+</span>
          <span>{formatCurrency(cgt)} CGT</span>
          <span>+</span>
          <span>{formatCurrency(national_insurance)} NI</span>
          <span className="ml-auto text-slate-400">=</span>
        </div>
      </div>

      {/* ─── Income tax sources ─── */}
      <div className="mb-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Income Tax Sources</div>
        <div className="space-y-1">
          <TaxSourceRow
            label="Salary income tax"
            value={salary_tax}
            detail="Employment income"
            tone="rose"
          >
            {salary_band_breakdown ? (
              <SalaryTaxBandBreakdownTable breakdown={salary_band_breakdown} />
            ) : (
              <div className="mt-2 px-3 pb-2 text-xs text-slate-500">
                Run against a newer backend to see salary tax by band.
              </div>
            )}
          </TaxSourceRow>

          <TaxSourceRow
            label="Rental income tax"
            value={rental_tax}
            detail="Property rental"
            tone="amber"
            muted={rental_tax === 0}
          />

          <TaxSourceRow
            label="Pension drawdown tax"
            value={pension_drawdown_tax}
            detail="Private pension withdrawals"
            tone="amber"
            muted={pension_drawdown_tax === 0}
          />

          {has_state_pension_tax && (
            <TaxSourceRow
              label="State pension tax"
              value={state_pension_tax}
              detail={`Peak ${formatCurrency(summary.peak_state_pension_tax ?? 0)} in ${summary.peak_state_pension_tax_year}`}
              tone="amber"
              muted={state_pension_tax === 0}
            />
          )}
        </div>
      </div>

      {/* ─── CGT ─── */}
      {cgt > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Capital Gains Tax</div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 flex items-center justify-between">
            <span className="text-sm text-slate-200">
              GIA: {formatCurrency(gia_cgt ?? 0)} · Property: {formatCurrency(property_cgt ?? 0)}
            </span>
            <span className="text-base font-semibold text-cyan-200">{formatCurrency(cgt)}</span>
          </div>
        </div>
      )}

      {/* ─── Pension rules compact strip ─── */}
      {(pension_annual_allowance_charge > 0 || pension_is_tapered > 0.5 || pension_mpaa_active > 0.5) && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pension Rules</div>
          <PensionRulesStrip
            isTapered={pension_is_tapered}
            taperedAllowance={pension_tapered_allowance}
            aaCharge={pension_annual_allowance_charge}
            taxFreeRemaining={pension_tax_free_cash_remaining}
            taxFreeTaken={pension_tax_free_cash_taken}
            mpaaActive={pension_mpaa_active}
            annualAllowance={pension_annual_allowance}
          />
        </div>
      )}
    </section>
  );
}
