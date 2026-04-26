import type { Control, FieldArrayWithId, UseFieldArrayAppend, UseFormRegister, UseFormSetValue } from "react-hook-form";
import { NumberInput, AnnualFromMonthlyInput } from "./inputs";
import type { FormValues } from "./formSchema";

type ExpenseField = FieldArrayWithId<FormValues, "expenses", "field_id">;

type Props = {
  form: {
    control: Control<any>;
    register: UseFormRegister<any>;
    setValue: UseFormSetValue<any>;
  };
  expenses: {
    fields: ExpenseField[];
    append: UseFieldArrayAppend<FormValues, "expenses">;
    remove: (index: number) => void;
  };
  expenses_total: number;
};

/**
 * ExpensesForm — handles the Expenses tab in the scenario form.
 * Manages a list of monthly expenses with name, amount, and inflation toggle.
 */
export function ExpensesForm({ form, expenses, expenses_total }: Props) {
  return (
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
              key={expense.field_id}
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
          })
        }
      >
        Add expense
      </button>
    </div>
  );
}
