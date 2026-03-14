import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UseFormRegister } from "react-hook-form";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import type { HistoricalReturnsStats, ReturnModel, ScenarioCreate, ScenarioRead } from "../../types";
import { get_historical_returns, list_tax_years, type TaxYearPreset } from "../../api/client";

function parse_number_input(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return 0;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function format_number_input(value: number): string {
  if (!Number.isFinite(value)) return "";
  // Use the user's locale for thousands separators.
  return value.toLocaleString(undefined, { maximumFractionDigits: 20 });
}

function parse_percent_input(raw: string): number {
  // UI shows 5 for 5%, store 0.05 in the model.
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  return value / 100;
}

function format_percent_input(value: number): string {
  if (!Number.isFinite(value)) return "";
  return (value * 100).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function NumberInput({
  control,
  name,
  step,
  min,
  placeholder
}: {
  control: any;
  name: string;
  step?: number | string;
  min?: number;
  placeholder?: string;
}) {
  return (
    <Controller
      control={control}
      name={name as any}
      render={({ field }) => (
        <input
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          inputMode="decimal"
          placeholder={placeholder}
          value={format_number_input(Number(field.value ?? 0))}
          onChange={(e) => field.onChange(parse_number_input(e.target.value))}
          step={step as any}
          min={min as any}
        />
      )}
    />
  );
}

function AnnualFromMonthlyInput({
  control,
  monthly_name,
  setValue
}: {
  control: any;
  monthly_name: string;
  setValue: (name: any, value: any, options?: any) => void;
}) {
  const monthly = Number(useWatch({ control, name: monthly_name as any }) ?? 0);
  const annual = monthly * 12;

  return (
    <input
      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
      inputMode="decimal"
      value={format_number_input(annual)}
      onChange={(e) => {
        const nextAnnual = parse_number_input(e.target.value);
        setValue(monthly_name as any, nextAnnual / 12, { shouldDirty: true, shouldValidate: true });
      }}
    />
  );
}

function PercentInput({
  control,
  name,
  placeholder
}: {
  control: any;
  name: string;
  placeholder?: string;
}) {
  return (
    <Controller
      control={control}
      name={name as any}
      render={({ field }) => (
        <div className="relative">
          <input
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 pr-8 text-sm"
            inputMode="decimal"
            placeholder={placeholder}
            value={format_percent_input(Number(field.value ?? 0))}
            onChange={(e) => field.onChange(parse_percent_input(e.target.value))}
          />
          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400">
            %
          </div>
        </div>
      )}
    />
  );
}

function InfoTip({ text }: { text: string }) {
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

function TaxYearSelector({
  register,
  watchValue,
  disabled
}: {
  register: ReturnType<typeof useForm<FormValues>>["register"];
  watchValue: string | undefined;
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

  const selected = presets.find((p) => p.tax_year === watchValue);

  return (
    <div className="space-y-2">
      <select
        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        {...register("assumptions.tax_year")}
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
    </div>
  );
}

function ReturnModelSelector({ value, onChange }: { value: ReturnModel; onChange: (model: ReturnModel) => void }) {
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

const schema = z.object({
  name: z.string().min(1).max(200),
  assumptions: z.object({
    inflation_rate: z.coerce.number().min(0).max(1),
    isa_annual_limit: z.coerce.number().min(0),
    state_pension_annual: z.coerce.number().min(0),
    pension_access_age: z.coerce.number().int().min(50).max(75),
    start_year: z.coerce.number().int().min(1900).max(2200),
    end_year: z.coerce.number().int().min(1900).max(2200),
    annual_spend_target: z.coerce.number().min(0),
    debt_interest_rate: z.coerce.number().min(0).max(1),
    bankruptcy_threshold: z.coerce.number().max(0),
    tax_year: z.string().optional(),
    return_model: z.enum(["parametric", "historical_bootstrap"]).default("parametric"),
  }),
  people: z
    .array(
      z.object({
        id: z.string().nullable().optional(),
        label: z.string().min(1).max(100),
        birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        // Adult fields (nullable for children)
        planned_retirement_age: z.coerce.number().int().min(0).max(120).nullable().optional(),
        state_pension_age: z.coerce.number().int().min(0).max(120).nullable().optional(),
        // Child fields
        is_child: z.coerce.boolean().default(false),
        annual_cost: z.coerce.number().min(0).nullable().optional(),
        leaves_household_age: z.coerce.number().int().min(0).max(50).nullable().optional()
      })
    )
    .min(1),
  incomes: z.array(
    z.object({
      person_id: z.string().nullable().optional(),
      kind: z.string().min(1).max(50),
      gross_annual: z.coerce.number().min(0),
      annual_growth_rate: z.coerce.number().min(-1).max(10),
      employee_pension_pct: z.coerce.number().min(0).max(1),
      employer_pension_pct: z.coerce.number().min(0).max(1)
    })
  ),
  assets: z.array(
    z.object({
      person_id: z.string().nullable().optional(),
      name: z.string().min(1).max(200),
      asset_type: z.enum(["CASH", "ISA", "GIA", "PENSION"]).default("GIA"),
      withdrawal_priority: z.coerce.number().int().min(0).max(10000).default(100),
      balance: z.coerce.number().min(0),
      annual_contribution: z.coerce.number(),
      growth_rate_mean: z.coerce.number(),
      growth_rate_std: z.coerce.number().min(0),
      contributions_end_at_retirement: z.coerce.boolean(),
      bond_allocation: z.coerce.number().min(0).max(1).default(0)
    })
  ),
  properties: z.array(
    z.object({
      person_id: z.string().nullable().optional(),
      name: z.string().min(1).max(200),
      value: z.coerce.number().min(0),
      appreciation_rate_mean: z.coerce.number(),
      appreciation_rate_std: z.coerce.number().min(0),
      monthly_rental_income: z.coerce.number().min(0),
      rental_growth_rate: z.coerce.number().min(-1).max(10),
      occupancy_rate: z.coerce.number().min(0).max(1).default(1),
      annual_maintenance_cost: z.coerce.number().min(0),
      maintenance_is_inflation_linked: z.coerce.boolean().default(true),
      withdrawal_priority: z.coerce.number().int().min(0).max(10000).default(15)
    })
  ),
  mortgage: z
    .object({
      balance: z.coerce.number().min(0),
      annual_interest_rate: z.coerce.number().min(0).max(1),
      monthly_payment: z.coerce.number().min(0),
    })
    .nullable()
    .optional(),
  expenses: z.array(
    z.object({
      name: z.string().min(1).max(200),
      monthly_amount: z.coerce.number().min(0),
      is_inflation_linked: z.coerce.boolean()
    })
  )
});

type FormValues = z.infer<typeof schema>;

function to_form_values(scenario: ScenarioRead): FormValues {
  const assumptions = scenario.assumptions as Record<string, unknown>;

  const inflation_rate = (assumptions.inflation_rate ?? 0.02) as number;
  const isa_annual_limit = (assumptions.isa_annual_limit ?? 20000) as number;
  const state_pension_annual = (assumptions.state_pension_annual ?? 11500) as number;
  const pension_access_age = (assumptions.pension_access_age ?? 55) as number;
  const start_year = (assumptions.start_year ?? new Date().getFullYear()) as number;
  const end_year = (assumptions.end_year ?? new Date().getFullYear() + 60) as number;
  const annual_spend_target = (assumptions.annual_spend_target ?? 30000) as number;
  const debt_interest_rate = (assumptions.debt_interest_rate ?? 0.08) as number;
  const bankruptcy_threshold = (assumptions.bankruptcy_threshold ?? -100000) as number;
  const return_model = (assumptions.return_model ?? "historical_bootstrap") as ReturnModel;
  const tax_year = (assumptions.tax_year ?? undefined) as string | undefined;

  return {
    name: scenario.name,
    assumptions: {
      inflation_rate,
      isa_annual_limit,
      state_pension_annual,
      pension_access_age,
      start_year,
      end_year,
      annual_spend_target,
      debt_interest_rate,
      bankruptcy_threshold,
      return_model,
      tax_year,
    },
    people: scenario.people.map((p) => ({
      id: p.id,
      label: p.label,
      birth_date: p.birth_date,
      planned_retirement_age: p.planned_retirement_age ?? null,
      state_pension_age: p.state_pension_age ?? 67,
      is_child: p.is_child === true,  // Ensure proper boolean
      annual_cost: p.annual_cost ?? null,
      leaves_household_age: p.leaves_household_age ?? 18
    })),
    incomes: scenario.incomes.map((i) => ({
      kind: i.kind,
      gross_annual: i.gross_annual,
      annual_growth_rate: i.annual_growth_rate,
      employee_pension_pct: i.employee_pension_pct,
      employer_pension_pct: i.employer_pension_pct,
      person_id: i.person_id ?? ""
    })),
    assets: scenario.assets.map((a) => {
      const existingType = (a as any).asset_type as string | undefined;
      const inferred =
        existingType ??
        (a.name.toLowerCase().includes("cash")
          ? "CASH"
          : a.name.toLowerCase().includes("isa")
            ? "ISA"
            : a.name.toLowerCase().includes("pension")
              ? "PENSION"
              : "GIA");
      return {
        name: a.name,
        asset_type: inferred as any,
        withdrawal_priority: ((a as any).withdrawal_priority ?? 100) as number,
        balance: a.balance,
        annual_contribution: a.annual_contribution,
        growth_rate_mean: a.growth_rate_mean,
        growth_rate_std: a.growth_rate_std,
        contributions_end_at_retirement: a.contributions_end_at_retirement,
        bond_allocation: (a as any).bond_allocation ?? 0,
        person_id: a.person_id ?? ""
      };
    }),
    properties: (scenario.properties ?? []).map((p) => ({
      name: p.name,
      value: p.value,
      appreciation_rate_mean: p.appreciation_rate_mean,
      appreciation_rate_std: p.appreciation_rate_std,
      monthly_rental_income: p.monthly_rental_income,
      rental_growth_rate: p.rental_growth_rate,
      occupancy_rate: p.occupancy_rate,
      annual_maintenance_cost: p.annual_maintenance_cost,
      maintenance_is_inflation_linked: p.maintenance_is_inflation_linked,
      withdrawal_priority: p.withdrawal_priority,
      person_id: p.person_id ?? ""
    })),
    mortgage: scenario.mortgage ?? null,
    expenses: scenario.expenses.map((e) => ({
      name: e.name,
      monthly_amount: e.monthly_amount,
      is_inflation_linked: e.is_inflation_linked
    }))
  };
}

function normalize_person_id(person_id: string | null | undefined): string | null {
  if (!person_id) return null;
  return person_id;
}

function to_scenario_create(values: FormValues, original: ScenarioRead): ScenarioCreate {
  return {
    name: values.name,
    assumptions: values.assumptions,
    people: values.people.map((p) => {
      // Ensure is_child is a proper boolean
      const isChild = p.is_child === true;
      return {
        id: p.id ?? null,
        label: p.label,
        birth_date: p.birth_date,
        // Adults need retirement ages; children get null
        planned_retirement_age: isChild ? null : (Number(p.planned_retirement_age) || 60),
        state_pension_age: isChild ? null : (Number(p.state_pension_age) || 67),
        is_child: isChild,
        annual_cost: isChild ? (Number(p.annual_cost) || 0) : null,
        leaves_household_age: isChild ? (Number(p.leaves_household_age) || 18) : null
      };
    }),
    incomes: values.incomes.map((i) => ({
      kind: i.kind,
      gross_annual: i.gross_annual,
      annual_growth_rate: i.annual_growth_rate,
      employee_pension_pct: i.employee_pension_pct,
      employer_pension_pct: i.employer_pension_pct,
      person_id: normalize_person_id(i.person_id)
    })),
    assets: values.assets.map((a) => ({
      name: a.name,
      asset_type: a.asset_type,
      withdrawal_priority: a.withdrawal_priority,
      balance: a.balance,
      annual_contribution: a.annual_contribution,
      growth_rate_mean: a.growth_rate_mean,
      growth_rate_std: a.growth_rate_std,
      contributions_end_at_retirement: a.contributions_end_at_retirement,
      bond_allocation: a.bond_allocation ?? 0,
      person_id: normalize_person_id(a.person_id)
    })),
    properties: values.properties.map((p) => ({
      name: p.name,
      value: p.value,
      appreciation_rate_mean: p.appreciation_rate_mean,
      appreciation_rate_std: p.appreciation_rate_std,
      monthly_rental_income: p.monthly_rental_income,
      rental_growth_rate: p.rental_growth_rate,
      occupancy_rate: p.occupancy_rate,
      annual_maintenance_cost: p.annual_maintenance_cost,
      maintenance_is_inflation_linked: p.maintenance_is_inflation_linked,
      withdrawal_priority: p.withdrawal_priority,
      person_id: normalize_person_id(p.person_id)
    })),
    mortgage: values.mortgage ?? null,
    expenses: values.expenses.map((e) => ({
      name: e.name,
      monthly_amount: e.monthly_amount,
      is_inflation_linked: e.is_inflation_linked
    }))
  };
}

type Props = {
  scenario: ScenarioRead;
  on_save: (payload: ScenarioCreate) => Promise<void>;
  is_saving: boolean;
  save_error: string | null;
};

export function ScenarioForm({ scenario, on_save, is_saving, save_error }: Props) {
  const default_values = useMemo(() => to_form_values(scenario), [scenario]);
  const [tab, setTab] = useState<"assumptions" | "people" | "income" | "assets" | "properties" | "sell_order" | "housing" | "expenses">(
    "assumptions"
  );

  const form = useForm<FormValues>({
    mode: "onChange",
    resolver: zodResolver(schema),
    defaultValues: default_values
  });

  const people = useFieldArray({ control: form.control, name: "people" });
  const incomes = useFieldArray({ control: form.control, name: "incomes" });
  const expenses = useFieldArray({ control: form.control, name: "expenses" });
  const assets = useFieldArray({ control: form.control, name: "assets" });
  const properties = useFieldArray({ control: form.control, name: "properties" });

  // Watch values for computing totals
  const watched_incomes = useWatch({ control: form.control, name: "incomes" });
  const watched_assets = useWatch({ control: form.control, name: "assets" });
  const watched_properties = useWatch({ control: form.control, name: "properties" });
  const watched_expenses = useWatch({ control: form.control, name: "expenses" });

  const income_total = useMemo(() => {
    if (!watched_incomes) return 0;
    return watched_incomes.reduce((sum, inc) => sum + (Number(inc?.gross_annual) || 0), 0);
  }, [watched_incomes]);

  const assets_total = useMemo(() => {
    if (!watched_assets) return 0;
    return watched_assets.reduce((sum, asset) => sum + (Number(asset?.balance) || 0), 0);
  }, [watched_assets]);

  const properties_total = useMemo(() => {
    if (!watched_properties) return 0;
    return watched_properties.reduce((sum, property) => sum + (Number(property?.value) || 0), 0);
  }, [watched_properties]);

  const expenses_total = useMemo(() => {
    if (!watched_expenses) return 0;
    return watched_expenses.reduce((sum, exp) => sum + (Number(exp?.monthly_amount) || 0) * 12, 0);
  }, [watched_expenses]);

  const person_label_by_id = useMemo(
    () => new Map((scenario.people ?? []).map((person) => [person.id ?? "", person.label])),
    [scenario.people]
  );

  const sell_order_items = useMemo(() => {
    const asset_items = (watched_assets ?? []).map((asset, index) => ({
      id: `asset-${index}`,
      category: "Asset",
      kind: asset?.asset_type ?? "GIA",
      name: asset?.name || `Asset ${index + 1}`,
      owner: person_label_by_id.get(asset?.person_id ?? "") ?? "Household",
      priority: Number(asset?.withdrawal_priority ?? 0),
      value: Number(asset?.balance ?? 0),
      note: asset?.asset_type === "PENSION" ? "Only accessible from pension access age." : "",
    }));

    const property_items = (watched_properties ?? []).map((property, index) => ({
      id: `property-${index}`,
      category: "Property",
      kind: "PROPERTY",
      name: property?.name || `Property ${index + 1}`,
      owner: person_label_by_id.get(property?.person_id ?? "") ?? "Household",
      priority: Number(property?.withdrawal_priority ?? 0),
      value: Number(property?.value ?? 0),
      note: "Sale may trigger capital gains tax on gains.",
    }));

    return [...asset_items, ...property_items].sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      return left.name.localeCompare(right.name);
    });
  }, [person_label_by_id, watched_assets, watched_properties]);

  const prev_scenario_id = useRef<string | null>(null);
  useEffect(() => {
    if (prev_scenario_id.current !== scenario.id) {
      prev_scenario_id.current = scenario.id;
      form.reset(default_values);
    }
  }, [scenario.id, default_values, form]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          ["assumptions", "Assumptions"],
          ["people", "People"],
          ["income", "Income"],
          ["expenses", "Expenses"],
          ["assets", "Assets"],
          ["properties", "Properties"],
          ["housing", "Housing"],
          ["sell_order", "Sell Order"]
        ].map(([key, label]) => (
          <button
            key={key}
            className={`rounded px-3 py-2 text-sm ${
              key === "sell_order"
                ? tab === key
                  ? "bg-amber-700 text-amber-50"
                  : "bg-amber-950/60 text-amber-200 hover:bg-amber-900/70"
                : tab === key
                  ? "bg-slate-800"
                  : "bg-slate-900/50 hover:bg-slate-900"
            }`}
            onClick={() => setTab(key as typeof tab)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {save_error && <div className="rounded border border-rose-800 bg-rose-950 px-4 py-3 text-sm">{save_error}</div>}

      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          await on_save(to_scenario_create(values, scenario));
        })}
      >
        <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
          <label className="block text-sm font-medium">Scenario name</label>
          <input
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            {...form.register("name")}
          />
          {form.formState.errors.name && (
            <div className="mt-1 text-xs text-rose-200">{form.formState.errors.name.message}</div>
          )}
        </div>

        {tab === "assumptions" && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Tax Year Selector */}
            <div className="rounded border border-slate-800 bg-slate-900/30 p-4 md:col-span-2">
              <label className="block text-sm font-medium">Tax Year</label>
              <p className="text-xs text-slate-400 mt-1">Select a UK tax year to use for income tax and NI calculations. Bands are applied throughout the simulation.</p>
              <div className="mt-2">
                <TaxYearSelector
                  register={form.register}
                  watchValue={form.watch("assumptions.tax_year") ?? undefined}
                />
              </div>
            </div>

            {/* Return Model Selector */}
            <ReturnModelSelector
              value={form.watch("assumptions.return_model") ?? "parametric"}
              onChange={(model) => form.setValue("assumptions.return_model", model, { shouldDirty: true })}
            />

            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <label className="block text-sm font-medium">Inflation rate</label>
              <div className="mt-1">
                <PercentInput control={form.control} name="assumptions.inflation_rate" placeholder="e.g. 2" />
              </div>
              {form.formState.errors.assumptions?.inflation_rate && (
                <div className="mt-1 text-xs text-rose-400">{form.formState.errors.assumptions.inflation_rate.message || "Must be 0-100%"}</div>
              )}
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <label className="block text-sm font-medium">ISA annual limit</label>
              <div className="mt-1">
                <NumberInput control={form.control} name="assumptions.isa_annual_limit" placeholder="e.g. 20,000" />
              </div>
              {form.formState.errors.assumptions?.isa_annual_limit && (
                <div className="mt-1 text-xs text-rose-400">{form.formState.errors.assumptions.isa_annual_limit.message || "Must be 0 or higher"}</div>
              )}
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <label className="block text-sm font-medium">State pension annual</label>
              <div className="mt-1">
                <NumberInput control={form.control} name="assumptions.state_pension_annual" placeholder="e.g. 11,500" />
              </div>
              {form.formState.errors.assumptions?.state_pension_annual && (
                <div className="mt-1 text-xs text-rose-400">{form.formState.errors.assumptions.state_pension_annual.message || "Must be 0 or higher"}</div>
              )}
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <label className="block text-sm font-medium">Pension access age</label>
              <div className="mt-1">
                <NumberInput control={form.control} name="assumptions.pension_access_age" placeholder="e.g. 55" />
              </div>
              <div className="mt-1 text-xs text-slate-400">Minimum age to withdraw from private pensions. UK is currently 55 (rising to 57 in 2028).</div>
              {form.formState.errors.assumptions?.pension_access_age && (
                <div className="mt-1 text-xs text-rose-400">{form.formState.errors.assumptions.pension_access_age.message || "Must be between 50 and 75"}</div>
              )}
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <label className="block text-sm font-medium">Start year</label>
              <div className="mt-1">
                <NumberInput control={form.control} name="assumptions.start_year" placeholder="e.g. 2026" />
              </div>
              {form.formState.errors.assumptions?.start_year && (
                <div className="mt-1 text-xs text-rose-400">{form.formState.errors.assumptions.start_year.message || "Enter a valid year (1900-2200)"}</div>
              )}
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <label className="block text-sm font-medium">End year</label>
              <div className="mt-1">
                <NumberInput control={form.control} name="assumptions.end_year" placeholder="e.g. 2086" />
              </div>
              {form.formState.errors.assumptions?.end_year && (
                <div className="mt-1 text-xs text-rose-400">{form.formState.errors.assumptions.end_year.message || "Enter a valid year (1900-2200)"}</div>
              )}
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <label className="block text-sm font-medium">Extra retirement spending</label>
              <p className="text-xs text-slate-400 mt-1">Additional discretionary spending once everyone is retired (on top of configured expenses)</p>
              <div className="mt-2">
                <NumberInput control={form.control} name="assumptions.annual_spend_target" placeholder="e.g. 30,000" />
              </div>
              {form.formState.errors.assumptions?.annual_spend_target && (
                <div className="mt-1 text-xs text-rose-400">{form.formState.errors.assumptions.annual_spend_target.message || "Must be 0 or higher"}</div>
              )}
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <label className="block text-sm font-medium">Debt interest rate</label>
              <p className="text-xs text-slate-400 mt-1">Annual interest rate applied when borrowing (negative cash balance)</p>
              <div className="mt-2">
                <PercentInput control={form.control} name="assumptions.debt_interest_rate" placeholder="e.g. 8" />
              </div>
              {form.formState.errors.assumptions?.debt_interest_rate && (
                <div className="mt-1 text-xs text-rose-400">{form.formState.errors.assumptions.debt_interest_rate.message || "Must be 0-100%"}</div>
              )}
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <label className="block text-sm font-medium">Bankruptcy threshold</label>
              <p className="text-xs text-slate-400 mt-1">Net worth below which simulation terminates (negative value, e.g. -100,000)</p>
              <div className="mt-2">
                <NumberInput control={form.control} name="assumptions.bankruptcy_threshold" placeholder="e.g. -100,000" />
              </div>
              {form.formState.errors.assumptions?.bankruptcy_threshold && (
                <div className="mt-1 text-xs text-rose-400">{form.formState.errors.assumptions.bankruptcy_threshold.message || "Must be 0 or negative"}</div>
              )}
            </div>
          </div>
        )}

        {tab === "people" && (
          <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
            <div className="text-sm font-semibold">People &amp; Children</div>
            <div className="mt-2 text-xs text-slate-400">
              Adults have income and retirement planning. Children have annual costs until they leave the household.
            </div>
            {people.fields.map((person, idx) => {
              const isChild = form.watch(`people.${idx}.is_child`) === true;
              return (
                <div key={person.id} className="mt-4 rounded border border-slate-800 bg-slate-950/30 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">
                        {isChild ? "Child" : "Adult"} {idx + 1}
                      </span>
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          {...form.register(`people.${idx}.is_child`)}
                        />
                        Is a child
                      </label>
                    </div>
                    {people.fields.length > 1 && (
                      <button
                        type="button"
                        className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                        onClick={() => people.remove(idx)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <input type="hidden" {...form.register(`people.${idx}.id`)} />
                    <div>
                      <label className="block text-sm font-medium">Name</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        {...form.register(`people.${idx}.label`)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">DoB</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        placeholder="YYYY-MM-DD"
                        {...form.register(`people.${idx}.birth_date`)}
                      />
                    </div>
                    {!isChild && (
                      <>
                        <div>
                          <label className="block text-sm font-medium">Planned retirement age</label>
                          <input
                            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                            {...form.register(`people.${idx}.planned_retirement_age`)}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium">State pension age</label>
                          <input
                            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                            {...form.register(`people.${idx}.state_pension_age`)}
                          />
                        </div>
                      </>
                    )}
                    {isChild && (
                      <>
                        <div>
                          <label className="block text-sm font-medium">Annual cost (£)</label>
                          <div className="mt-1">
                            <NumberInput control={form.control} name={`people.${idx}.annual_cost`} min={0} placeholder="e.g. 10,000" />
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            Estimated annual cost of raising this child (grows with inflation)
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium">Leaves household at age</label>
                          <input
                            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                            {...form.register(`people.${idx}.leaves_household_age`)}
                          />
                          <div className="mt-1 text-xs text-slate-400">
                            Costs stop when child reaches this age
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                onClick={() =>
                  people.append({
                    id: null,
                    label: `person${people.fields.length + 1}`,
                    birth_date: "1985-01-01",
                    planned_retirement_age: 60,
                    state_pension_age: 67,
                    is_child: false,
                    annual_cost: null,
                    leaves_household_age: 18
                  })
                }
              >
                Add adult
              </button>
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                onClick={() =>
                  people.append({
                    id: null,
                    label: `child${people.fields.filter((_, i) => form.watch(`people.${i}.is_child`)).length + 1}`,
                    birth_date: new Date().toISOString().split("T")[0],
                    planned_retirement_age: null,
                    state_pension_age: null,
                    is_child: true,
                    annual_cost: 10000,
                    leaves_household_age: 18
                  })
                }
              >
                Add child
              </button>
            </div>
          </div>
        )}

        {tab === "income" && (
          <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Income</div>
              <div className="text-sm text-slate-300">
                Annual total: <span className="font-semibold text-emerald-400">£{income_total.toLocaleString()}</span>
              </div>
            </div>

            {/* Helper text explaining income types */}
            <div className="mt-3 rounded border border-sky-800/50 bg-sky-950/30 p-3 text-sm text-sky-200/90">
              <div className="font-medium text-sky-100">Income Types</div>
              <ul className="mt-2 ml-4 list-disc space-y-1 text-xs">
                <li><strong>Salary:</strong> Employment income subject to Income Tax and National Insurance. Ends at retirement age. Pension contributions can be deducted.</li>
                <li><strong>Rental:</strong> Property rental income subject to Income Tax only (no NI). Can continue into retirement. Pension contributions do not apply.</li>
                <li><strong>Gift:</strong> Tax-free income (e.g., from family, inheritance). No taxes apply. Can be one-off or recurring.</li>
              </ul>
            </div>

            <div className="mt-3 overflow-auto">
              <div className="hidden min-w-[980px] grid-cols-7 gap-3 text-xs text-slate-400 md:grid">
                <div>Assigned_to</div>
                <div className="flex items-center">
                  Type
                  <InfoTip text="Salary: taxed with NI, ends at retirement. Rental: income tax only, no retirement end. Gift: tax-free." />
                </div>
                <div>Gross_annual</div>
                <div>Growth_rate</div>
                <div className="flex items-center">
                  Employee_pension_%
                  <InfoTip text="Only applies to salary income. Leave at 0 for rental/gift." />
                </div>
                <div className="flex items-center">
                  Employer_pension_%
                  <InfoTip text="Only applies to salary income. Leave at 0 for rental/gift." />
                </div>
                <div></div>
              </div>
              <div className="min-w-[980px] space-y-2">
                {incomes.fields.map((income, idx) => {
                  const incomeKind = form.watch(`incomes.${idx}.kind`);
                  const isSalary = incomeKind === "salary";
                  return (
                    <div key={income.id} className="grid grid-cols-1 gap-3 rounded border border-slate-800 bg-slate-950/30 p-3 md:grid-cols-7">
                      <select
                        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        {...form.register(`incomes.${idx}.person_id` as any)}
                      >
                        <option value="">Household</option>
                        {scenario.people.map((p) => (
                          <option key={p.id} value={p.id ?? ""}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        {...form.register(`incomes.${idx}.kind` as any)}
                      >
                        <option value="salary">Salary</option>
                        <option value="rental">Rental</option>
                        <option value="gift">Gift</option>
                      </select>
                      <NumberInput control={form.control} name={`incomes.${idx}.gross_annual`} min={0} />
                      <PercentInput control={form.control} name={`incomes.${idx}.annual_growth_rate`} placeholder="%" />
                      <div className={isSalary ? "" : "opacity-40"}>
                        <PercentInput control={form.control} name={`incomes.${idx}.employee_pension_pct`} placeholder="%" />
                      </div>
                      <div className={isSalary ? "" : "opacity-40"}>
                        <PercentInput control={form.control} name={`incomes.${idx}.employer_pension_pct`} placeholder="%" />
                      </div>
                      <div className="flex items-center justify-end">
                        {incomes.fields.length > 1 && (
                          <button
                            type="button"
                            className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                            onClick={() => incomes.remove(idx)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              className="mt-4 rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
              onClick={() =>
                incomes.append({
                  person_id: "",
                  kind: "salary",
                  gross_annual: 0,
                  annual_growth_rate: 0.0,
                  employee_pension_pct: 0.0,
                  employer_pension_pct: 0.0
                } as any)
              }
            >
              Add income
            </button>
          </div>
        )}

        {tab === "assets" && (
          <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Assets</div>
              <div className="text-sm text-slate-300">
                Total balance: <span className="font-semibold text-sky-400">£{assets_total.toLocaleString()}</span>
              </div>
            </div>

            {/* Helper text explaining withdrawal priority */}
            <div className="mt-3 rounded border border-amber-800/50 bg-amber-950/30 p-3 text-sm text-amber-200/90">
              <div className="font-medium text-amber-100">Withdrawal Priority</div>
              <p className="mt-1 text-xs leading-relaxed">
                <strong>Higher number = withdraw first.</strong> When you need money, the simulation draws from assets 
                in priority order. Typical best order for tax efficiency:
              </p>
              <ul className="mt-2 ml-4 list-disc space-y-1 text-xs">
                <li><strong>ISA (30):</strong> Withdraw first — completely tax-free growth and withdrawals.</li>
                <li><strong>GIA (20):</strong> Withdraw second — gains may be subject to Capital Gains Tax.</li>
                <li><strong>Pension (10):</strong> Withdraw last — see note below about access restrictions.</li>
              </ul>
            </div>

            {/* Special note about pensions */}
            <div className="mt-3 rounded border border-indigo-800/50 bg-indigo-950/30 p-3 text-sm text-indigo-200/90">
              <div className="font-medium text-indigo-100">About Pensions</div>
              <p className="mt-1 text-xs leading-relaxed">
                Pensions work differently from other assets:
              </p>
              <ul className="mt-2 ml-4 list-disc space-y-1 text-xs">
                <li><strong>Age restriction:</strong> You cannot access your pension until age 55 (57 from 2028). 
                    Even with a high priority, the simulation won't withdraw from pensions before this age.</li>
                <li><strong>Taxed as income:</strong> Pension withdrawals are treated as taxable income, reducing 
                    the net amount you receive. 25% can usually be taken tax-free (not yet modelled here).</li>
                <li><strong>Priority still matters:</strong> Once accessible, pension priority determines whether 
                    it's used before or after ISAs/GIAs.</li>
              </ul>
              <p className="mt-2 text-xs italic opacity-80">
                Contributions come from salary pension percentages set in the Income tab.
              </p>
            </div>

            <div className="mt-3 overflow-auto">
              <div className="hidden min-w-[1420px] grid-cols-11 gap-3 text-xs text-slate-400 md:grid">
                <div>Assigned_to</div>
                <div>Name</div>
                <div>Type</div>
                <div className="flex items-center">
                  Priority
                  <InfoTip text="Higher number = withdraw first. Suggested: ISA 30, GIA 20, Pension 10." />
                </div>
                <div>Start_balance</div>
                <div>Annual_invest_cap</div>
                <div>Growth_mean</div>
                <div>Growth_std</div>
                <div className="flex items-center">
                  Bond_%
                  <InfoTip text="Fraction allocated to bonds (0% = 100% S&P 500, 100% = 100% US 10Y Treasury). Only used with historical bootstrap." />
                </div>
                <div className="flex items-center">
                  End_at_retire
                  <InfoTip text="If enabled, this asset stops receiving new investments once everyone is retired. Existing balance still grows and can still be withdrawn." />
                </div>
                <div></div>
              </div>
              <div className="min-w-[1420px] space-y-2">
                {assets.fields.map((asset, idx) => (
                  <div key={asset.id} className="grid grid-cols-1 gap-3 rounded border border-slate-800 bg-slate-950/30 p-3 md:grid-cols-11">
                    <select
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      {...form.register(`assets.${idx}.person_id`)}
                    >
                      <option value="">Household</option>
                      {scenario.people.map((p) => (
                        <option key={p.id} value={p.id ?? ""}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      {...form.register(`assets.${idx}.name`)}
                    />
                    <select
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      {...form.register(`assets.${idx}.asset_type` as any)}
                    >
                      <option value="CASH">Cash</option>
                      <option value="ISA">ISA</option>
                      <option value="GIA">GIA</option>
                      <option value="PENSION">Pension</option>
                    </select>
                    <NumberInput control={form.control} name={`assets.${idx}.withdrawal_priority`} min={0} />
                    <NumberInput control={form.control} name={`assets.${idx}.balance`} min={0} />
                    <div>
                      <NumberInput control={form.control} name={`assets.${idx}.annual_contribution`} min={0} />
                      <div className="mt-1 text-xs text-slate-400">0 = no cap</div>
                    </div>
                    {(() => {
                      const is_bootstrap = form.watch("assumptions.return_model") === "historical_bootstrap";
                      const asset_type = form.watch(`assets.${idx}.asset_type` as any);
                      const is_equity = asset_type !== "CASH";
                      const is_disabled = is_bootstrap && is_equity;
                      return (
                        <>
                          <div className={is_disabled ? "opacity-40 pointer-events-none" : ""} title={is_disabled ? "Using S&P 500 historical returns (set in Assumptions tab)" : undefined}>
                            <PercentInput control={form.control} name={`assets.${idx}.growth_rate_mean`} placeholder="%" />
                            {is_disabled && <div className="mt-1 text-xs text-indigo-300">S&amp;P 500</div>}
                          </div>
                          <div className={is_disabled ? "opacity-40 pointer-events-none" : ""} title={is_disabled ? "Using S&P 500 historical returns (set in Assumptions tab)" : undefined}>
                            <PercentInput control={form.control} name={`assets.${idx}.growth_rate_std`} placeholder="%" />
                            {is_disabled && <div className="mt-1 text-xs text-indigo-300">bootstrap</div>}
                          </div>
                          <div className={is_bootstrap && is_equity ? "" : "opacity-40 pointer-events-none"} title={is_bootstrap && is_equity ? "Fraction allocated to bonds" : "Only used with historical bootstrap for non-cash assets"}>
                            <PercentInput control={form.control} name={`assets.${idx}.bond_allocation`} placeholder="0%" />
                            {is_bootstrap && is_equity && <div className="mt-1 text-xs text-indigo-300">bonds</div>}
                          </div>
                        </>
                      );
                    })()}
                    <div className="flex items-center">
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          {...form.register(`assets.${idx}.contributions_end_at_retirement`)}
                        />
                        <span
                          className="md:hidden"
                          title="If enabled, this asset stops receiving new investments once everyone is retired. Existing balance still grows and can still be withdrawn."
                        >
                          End at retire
                        </span>
                      </label>
                    </div>
                    <div className="flex items-center justify-end">
                      {assets.fields.length > 1 && (
                        <button
                          type="button"
                          className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                          onClick={() => assets.remove(idx)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="mt-4 rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
              onClick={() =>
                assets.append({
                  name: "New asset",
                  asset_type: "GIA",
                  withdrawal_priority: 20,
                  balance: 0,
                  annual_contribution: 0,
                  growth_rate_mean: 0.05,
                  growth_rate_std: 0.1,
                  contributions_end_at_retirement: false,
                  bond_allocation: 0,
                  person_id: ""
                } as any)
              }
            >
              Add asset
            </button>
          </div>
        )}

        {tab === "properties" && (
          <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Buy-to-Let Properties</div>
              <div className="text-sm text-slate-300">
                Total value: <span className="font-semibold text-emerald-400">£{properties_total.toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-3 rounded border border-emerald-800/50 bg-emerald-950/30 p-3 text-sm text-emerald-100/90">
              <div className="font-medium text-emerald-100">How Properties Work</div>
              <ul className="mt-2 ml-4 list-disc space-y-1 text-xs">
                <li><strong>Rental income:</strong> Rent is `monthly rent x 12 x occupancy %` and is taxed like other rental income.</li>
                <li><strong>Maintenance:</strong> Annual maintenance is deducted from cash and can optionally grow with inflation.</li>
                <li><strong>Sellable:</strong> Properties can be sold to cover shortfalls using withdrawal priority. Capital gains tax is applied on gains.</li>
                <li><strong>Appreciation:</strong> Property values change over time using the appreciation mean and volatility you enter here.</li>
              </ul>
            </div>

            <div className="mt-3 overflow-auto">
              <div className="hidden min-w-[1420px] grid-cols-10 gap-3 text-xs text-slate-400 md:grid">
                <div>Assigned_to</div>
                <div>Name</div>
                <div className="flex items-center">
                  Priority
                  <InfoTip text="Higher number = sell first when cash is short. Example: set 30 for a property you would liquidate before other holdings, and 10 for one you want to keep longer." />
                </div>
                <div>Current_value</div>
                <div>Appreciation_mean</div>
                <div>Appreciation_std</div>
                <div>Monthly_rent</div>
                <div>Rent_growth</div>
                <div>Occupancy_%</div>
                <div>Maintenance</div>
              </div>
              <div className="min-w-[1420px] space-y-2">
                {properties.fields.map((property, idx) => (
                  <div
                    key={property.id}
                    className="grid grid-cols-1 gap-3 rounded border border-slate-800 bg-slate-950/30 p-3 md:grid-cols-10"
                  >
                    <select
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      {...form.register(`properties.${idx}.person_id` as any)}
                    >
                      <option value="">Household</option>
                      {scenario.people.map((p) => (
                        <option key={p.id} value={p.id ?? ""}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      {...form.register(`properties.${idx}.name`)}
                    />
                    <NumberInput control={form.control} name={`properties.${idx}.withdrawal_priority`} min={0} />
                    <NumberInput control={form.control} name={`properties.${idx}.value`} min={0} />
                    <PercentInput control={form.control} name={`properties.${idx}.appreciation_rate_mean`} placeholder="%" />
                    <PercentInput control={form.control} name={`properties.${idx}.appreciation_rate_std`} placeholder="%" />
                    <NumberInput control={form.control} name={`properties.${idx}.monthly_rental_income`} min={0} />
                    <PercentInput control={form.control} name={`properties.${idx}.rental_growth_rate`} placeholder="%" />
                    <PercentInput control={form.control} name={`properties.${idx}.occupancy_rate`} placeholder="100" />
                    <div>
                      <NumberInput control={form.control} name={`properties.${idx}.annual_maintenance_cost`} min={0} />
                      <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          {...form.register(`properties.${idx}.maintenance_is_inflation_linked`)}
                        />
                        Inflation linked
                      </label>
                    </div>
                    <div className="md:col-span-10 flex items-center justify-end">
                      <button
                        type="button"
                        className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                        onClick={() => properties.remove(idx)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="mt-4 rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
              onClick={() =>
                properties.append({
                  person_id: "",
                  name: "New property",
                  value: 0,
                  appreciation_rate_mean: 0.03,
                  appreciation_rate_std: 0.08,
                  monthly_rental_income: 0,
                  rental_growth_rate: 0.02,
                  occupancy_rate: 0.95,
                  annual_maintenance_cost: 0,
                  maintenance_is_inflation_linked: true,
                  withdrawal_priority: 15
                } as any)
              }
            >
              Add property
            </button>
          </div>
        )}

        {tab === "sell_order" && (
          <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
            <div className="text-sm font-semibold">Sell Order Summary</div>
            <div className="mt-2 text-xs text-slate-400">
              Higher priority numbers are sold first. This combines financial assets and buy-to-let properties into one live withdrawal order.
            </div>

            <div className="mt-3 rounded border border-amber-800/50 bg-amber-950/30 p-3 text-sm text-amber-200/90">
              <div className="font-medium text-amber-100">First To Sell to Last To Sell</div>
              <div className="mt-1 text-xs">
                Use this tab as a quick check that your configured priorities match the order you want the simulation to use.
              </div>
            </div>

            {sell_order_items.length === 0 ? (
              <div className="mt-4 rounded border border-slate-800 bg-slate-950/30 p-4 text-sm text-slate-400">
                No assets or properties configured yet.
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {sell_order_items.map((item, index) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-1 gap-3 rounded border border-slate-800 bg-slate-950/30 p-3 md:grid-cols-[80px_120px_minmax(0,1fr)_140px_120px_140px]"
                  >
                    <div>
                      <div className="text-xs text-slate-400">Order</div>
                      <div className="text-sm font-semibold text-slate-100">{index + 1}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Category</div>
                      <div className="text-sm text-slate-200">{item.category}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Name</div>
                      <div className="text-sm font-medium text-slate-100">{item.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.kind}</div>
                      {item.note && <div className="mt-1 text-xs text-slate-500">{item.note}</div>}
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Owner</div>
                      <div className="text-sm text-slate-200">{item.owner}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Priority</div>
                      <div className="text-sm font-semibold text-amber-300">{item.priority}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Current value</div>
                      <div className="text-sm text-slate-200">£{item.value.toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "housing" && (
          <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
            <div className="text-sm font-semibold">Mortgage</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium">Balance</label>
                <NumberInput control={form.control} name="mortgage.balance" min={0} />
              </div>
              <div>
                <label className="block text-sm font-medium">Annual interest rate</label>
                <PercentInput control={form.control} name="mortgage.annual_interest_rate" placeholder="e.g. 4" />
              </div>
              <div>
                <label className="block text-sm font-medium">Monthly payment</label>
                <NumberInput control={form.control} name="mortgage.monthly_payment" min={0} />
              </div>
            </div>
          </div>
        )}

        {tab === "expenses" && (
          <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Expenses</div>
              <div className="text-sm text-slate-300">
                Annual total: <span className="font-semibold text-rose-400">£{expenses_total.toLocaleString()}</span>
              </div>
            </div>
            <div className="mt-3 overflow-auto">
              <div className="hidden min-w-[980px] grid-cols-5 gap-3 text-xs text-slate-400 md:grid">
                <div>Name</div>
                <div>Monthly_amount</div>
                <div>Annual_amount</div>
                <div>Inflation_linked</div>
                <div></div>
              </div>
              <div className="min-w-[980px] space-y-2">
                {expenses.fields.map((expense, idx) => (
                  <div
                    key={expense.id}
                    className="grid grid-cols-1 gap-3 rounded border border-slate-800 bg-slate-950/30 p-3 md:grid-cols-5"
                  >
                    <input
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      {...form.register(`expenses.${idx}.name`)}
                    />
                    <NumberInput control={form.control} name={`expenses.${idx}.monthly_amount`} min={0} />
                    <AnnualFromMonthlyInput
                      control={form.control}
                      monthly_name={`expenses.${idx}.monthly_amount`}
                      setValue={form.setValue}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        {...form.register(`expenses.${idx}.is_inflation_linked`)}
                      />
                      Inflation linked
                    </label>
                    <div className="flex items-center justify-end">
                      {expenses.fields.length > 1 && (
                        <button
                          type="button"
                          className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                          onClick={() => expenses.remove(idx)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="mt-4 rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
              onClick={() =>
                expenses.append({
                  name: "New expense",
                  monthly_amount: 0,
                  is_inflation_linked: true
                } as any)
              }
            >
              Add expense
            </button>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <div className="text-xs text-slate-400">
            {form.formState.isValid ? "Valid" : "Fix validation errors before saving"}
          </div>
          <button
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
            disabled={!form.formState.isValid || is_saving}
            type="submit"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

