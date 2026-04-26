import { useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import type { Control, UseFormSetValue } from "react-hook-form";
import { format_number_input, format_percent_input, parse_number_input, parse_percent_input } from "./formConverters";

/**
 * Number input that shows formatted value (locale-aware thousands separators).
 * On focus: shows raw editable value. On blur: formats and commits.
 * Handles empty → 0 conversion.
 */
export function NumberInput({
  control,
  name,
  step,
  min,
  placeholder
}: {
  control: Control<any>;
  name: string;
  step?: number | string;
  min?: number;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <input
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          inputMode="decimal"
          placeholder={placeholder}
          value={editing !== null ? editing : format_number_input(Number(field.value ?? 0))}
          onChange={(e) => {
            setEditing(e.target.value);
            field.onChange(parse_number_input(e.target.value));
          }}
          onFocus={(e) => setEditing(e.target.value)}
          onBlur={() => { setEditing(null); field.onBlur(); }}
          step={step as number | undefined}
          min={min as number | undefined}
        />
      )}
    />
  );
}

/**
 * Annual value display that converts from monthly form value.
 * Shows `monthly * 12`. On change: divides by 12 before setting monthly value.
 */
export function AnnualFromMonthlyInput({
  control,
  monthly_name,
  setValue
}: {
  control: Control<any>;
  monthly_name: string;
  setValue: UseFormSetValue<any>;
}) {
  const monthly = Number(useWatch({ control, name: monthly_name }) ?? 0);
  const annual = monthly * 12;

  return (
    <input
      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
      inputMode="decimal"
      value={format_number_input(annual)}
      onChange={(e) => {
        const nextAnnual = parse_number_input(e.target.value);
        setValue(monthly_name, nextAnnual / 12, { shouldDirty: true, shouldValidate: true });
      }}
    />
  );
}

/**
 * Percent input that shows `value * 100` with `%` suffix.
 * On change: divides by 100 before calling field.onChange.
 * Same focus/blur pattern as NumberInput.
 */
export function PercentInput({
  control,
  name,
  placeholder
}: {
  control: Control<any>;
  name: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="relative">
          <input
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 pr-8 text-sm"
            inputMode="decimal"
            placeholder={placeholder}
            value={editing !== null ? editing : format_percent_input(Number(field.value ?? 0))}
            onChange={(e) => {
              setEditing(e.target.value);
              field.onChange(parse_percent_input(e.target.value));
            }}
            onFocus={(e) => setEditing(e.target.value)}
            onBlur={() => { setEditing(null); field.onBlur(); }}
          />
          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400">
            %
          </div>
        </div>
      )}
    />
  );
}

/**
 * Rental income section with toggle, rent fields, and occupancy rate.
 * When toggled off, sets rental fields to zero.
 */
export function RentalSection({
  control,
  index,
  initialOpen,
  annualRent,
  propRent,
  propOccupancy,
  setValue,
}: {
  control: Control<any>;
  index: number;
  initialOpen: boolean;
  annualRent: number;
  propRent: number;
  propOccupancy: number;
  setValue: UseFormSetValue<any>;
}) {
  const [open, setOpen] = useState(initialOpen);

  const handleToggle = (checked: boolean) => {
    setOpen(checked);
    if (!checked) {
      setValue(`properties.${index}.monthly_rental_income`, 0, { shouldDirty: true });
      setValue(`properties.${index}.rental_growth_rate`, 0, { shouldDirty: true });
      setValue(`properties.${index}.occupancy_rate`, 0.95, { shouldDirty: true });
    }
  };

  return (
    <div className="border-t border-slate-800/60 pt-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={open}
          onChange={(e) => handleToggle(e.target.checked)}
        />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Rental Income
        </span>
        {!open && <span className="text-xs text-slate-600">— not a rental property</span>}
      </label>
      {open && (
        <div className="mt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-400">Monthly rent</label>
              <div className="mt-1">
                <NumberInput control={control} name={`properties.${index}.monthly_rental_income`} min={0} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Annual rent growth</label>
              <div className="mt-1">
                <PercentInput control={control} name={`properties.${index}.rental_growth_rate`} placeholder="e.g. 2" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Occupancy rate</label>
              <div className="mt-1">
                <PercentInput control={control} name={`properties.${index}.occupancy_rate`} placeholder="e.g. 95" />
              </div>
            </div>
          </div>
          {annualRent > 0 && (
            <div className="mt-2 text-xs text-slate-400">
              Estimated annual rent: <span className="text-emerald-300">£{Math.round(annualRent).toLocaleString()}</span>
              {" "}({Math.round(propOccupancy * 100)}% of £{(propRent * 12).toLocaleString()})
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Info tip: a small "?" circle with a tooltip.
 */
export function InfoTip({ text }: { text: string }) {
  return (
    <span
      className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-300"
      title={text}
      aria-label={text}
    >
      ?
    </span>
  );
}
