import type { Control, FieldArrayWithId, UseFieldArrayAppend, UseFormRegister, UseFormSetValue } from "react-hook-form";
import type { ScenarioRead } from "../../types";
import { NumberInput, PercentInput, RentalSection, InfoTip } from "./inputs";
import { property_mortgage_balance, property_mortgage_monthly_payment } from "./formConverters";
import type { FormValues } from "./formSchema";

type PropertyField = FieldArrayWithId<FormValues, "properties", "field_id">;

type Props = {
  form: {
    control: Control<any>;
    setValue: UseFormSetValue<any>;
    register: UseFormRegister<any>;
    watch: <T = any>(name: string) => T;
  };
  properties: {
    fields: PropertyField[];
    append: UseFieldArrayAppend<FormValues, "properties">;
    remove: (index: number) => void;
  };
  expandedPropertyIdx: number | null;
  setExpandedPropertyIdx: (idx: number | null) => void;
  scenario: ScenarioRead;
  properties_total: number;
  property_mortgage_balance_total: number;
};

/**
 * PropertiesForm — handles the Properties tab in the scenario form.
 * Manages a list of property cards with expand/collapse, mortgage config,
 * rental income, and maintenance costs.
 */
export function PropertiesForm({
  form,
  properties,
  expandedPropertyIdx,
  setExpandedPropertyIdx,
  scenario,
  properties_total,
  property_mortgage_balance_total,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Portfolio summary bar */}
      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">Property Portfolio</div>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="text-slate-300">
              Total value: <span className="font-semibold text-emerald-400">£{properties_total.toLocaleString()}</span>
            </div>
            {property_mortgage_balance_total > 0 && (
              <>
                <div className="text-slate-300">
                  Total equity: <span className="font-semibold text-sky-400">£{Math.round(properties_total - property_mortgage_balance_total).toLocaleString()}</span>
                </div>
                <div className="text-slate-300">
                  Total debt: <span className="font-semibold text-rose-400">£{Math.round(property_mortgage_balance_total).toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
          Each property can generate rental income, appreciates (or depreciates) over time, and can carry a mortgage.
          Properties can be sold to cover cash shortfalls — set withdrawal priority to control which sell first.
          Capital gains tax applies on sale.
        </p>
      </div>

      {/* Property cards */}
      {properties.fields.map((property, idx) => {
        const propName = form.watch(`properties.${idx}.name`) || `Property ${idx + 1}`;
        const propValue = Number(form.watch(`properties.${idx}.value`) ?? 0);
        const propLtv = Number(form.watch(`properties.${idx}.mortgage_ltv`) ?? 0);
        const propRate = Number(form.watch(`properties.${idx}.mortgage_rate`) ?? 0);
        const propTerm = Number(form.watch(`properties.${idx}.mortgage_term_years`) ?? 0);
        const propRent = Number(form.watch(`properties.${idx}.monthly_rental_income`) ?? 0);
        const propOccupancy = Number(form.watch(`properties.${idx}.occupancy_rate`) ?? 1);
        const propMaintenance = Number(form.watch(`properties.${idx}.annual_maintenance_cost`) ?? 0);
        const isRental = propRent > 0 || propOccupancy < 1 || Number(form.watch(`properties.${idx}.rental_growth_rate`) ?? 0) !== 0;

        const mortBalance = property_mortgage_balance({ value: propValue, mortgage_ltv: propLtv });
        const mortMonthly = property_mortgage_monthly_payment({
          value: propValue, mortgage_ltv: propLtv,
          mortgage_rate: propRate, mortgage_term_years: propTerm,
        });
        const mortTotalCost = propTerm > 0 ? mortMonthly * propTerm * 12 : 0;
        const mortTotalInterest = propTerm > 0 ? mortTotalCost - mortBalance : 0;
        const equity = propValue - mortBalance;

        const annualRent = propRent * 12 * propOccupancy;
        const annualMortgage = mortMonthly * 12;
        const netAnnualCashflow = annualRent - annualMortgage - propMaintenance;

        const isExpanded = expandedPropertyIdx === idx;

        return (
          <div key={property.field_id} className="rounded border border-slate-800 bg-slate-900/30">
            {/* Collapsed header — always visible */}
            <button
              type="button"
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-800/30 transition-colors"
              onClick={() => setExpandedPropertyIdx(isExpanded ? null : idx)}
            >
              <span className={`text-slate-400 transition-transform text-xs ${isExpanded ? "rotate-90" : ""}`}>
                &#9654;
              </span>
              <span className="text-sm font-semibold text-slate-100 min-w-0 truncate">{propName}</span>
              <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs shrink-0">
                <span className="text-slate-400">
                  Value <span className="font-medium text-emerald-400">£{propValue.toLocaleString()}</span>
                </span>
                {mortBalance > 0 && (
                  <>
                    <span className="text-slate-400">
                      Equity <span className="font-medium text-sky-400">£{Math.round(equity).toLocaleString()}</span>
                    </span>
                    <span className="text-slate-400">
                      Debt <span className="font-medium text-rose-400">£{Math.round(mortBalance).toLocaleString()}</span>
                    </span>
                  </>
                )}
                {annualRent > 0 && (
                  <span className="text-slate-400">
                    Rent <span className="font-medium text-emerald-300">£{Math.round(annualRent).toLocaleString()}/yr</span>
                  </span>
                )}
                {(annualRent > 0 || mortBalance > 0 || propMaintenance > 0) && (
                  <span className="text-slate-400">
                    Net{" "}
                    <span className={`font-medium ${netAnnualCashflow >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {netAnnualCashflow >= 0 ? "+" : ""}£{Math.round(netAnnualCashflow).toLocaleString()}/yr
                    </span>
                  </span>
                )}
              </div>
            </button>

            {/* Expanded body */}
            {isExpanded && (
              <>
                <div className="border-t border-slate-800 p-4">
                  <div className="grid flex-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400">Property name</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        {...form.register(`properties.${idx}.name`)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400">Owner</label>
                      <select
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        {...form.register(`properties.${idx}.person_id`)}
                      >
                        <option value="">Household</option>
                        {scenario.people.map((p) => (
                          <option key={p.id} value={p.id ?? ""}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="flex items-center text-xs font-medium text-slate-400">
                        Sell priority
                        <InfoTip text="Higher number = sell first when cash is short. Set 30 for a property you'd liquidate early, 10 for one you want to keep." />
                      </label>
                      <div className="mt-1">
                        <NumberInput control={form.control} name={`properties.${idx}.withdrawal_priority`} min={0} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-800/60 p-4 space-y-5">
                  {/* Value & Appreciation */}
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Value &amp; Appreciation</div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400">Current value</label>
                        <div className="mt-1">
                          <NumberInput control={form.control} name={`properties.${idx}.value`} min={0} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400">Annual appreciation (mean)</label>
                        <div className="mt-1">
                          <PercentInput control={form.control} name={`properties.${idx}.appreciation_rate_mean`} placeholder="e.g. 3" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400">Appreciation volatility (std)</label>
                        <div className="mt-1">
                          <PercentInput control={form.control} name={`properties.${idx}.appreciation_rate_std`} placeholder="e.g. 8" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rental Income */}
                  <RentalSection
                    control={form.control}
                    index={idx}
                    initialOpen={isRental}
                    annualRent={annualRent}
                    propRent={propRent}
                    propOccupancy={propOccupancy}
                    setValue={form.setValue}
                  />

                  {/* Mortgage */}
                  <div className="border-t border-slate-800/60 pt-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mortgage</div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400">Loan-to-value (LTV)</label>
                        <div className="mt-1">
                          <PercentInput control={form.control} name={`properties.${idx}.mortgage_ltv`} placeholder="e.g. 75" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400">Interest rate</label>
                        <div className="mt-1">
                          <PercentInput control={form.control} name={`properties.${idx}.mortgage_rate`} placeholder="e.g. 4.5" />
                        </div>
                      </div>
                      <div>
                        <label className="flex items-center text-xs font-medium text-slate-400">
                          Term (years)
                          <InfoTip text="Set to 0 for interest-only. A positive value amortises the mortgage over that many years." />
                        </label>
                        <div className="mt-1">
                          <NumberInput control={form.control} name={`properties.${idx}.mortgage_term_years`} min={0} />
                        </div>
                      </div>
                    </div>
                    {mortBalance > 0 && (
                      <div className="mt-3 grid gap-x-6 gap-y-1 rounded border border-slate-800 bg-slate-950/50 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                        <div className="text-slate-400">
                          Balance: <span className="font-medium text-slate-200">£{Math.round(mortBalance).toLocaleString()}</span>
                        </div>
                        <div className="text-slate-400">
                          Equity: <span className="font-medium text-sky-300">£{Math.round(equity).toLocaleString()}</span>
                        </div>
                        <div className="text-slate-400">
                          Monthly payment: <span className="font-medium text-slate-200">£{Math.round(mortMonthly).toLocaleString()}</span>
                        </div>
                        {propTerm > 0 ? (
                          <div className="text-slate-400">
                            Total interest: <span className="font-medium text-amber-300">£{Math.round(mortTotalInterest).toLocaleString()}</span>
                            <span className="text-slate-500"> over {propTerm}yr</span>
                          </div>
                        ) : (
                          <div className="text-slate-400">
                            Type: <span className="font-medium text-amber-300">Interest-only</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Maintenance & Costs */}
                  <div className="border-t border-slate-800/60 pt-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Maintenance</div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400">Annual maintenance cost</label>
                        <div className="mt-1">
                          <NumberInput control={form.control} name={`properties.${idx}.annual_maintenance_cost`} min={0} />
                        </div>
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            {...form.register(`properties.${idx}.maintenance_is_inflation_linked`)}
                          />
                          Grows with inflation
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Net cashflow summary */}
                  {(annualRent > 0 || mortBalance > 0 || propMaintenance > 0) && (
                    <div className="border-t border-slate-800/60 pt-4">
                      <div className="flex flex-wrap gap-4 rounded border border-slate-800 bg-slate-950/50 p-3 text-xs">
                        <div className="text-slate-400">
                          Annual rent: <span className="text-emerald-300">+£{Math.round(annualRent).toLocaleString()}</span>
                        </div>
                        {annualMortgage > 0 && (
                          <div className="text-slate-400">
                            Mortgage: <span className="text-rose-300">-£{Math.round(annualMortgage).toLocaleString()}</span>
                          </div>
                        )}
                        {propMaintenance > 0 && (
                          <div className="text-slate-400">
                            Maintenance: <span className="text-rose-300">-£{Math.round(propMaintenance).toLocaleString()}</span>
                          </div>
                        )}
                        <div className="ml-auto font-medium text-slate-300">
                          Net cashflow:{" "}
                          <span className={netAnnualCashflow >= 0 ? "text-emerald-300" : "text-rose-300"}>
                            {netAnnualCashflow >= 0 ? "+" : ""}£{Math.round(netAnnualCashflow).toLocaleString()}/yr
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Remove button at bottom of expanded card */}
                <div className="flex items-center justify-end border-t border-slate-800/60 px-4 py-3">
                  <button
                    type="button"
                    className="rounded bg-slate-800 px-2.5 py-1.5 text-xs hover:bg-slate-700"
                    onClick={() => {
                      properties.remove(idx);
                      setExpandedPropertyIdx(null);
                    }}
                  >
                    Remove property
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {properties.fields.length === 0 && (
        <div className="rounded border border-dashed border-slate-700 bg-slate-900/20 p-6 text-center text-sm text-slate-400">
          No properties yet. Add one below to model buy-to-let investments.
        </div>
      )}

      <button
        type="button"
        className="rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
        onClick={() => {
          properties.append({
            person_id: "",
            name: "New property",
            value: 0,
            appreciation_rate_mean: 0.03,
            appreciation_rate_std: 0.08,
            monthly_rental_income: 0,
            rental_growth_rate: 0.02,
            occupancy_rate: 0.95,
            mortgage_ltv: 0,
            mortgage_rate: 0.04,
            mortgage_term_years: 0,
            annual_maintenance_cost: 0,
            maintenance_is_inflation_linked: true,
            withdrawal_priority: 15
          });
          setExpandedPropertyIdx(properties.fields.length);
        }}
      >
        Add property
      </button>
    </div>
  );
}
