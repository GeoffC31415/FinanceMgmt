import type { Control, UseFormRegister } from "react-hook-form";
import type { FieldArrayWithId } from "react-hook-form";
import { NumberInput } from "./inputs";
import type { PersonCreate } from "../../types";

type PersonField = FieldArrayWithId<PersonCreate, "people", "field_id">;

type Props = {
  form: {
    control: Control<any>;
    register: UseFormRegister<any>;
    watch: <T>(name: string) => T;
  };
  people: {
    fields: PersonField[];
    append: (value: Partial<PersonCreate>) => void;
    remove: (index: number) => void;
  };
};

/**
 * PeopleForm — handles the People & Children tab in the scenario form.
 * Manages a list of people with fields for adults (retirement age, pension age)
 * and children (annual cost, leaves household age).
 */
export function PeopleForm({ form, people }: Props) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="text-sm font-semibold">People &amp; Children</div>
      <div className="mt-2 text-xs text-slate-400">
        Adults have income and retirement planning. Children have annual costs until they leave the household.
      </div>
      {people.fields.map((person, idx) => {
        const isChild = form.watch(`people.${idx}.is_child`) === true;
        return (
          <div key={person.field_id} className="mt-4 rounded border border-slate-800 bg-slate-950/30 p-4">
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
                    <div className="mt-1 text-xs text-slate-400">
                      State pension starts at this age and is modelled as taxable income for this person.
                    </div>
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
  );
}
