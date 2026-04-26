import type { Control, FieldArrayWithId, UseFieldArrayAppend, UseFormRegister } from "react-hook-form";
import type { ScenarioRead } from "../../types";
import { NumberInput, PercentInput, InfoTip } from "./inputs";
import type { AssetCreate } from "../../types";
import type { FormValues } from "./formSchema";

type AssetField = FieldArrayWithId<FormValues, "assets", "field_id">;

type Props = {
  form: {
    control: Control<any>;
    register: UseFormRegister<any>;
    watch: <T = any>(name: string) => T;
  };
  assets: {
    fields: AssetField[];
    append: UseFieldArrayAppend<FormValues, "assets">;
    remove: (index: number) => void;
  };
  scenario: ScenarioRead;
  assets_total: number;
};

/**
 * AssetsForm — handles the Assets tab in the scenario form.
 * Manages a list of financial assets (CASH, ISA, GIA, PENSION) with
 * bond allocation, growth rates, and contribution controls.
 */
export function AssetsForm({ form, assets, scenario, assets_total }: Props) {
  return (
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
          <li><strong>Taxed as income:</strong> Pension withdrawals are modelled as 25% tax-free and 75% taxable income, subject to simplifications.</li>
          <li><strong>Owner matters:</strong> Pension withdrawals are taxed against the pension owner's personal allowance and income-tax bands. Assign each pension to the correct person where possible.</li>
          <li><strong>Priority still matters:</strong> Once accessible, pension priority determines whether 
              it's used before or after ISAs/GIAs.</li>
        </ul>
        <p className="mt-2 text-xs italic opacity-80">
          Contributions come from salary pension percentages set in the Income tab. Lifetime PCLS / Lump Sum Allowance limits are not modelled yet.
        </p>
      </div>

      <div className="mt-3 overflow-auto">
        <div className="hidden min-w-[1420px] grid-cols-11 gap-3 text-xs text-slate-400 md:grid">
          <div className="flex items-center">
            Owner
            <InfoTip text="Especially important for pensions: owner affects pension access age and tax treatment." />
          </div>
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
          {assets.fields.map((asset, idx) => {
            const assetType = form.watch<AssetCreate["asset_type"]>(`assets.${idx}.asset_type`);
            const ownerId = form.watch<string | null | undefined>(`assets.${idx}.person_id`);
            const isPensionWithoutOwner = assetType === "PENSION" && !ownerId;
            return (
            <div key={asset.field_id} className="grid grid-cols-1 gap-3 rounded border border-slate-800 bg-slate-950/30 p-3 md:grid-cols-11">
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
              {isPensionWithoutOwner && (
                <div className="md:col-span-11 -mt-1 rounded border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                  Warning: pension assets should have an owner. Household pensions may default unpredictably and pension ownership affects tax.
                </div>
              )}
              <input
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                {...form.register(`assets.${idx}.name`)}
              />
              <select
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                {...form.register(`assets.${idx}.asset_type`)}
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
                const asset_type = form.watch(`assets.${idx}.asset_type`);
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
            );
          })}
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
          })
        }
      >
        Add asset
      </button>
    </div>
  );
}
