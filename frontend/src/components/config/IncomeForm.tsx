import type { Control, UseFormRegister } from "react-hook-form";
import type { FieldArrayWithId } from "react-hook-form";
import type { ScenarioRead } from "../../types";
import { NumberInput, PercentInput, InfoTip } from "./inputs";
import type { IncomeCreate } from "../../types";

type IncomeField = FieldArrayWithId<IncomeCreate, "incomes", "field_id">;

type Props = {
  form: {
    control: Control<any>;
    register: UseFormRegister<any>;
    watch: <T>(name: string) => T;
  };
  incomes: {
    fields: IncomeField[];
    append: (value: Partial<IncomeCreate>) => void;
    remove: (index: number) => void;
  };
  scenario: ScenarioRead;
  income_total: number;
};

/**
 * IncomeForm — handles the Income tab in the scenario form.
 * Manages a list of income sources (salary, rental, gift) with
 * person assignment, growth rates, and pension contributions.
 */
export function IncomeForm({ form, incomes, scenario, income_total }: Props) {
  return (
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
              <div key={income.field_id} className="grid grid-cols-1 gap-3 rounded border border-slate-800 bg-slate-950/30 p-3 md:grid-cols-7">
                <select
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  {...form.register(`incomes.${idx}.person_id`)}
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
                  {...form.register(`incomes.${idx}.kind`)}
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
          })
        }
      >
        Add income
      </button>
    </div>
  );
}
