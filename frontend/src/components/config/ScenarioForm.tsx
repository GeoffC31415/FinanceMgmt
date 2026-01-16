import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import type { ScenarioCreate, ScenarioRead } from "../../types";

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
      months_remaining: z.coerce.number().int().min(0).max(2000)
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
  const [tab, setTab] = useState<"assumptions" | "people" | "income_assets" | "housing_expenses">("assumptions");

  const form = useForm<FormValues>({
    mode: "onChange",
    resolver: zodResolver(schema),
    defaultValues: default_values
  });

  const people = useFieldArray({ control: form.control, name: "people" });
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
          ["income_assets", "Income & Assets"],
          ["housing_expenses", "Housing & Expenses"]
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
            {[
              ["assumptions.inflation_rate", "Inflation rate", "e.g. 0.02"],
              ["assumptions.equity_return_mean", "Equity return mean", "e.g. 0.05"],
              ["assumptions.equity_return_std", "Equity return std dev", "e.g. 0.10"],
              ["assumptions.isa_annual_limit", "ISA annual limit", "e.g. 20000"],
              ["assumptions.state_pension_annual", "State pension annual", "e.g. 11500"],
              ["assumptions.start_year", "Start year", "e.g. 2026"],
              ["assumptions.end_year", "End year", "e.g. 2086"],
              ["assumptions.annual_spend_target", "Annual spend target", "e.g. 30000"]
            ].map(([path, label, placeholder]) => (
              <div key={path} className="rounded border border-slate-800 bg-slate-900/30 p-4">
                <label className="block text-sm font-medium">{label}</label>
                <input
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  placeholder={placeholder}
                  {...form.register(path as any)}
                />
              </div>
            ))}
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

        {tab === "income_assets" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <div className="text-sm font-semibold">Income (first entry)</div>
              <div className="mt-3 grid gap-3">
        <div>
          <label className="block text-sm font-medium">Assigned to</label>
          <select
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            {...form.register("incomes.0.person_id")}
          >
            <option value="">Household</option>
            {scenario.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {[
          ["incomes.0.gross_annual", "Gross annual"],
          ["incomes.0.annual_growth_rate", "Annual growth rate"],
          ["incomes.0.employee_pension_pct", "Employee pension % (0..1)"],
          ["incomes.0.employer_pension_pct", "Employer pension % (0..1)"]
        ].map(([path, label]) => (
          <div key={path}>
            <label className="block text-sm font-medium">{label}</label>
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              {...form.register(path as any)}
            />
          </div>
        ))}
              </div>
            </div>

            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <div className="text-sm font-semibold">Assets</div>
              {assets.fields.map((asset, idx) => (
                <div key={asset.id} className="mt-4 rounded border border-slate-800 bg-slate-950/30 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold">Asset {idx + 1}</div>
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
                  <div className="grid gap-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium">Type</label>
                        <select
                          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                          {...form.register(`assets.${idx}.asset_type` as any)}
                        >
                          <option value="CASH">Cash</option>
                          <option value="ISA">ISA</option>
                          <option value="GIA">GIA</option>
                          <option value="PENSION">Pension</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium">Withdrawal priority (lower = earlier)</label>
                        <input
                          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                          type="number"
                          {...form.register(`assets.${idx}.withdrawal_priority` as any)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium">Name</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        {...form.register(`assets.${idx}.name`)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">Assigned to</label>
                      <select
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        {...form.register(`assets.${idx}.person_id`)}
                      >
                        <option value="">Household</option>
                        {scenario.people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium">Starting balance</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        {...form.register(`assets.${idx}.balance`)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">Annual contribution</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        {...form.register(`assets.${idx}.annual_contribution`)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">Growth rate mean (e.g. 0.05)</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        step="0.01"
                        {...form.register(`assets.${idx}.growth_rate_mean`)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">Growth rate std dev (risk, e.g. 0.10)</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        step="0.01"
                        {...form.register(`assets.${idx}.growth_rate_std`)}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        {...form.register(`assets.${idx}.contributions_end_at_retirement`)}
                      />
                      Contributions end at retirement
                    </label>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="mt-4 rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                onClick={() =>
                  assets.append({
                    name: "New asset",
                    asset_type: "GIA",
                    withdrawal_priority: 100,
                    balance: 0,
                    annual_contribution: 0,
                    growth_rate_mean: 0.05,
                    growth_rate_std: 0.10,
                    contributions_end_at_retirement: false,
                    person_id: ""
                  })
                }
              >
                Add asset
              </button>
            </div>
          </div>
        )}

        {tab === "housing_expenses" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <div className="text-sm font-semibold">Mortgage</div>
              <div className="mt-3 grid gap-3">
                {[
                  ["mortgage.balance", "Balance"],
                  ["mortgage.annual_interest_rate", "Annual interest rate"],
                  ["mortgage.monthly_payment", "Monthly payment"],
                  ["mortgage.months_remaining", "Months remaining"]
                ].map(([path, label]) => (
                  <div key={path}>
                    <label className="block text-sm font-medium">{label}</label>
                    <input
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      {...form.register(path as any)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
              <div className="text-sm font-semibold">Expenses</div>
              {expenses.fields.map((expense, idx) => (
                <div key={expense.id} className="mt-4 rounded border border-slate-800 bg-slate-950/30 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold">Expense {idx + 1}</div>
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
                  <div className="grid gap-3">
                    <div>
                      <label className="block text-sm font-medium">Name</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        {...form.register(`expenses.${idx}.name`)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">Monthly amount</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        {...form.register(`expenses.${idx}.monthly_amount`)}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        {...form.register(`expenses.${idx}.is_inflation_linked`)}
                      />
                      Inflation linked
                    </label>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="mt-4 rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                onClick={() =>
                  expenses.append({
                    name: "New expense",
                    monthly_amount: 0,
                    is_inflation_linked: true
                  })
                }
              >
                Add expense
              </button>
            </div>
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

