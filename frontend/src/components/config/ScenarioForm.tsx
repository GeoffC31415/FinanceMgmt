import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import type { ScenarioCreate, ScenarioRead } from "../../types";

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
  const monthly = useWatch({ control, name: monthly_name as any }) as number | undefined;
  const annual = Number(monthly ?? 0) * 12;

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

const schema = z.object({
  name: z.string().min(1).max(200),
  assumptions: z.object({
    inflation_rate: z.coerce.number().min(0).max(1),
    equity_return_mean: z.coerce.number().min(-1).max(2),
    equity_return_std: z.coerce.number().min(0).max(2),
    isa_annual_limit: z.coerce.number().min(0),
    state_pension_annual: z.coerce.number().min(0),
    start_year: z.coerce.number().int().min(1900).max(2200),
    end_year: z.coerce.number().int().min(1900).max(2200),
    annual_spend_target: z.coerce.number().min(0)
  }),
  people: z
    .array(
      z.object({
        id: z.string().nullable().optional(),
        label: z.string().min(1).max(100),
        birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        planned_retirement_age: z.coerce.number().int().min(0).max(120),
        state_pension_age: z.coerce.number().int().min(0).max(120)
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
      contributions_end_at_retirement: z.coerce.boolean()
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
  const equity_return_mean = (assumptions.equity_return_mean ?? 0.05) as number;
  const equity_return_std = (assumptions.equity_return_std ?? 0.1) as number;
  const isa_annual_limit = (assumptions.isa_annual_limit ?? 20000) as number;
  const state_pension_annual = (assumptions.state_pension_annual ?? 11500) as number;
  const start_year = (assumptions.start_year ?? new Date().getFullYear()) as number;
  const end_year = (assumptions.end_year ?? new Date().getFullYear() + 60) as number;
  const annual_spend_target = (assumptions.annual_spend_target ?? 30000) as number;

  return {
    name: scenario.name,
    assumptions: {
      inflation_rate,
      equity_return_mean,
      equity_return_std,
      isa_annual_limit,
      state_pension_annual,
      start_year,
      end_year,
      annual_spend_target
    },
    people: scenario.people.map((p) => ({
      id: p.id,
      label: p.label,
      birth_date: p.birth_date,
      planned_retirement_age: p.planned_retirement_age,
      state_pension_age: p.state_pension_age
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
        person_id: a.person_id ?? ""
      };
    }),
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
    people: values.people.map((p) => ({
      id: p.id ?? null,
      label: p.label,
      birth_date: p.birth_date,
      planned_retirement_age: p.planned_retirement_age,
      state_pension_age: p.state_pension_age
    })),
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
      person_id: normalize_person_id(a.person_id)
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
  const [tab, setTab] = useState<"assumptions" | "people" | "income" | "assets" | "housing" | "expenses">(
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

  useEffect(() => {
    form.reset(default_values);
  }, [default_values, form]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          ["assumptions", "Assumptions"],
          ["people", "People"],
          ["income", "Income"],
          ["assets", "Assets"],
          ["housing", "Housing"],
          ["expenses", "Expenses"]
        ].map(([key, label]) => (
          <button
            key={key}
            className={`rounded px-3 py-2 text-sm ${
              tab === key ? "bg-slate-800" : "bg-slate-900/50 hover:bg-slate-900"
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
              <label className="block text-sm font-medium">Equity return mean</label>
              <div className="mt-1">
                <PercentInput control={form.control} name="assumptions.equity_return_mean" placeholder="e.g. 5" />
              </div>
              {form.formState.errors.assumptions?.equity_return_mean && (
                <div className="mt-1 text-xs text-rose-400">{form.formState.errors.assumptions.equity_return_mean.message || "Invalid value"}</div>
              )}
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <label className="block text-sm font-medium">Equity return std dev</label>
              <div className="mt-1">
                <PercentInput control={form.control} name="assumptions.equity_return_std" placeholder="e.g. 10" />
              </div>
              {form.formState.errors.assumptions?.equity_return_std && (
                <div className="mt-1 text-xs text-rose-400">{form.formState.errors.assumptions.equity_return_std.message || "Must be 0 or higher"}</div>
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
              <label className="block text-sm font-medium">Annual spend target</label>
              <div className="mt-1">
                <NumberInput control={form.control} name="assumptions.annual_spend_target" placeholder="e.g. 30,000" />
              </div>
              {form.formState.errors.assumptions?.annual_spend_target && (
                <div className="mt-1 text-xs text-rose-400">{form.formState.errors.assumptions.annual_spend_target.message || "Must be 0 or higher"}</div>
              )}
            </div>
          </div>
        )}

        {tab === "people" && (
          <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
            <div className="text-sm font-semibold">People (first entry)</div>
            {people.fields.map((person, idx) => (
              <div key={person.id} className="mt-4 rounded border border-slate-800 bg-slate-950/30 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold">Person {idx + 1}</div>
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
                </div>
              </div>
            ))}
            <button
              type="button"
              className="mt-4 rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
              onClick={() =>
                people.append({
                  id: null,
                  label: `person${people.fields.length + 1}`,
                  birth_date: "1985-01-01",
                  planned_retirement_age: 60,
                  state_pension_age: 67
                })
              }
            >
              Add person
            </button>
          </div>
        )}

        {tab === "income" && (
          <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
            <div className="text-sm font-semibold">Income</div>

            {/* Helper text explaining income types */}
            <div className="mt-3 rounded border border-sky-800/50 bg-sky-950/30 p-3 text-sm text-sky-200/90">
              <div className="font-medium text-sky-100">Income Configuration</div>
              <p className="mt-1 text-xs leading-relaxed">
                Currently only <strong>salary</strong> income is supported. The "Type" field must be set to "salary" 
                for income to appear in the simulation. Salary income stops at the person's planned retirement age.
              </p>
            </div>

            <div className="mt-3 overflow-auto">
              <div className="hidden min-w-[980px] grid-cols-7 gap-3 text-xs text-slate-400 md:grid">
                <div>Assigned_to</div>
                <div className="flex items-center">
                  Type
                  <InfoTip text="Must be 'salary' for income to be processed. Other income types coming soon." />
                </div>
                <div>Gross_annual</div>
                <div>Growth_rate</div>
                <div>Employee_pension_%</div>
                <div>Employer_pension_%</div>
                <div></div>
              </div>
              <div className="min-w-[980px] space-y-2">
                {incomes.fields.map((income, idx) => (
                  <div key={income.id} className="grid grid-cols-1 gap-3 rounded border border-slate-800 bg-slate-950/30 p-3 md:grid-cols-7">
                    <select
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      {...form.register(`incomes.${idx}.person_id` as any)}
                    >
                      <option value="">Household</option>
                      {scenario.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      {...form.register(`incomes.${idx}.kind` as any)}
                    >
                      <option value="salary">salary</option>
                    </select>
                    <NumberInput control={form.control} name={`incomes.${idx}.gross_annual`} min={0} />
                    <PercentInput control={form.control} name={`incomes.${idx}.annual_growth_rate`} placeholder="%" />
                    <PercentInput control={form.control} name={`incomes.${idx}.employee_pension_pct`} placeholder="%" />
                    <PercentInput control={form.control} name={`incomes.${idx}.employer_pension_pct`} placeholder="%" />
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
                ))}
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
            <div className="text-sm font-semibold">Assets</div>

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
              <div className="hidden min-w-[1320px] grid-cols-10 gap-3 text-xs text-slate-400 md:grid">
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
                  End_at_retire
                  <InfoTip text="If enabled, this asset stops receiving new investments once everyone is retired. Existing balance still grows and can still be withdrawn." />
                </div>
                <div></div>
              </div>
              <div className="min-w-[1320px] space-y-2">
                {assets.fields.map((asset, idx) => (
                  <div key={asset.id} className="grid grid-cols-1 gap-3 rounded border border-slate-800 bg-slate-950/30 p-3 md:grid-cols-10">
                    <select
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      {...form.register(`assets.${idx}.person_id`)}
                    >
                      <option value="">Household</option>
                      {scenario.people.map((p) => (
                        <option key={p.id} value={p.id}>
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
                    <PercentInput control={form.control} name={`assets.${idx}.growth_rate_mean`} placeholder="%" />
                    <PercentInput control={form.control} name={`assets.${idx}.growth_rate_std`} placeholder="%" />
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
                  person_id: ""
                } as any)
              }
            >
              Add asset
            </button>
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
            <div className="text-sm font-semibold">Expenses</div>
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

