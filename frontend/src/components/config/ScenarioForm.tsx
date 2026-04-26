import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import type { UseFormRegister } from "react-hook-form";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import type { Assumptions, ReturnModel, ScenarioCreate, ScenarioRead } from "../../types";
import { scenarioSchema, type FormValues } from "./formSchema";
import { NumberInput, PercentInput, AnnualFromMonthlyInput, RentalSection, InfoTip } from "./inputs";
import { property_mortgage_balance, property_mortgage_monthly_payment, parse_number_input, parse_percent_input } from "./formConverters";
import { PropertiesForm } from "./PropertiesForm";
import { PeopleForm } from "./PeopleForm";
import { IncomeForm } from "./IncomeForm";
import { AssetsForm } from "./AssetsForm";
import { ExpensesForm } from "./ExpensesForm";
import { AssumptionsForm } from "./AssumptionsForm";
import { SellOrderForm } from "./SellOrderForm";
import { HousingForm } from "./HousingForm";



const schema = scenarioSchema;

function to_form_values(scenario: ScenarioRead): FormValues {
  const assumptions = scenario.assumptions;

  const inflation_rate = assumptions.inflation_rate ?? 0.02;
  const isa_annual_limit = assumptions.isa_annual_limit ?? 20000;
  const state_pension_annual = assumptions.state_pension_annual ?? 11500;
  const pension_access_age = assumptions.pension_access_age ?? 55;
  const start_year = assumptions.start_year ?? new Date().getFullYear();
  const end_year = assumptions.end_year ?? new Date().getFullYear() + 60;
  const annual_spend_target = assumptions.annual_spend_target ?? 30000;
  const debt_interest_rate = assumptions.debt_interest_rate ?? 0.08;
  const bankruptcy_threshold = assumptions.bankruptcy_threshold ?? -100000;
  const return_model = assumptions.return_model ?? "historical_bootstrap" as ReturnModel;
  const tax_year = assumptions.tax_year;

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
      const existingType = a.asset_type;
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
        asset_type: inferred as "CASH" | "ISA" | "GIA" | "PENSION",
        withdrawal_priority: a.withdrawal_priority ?? 100,
        balance: a.balance,
        annual_contribution: a.annual_contribution,
        growth_rate_mean: a.growth_rate_mean,
        growth_rate_std: a.growth_rate_std,
        contributions_end_at_retirement: a.contributions_end_at_retirement,
        bond_allocation: a.bond_allocation ?? 0,
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
      mortgage_ltv: p.mortgage_ltv,
      mortgage_rate: p.mortgage_rate,
      mortgage_term_years: p.mortgage_term_years,
      annual_maintenance_cost: p.annual_maintenance_cost,
      maintenance_is_inflation_linked: p.maintenance_is_inflation_linked,
      withdrawal_priority: p.withdrawal_priority,
      person_id: p.person_id ?? ""
    })),
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
      mortgage_ltv: p.mortgage_ltv,
      mortgage_rate: p.mortgage_rate,
      mortgage_term_years: p.mortgage_term_years,
      annual_maintenance_cost: p.annual_maintenance_cost,
      maintenance_is_inflation_linked: p.maintenance_is_inflation_linked,
      withdrawal_priority: p.withdrawal_priority,
      person_id: normalize_person_id(p.person_id)
    })),
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

  const people = useFieldArray({ control: form.control, name: "people", keyName: "field_id" });
  const incomes = useFieldArray({ control: form.control, name: "incomes", keyName: "field_id" });
  const expenses = useFieldArray({ control: form.control, name: "expenses", keyName: "field_id" });
  const assets = useFieldArray({ control: form.control, name: "assets", keyName: "field_id" });
  const properties = useFieldArray({ control: form.control, name: "properties", keyName: "field_id" });

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

  const property_mortgage_balance_total = useMemo(() => {
    if (!watched_properties) return 0;
    return watched_properties.reduce((sum, property) => sum + property_mortgage_balance({
      value: Number(property?.value) || 0,
      mortgage_ltv: Number(property?.mortgage_ltv) || 0,
    }), 0);
  }, [watched_properties]);

  const property_mortgage_payment_total = useMemo(() => {
    if (!watched_properties) return 0;
    return watched_properties.reduce((sum, property) => sum + property_mortgage_monthly_payment({
      value: Number(property?.value) || 0,
      mortgage_ltv: Number(property?.mortgage_ltv) || 0,
      mortgage_rate: Number(property?.mortgage_rate) || 0,
      mortgage_term_years: Number(property?.mortgage_term_years) || 0,
    }), 0);
  }, [watched_properties]);

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

  const [expandedPropertyIdx, setExpandedPropertyIdx] = useState<number | null>(
    properties.fields.length > 0 ? 0 : null
  );

  // Reset form when scenario data changes (switch scenario or after successful save).
  // This also clears isDirty so the "unsaved changes" indicator disappears.
  useEffect(() => {
    form.reset(default_values);
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
              key === "sell_order" || key === "housing"
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
          <AssumptionsForm control={form.control} setValue={form.setValue} />
        )}

        {tab === "people" && (
          <PeopleForm form={form} people={people} />
        )}

        {tab === "income" && (
          <IncomeForm
            form={form}
            incomes={incomes}
            scenario={scenario}
            income_total={income_total}
          />
        )}

        {tab === "assets" && (
          <AssetsForm
            form={form}
            assets={assets}
            scenario={scenario}
            assets_total={assets_total}
          />
        )}

        {tab === "properties" && (
          <PropertiesForm
            form={form}
            properties={properties}
            expandedPropertyIdx={expandedPropertyIdx}
            setExpandedPropertyIdx={setExpandedPropertyIdx}
            scenario={scenario}
            properties_total={properties_total}
            property_mortgage_balance_total={property_mortgage_balance_total}
          />
        )}

        {tab === "sell_order" && (
          <SellOrderForm sell_order_items={sell_order_items} person_label_by_id={person_label_by_id} />
        )}

        {tab === "housing" && (
          <HousingForm
            watched_properties={watched_properties ?? []}
            property_mortgage_balance_total={property_mortgage_balance_total}
            property_mortgage_payment_total={property_mortgage_payment_total}
            property_mortgage_balance={property_mortgage_balance}
            property_mortgage_monthly_payment={property_mortgage_monthly_payment}
          />
        )}

        {tab === "expenses" && (
          <ExpensesForm
            form={form}
            expenses={expenses}
            expenses_total={expenses_total}
          />
        )}

        <div className="flex items-center justify-end gap-3">
          <div className="text-xs text-slate-400">
            {form.formState.isValid ? "Valid" : "Fix validation errors before saving"}
          </div>
          {form.formState.isDirty && (
            <div className="flex items-center gap-1.5 text-xs text-amber-300">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              Unsaved changes
            </div>
          )}
          <button
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
            disabled={!form.formState.isValid || is_saving}
            type="submit"
          >
            {is_saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

