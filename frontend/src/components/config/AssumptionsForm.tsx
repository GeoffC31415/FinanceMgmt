import { useEffect, useState } from "react";
import { Controller } from "react-hook-form";
import type { Control, UseFormSetValue } from "react-hook-form";
import type { TaxYearPreset, ReturnModel, HistoricalReturnsStats } from "../../types";
import { list_tax_years, get_historical_returns } from "../../api/client";
import { PercentInput, NumberInput, InfoTip } from "./inputs";

type Props = {
  control: Control<any>;
  setValue: UseFormSetValue<any>;
  disabled?: boolean;
};

function TaxYearSelector({
  control,
  disabled
}: {
  control: Control<any>;
  disabled?: boolean;
}) {
  const [presets, setPresets] = useState<TaxYearPreset[]>([]);
  const [is_loading, setIsLoading] = useState(true);

  useEffect(() => {
    list_tax_years()
      .then(setPresets)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-2">
      <Controller
        control={control}
        name="assumptions.tax_year"
        render={({ field: { value, onChange } }) => {
          const selected = presets.find((p) => p.tax_year === value);
          return (
            <>
              <select
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={value || ""}
                onChange={(e) => onChange(e.target.value || undefined)}
                disabled={disabled ?? is_loading}
              >
                <option value="">Select tax year...</option>
                {presets.map((p) => (
                  <option key={p.tax_year} value={p.tax_year}>
                    {p.tax_year}
                  </option>
                ))}
              </select>
              {selected && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-400 rounded border border-slate-800 bg-slate-950/50 p-3">
                  <div>Personal allowance: <span className="text-slate-200">£{selected.personal_allowance.toLocaleString()}</span></div>
                  <div>Basic rate ({(selected.basic_rate * 100).toFixed(0)}%): up to <span className="text-slate-200">£{selected.basic_rate_limit.toLocaleString()}</span></div>
                  <div>Higher rate ({(selected.higher_rate * 100).toFixed(0)}%): up to <span className="text-slate-200">£{selected.higher_rate_limit.toLocaleString()}</span></div>
                  <div>Additional rate: <span className="text-slate-200">{(selected.additional_rate * 100).toFixed(0)}%</span></div>
                  <div>NI main rate: <span className="text-slate-200">{(selected.ni_main_rate * 100).toFixed(1)}%</span></div>
                  <div>NI upper rate: <span className="text-slate-200">{(selected.ni_upper_rate * 100).toFixed(1)}%</span></div>
                </div>
              )}
            </>
          );
        }}
      />
    </div>
  );
}

function ReturnModelSelector({
  value,
  onChange,
  disabled
}: {
  value: ReturnModel;
  onChange: (model: ReturnModel) => void;
  disabled?: boolean;
}) {
  const [stats, setStats] = useState<HistoricalReturnsStats | null>(null);

  useEffect(() => {
    get_historical_returns()
      .then((res) => setStats(res.stats))
      .catch(() => {});
  }, []);

  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4 md:col-span-2">
      <label className="block text-sm font-medium">Investment Return Model</label>
      <p className="text-xs text-slate-400 mt-1">
        Choose how annual investment returns are modelled for equity assets (ISA, GIA, Pension). Cash always earns 0%.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <label className="flex items-start gap-3 cursor-pointer rounded border border-slate-700 bg-slate-950/50 p-3 hover:border-slate-500">
          <input
            type="radio"
            className="mt-0.5 h-4 w-4"
            checked={value === "historical_bootstrap"}
            onChange={() => onChange("historical_bootstrap")}
          />
          <div>
            <div className="text-sm font-medium">S&amp;P 500 Historical Bootstrap</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Randomly samples from {stats?.count ?? "..."} years ({stats?.first_year ?? "..."}&#8211;{stats?.last_year ?? "..."}) of actual S&amp;P 500 annual returns.
              Captures real-world fat tails and crash severity. All equity assets share the same market return each year.
            </div>
            {stats && (
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-400 rounded border border-slate-800 bg-slate-950/50 p-2 sm:grid-cols-4">
                <div>Mean: <span className="text-slate-200">{(stats.mean * 100).toFixed(1)}%</span></div>
                <div>Std dev: <span className="text-slate-200">{(stats.std * 100).toFixed(1)}%</span></div>
                <div>Best: <span className="text-emerald-300">+{(stats.max * 100).toFixed(1)}%</span> ({stats.max_year})</div>
                <div>Worst: <span className="text-rose-300">{(stats.min * 100).toFixed(1)}%</span> ({stats.min_year})</div>
              </div>
            )}
          </div>
        </label>
        <label className="flex items-start gap-3 cursor-pointer rounded border border-slate-700 bg-slate-950/50 p-3 hover:border-slate-500">
          <input
            type="radio"
            className="mt-0.5 h-4 w-4"
            checked={value === "parametric"}
            onChange={() => onChange("parametric")}
          />
          <div>
            <div className="text-sm font-medium">Custom (Normal distribution)</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Each asset uses its own mean and standard deviation (configured in Assets tab).
              Returns are drawn from a normal distribution independently per asset.
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}

/**
 * AssumptionsForm — handles the Assumptions tab in the scenario form.
 * Manages global simulation parameters: tax year, return model, inflation,
 * limits, and bankruptcy thresholds.
 */
export function AssumptionsForm({ control, disabled }: Props) {
  const returnModel = control._getWatch("assumptions.return_model") ?? "parametric";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Tax Year Selector */}
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4 md:col-span-2">
        <label className="block text-sm font-medium">Tax Year</label>
        <p className="text-xs text-slate-400 mt-1">Select a UK tax year to use for income tax and NI calculations. Bands are applied throughout the simulation.</p>
        <div className="mt-2">
          <TaxYearSelector control={control} disabled={disabled} />
        </div>
      </div>

      {/* Return Model Selector */}
      <ReturnModelSelector
        value={returnModel}
        onChange={(model) => setValue("assumptions.return_model", model, { shouldDirty: true })}
        disabled={disabled}
      />

      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <label className="block text-sm font-medium">Inflation rate</label>
        <div className="mt-1">
          <PercentInput control={control} name="assumptions.inflation_rate" placeholder="e.g. 2" />
        </div>
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <label className="block text-sm font-medium">ISA annual limit</label>
        <div className="mt-1">
          <NumberInput control={control} name="assumptions.isa_annual_limit" placeholder="e.g. 20,000" />
        </div>
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <label className="block text-sm font-medium">State pension annual</label>
        <div className="mt-1">
          <NumberInput control={control} name="assumptions.state_pension_annual" placeholder="e.g. 11,500" />
        </div>
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <label className="block text-sm font-medium">Pension access age</label>
        <div className="mt-1">
          <NumberInput control={control} name="assumptions.pension_access_age" placeholder="e.g. 55" />
        </div>
        <div className="mt-1 text-xs text-slate-400">Minimum age to withdraw from private pensions. UK is currently 55 (rising to 57 in 2028).</div>
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <label className="block text-sm font-medium">Start year</label>
        <div className="mt-1">
          <NumberInput control={control} name="assumptions.start_year" placeholder="e.g. 2026" />
        </div>
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <label className="block text-sm font-medium">End year</label>
        <div className="mt-1">
          <NumberInput control={control} name="assumptions.end_year" placeholder="e.g. 2086" />
        </div>
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <label className="block text-sm font-medium">Extra retirement spending</label>
        <p className="text-xs text-slate-400 mt-1">Additional discretionary spending once everyone is retired (on top of configured expenses)</p>
        <div className="mt-2">
          <NumberInput control={control} name="assumptions.annual_spend_target" placeholder="e.g. 30,000" />
        </div>
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <label className="block text-sm font-medium">Debt interest rate</label>
        <p className="text-xs text-slate-400 mt-1">Annual interest rate applied when borrowing (negative cash balance)</p>
        <div className="mt-2">
          <PercentInput control={control} name="assumptions.debt_interest_rate" placeholder="e.g. 8" />
        </div>
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <label className="block text-sm font-medium">Bankruptcy threshold</label>
        <p className="text-xs text-slate-400 mt-1">Net worth below which simulation terminates (negative value, e.g. -100,000)</p>
        <div className="mt-2">
          <NumberInput control={control} name="assumptions.bankruptcy_threshold" placeholder="e.g. -100,000" />
        </div>
      </div>
    </div>
  );
}
