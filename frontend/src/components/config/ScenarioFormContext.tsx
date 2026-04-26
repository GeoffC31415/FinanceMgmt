import { createContext, useContext } from "react";
import type { Control } from "react-hook-form";
import type { FieldArrayWithId } from "react-hook-form";
import type { ScenarioRead } from "../../types";
import type { FormValues } from "./formSchema";

/**
 * Shared field array types for each field array used in the scenario form.
 */
type PersonField = FieldArrayWithId<any, "people", "field_id">;
type IncomeField = FieldArrayWithId<any, "incomes", "field_id">;
type ExpenseField = FieldArrayWithId<any, "expenses", "field_id">;
type AssetField = FieldArrayWithId<any, "assets", "field_id">;
type PropertyField = FieldArrayWithId<any, "properties", "field_id">;

/**
 * ScenarioFormContext — provides shared form state to all tab components.
 * Eliminates prop drilling by giving tabs direct access to form control,
 * field arrays, scenario data, and computed totals.
 */
export interface ScenarioFormContextValue {
  form: {
    control: Control<FormValues>;
    register: (name: string) => Record<string, unknown>;
    setValue: <T extends keyof FormValues>(name: T, value: FormValues[T], options?: any) => void;
    watch: <T>(name: string) => T;
    getValues: <T>(name: string) => T;
    handleSubmit: (onValid: (data: FormValues) => void) => (e?: React.BaseSyntheticEvent) => Promise<void>;
    formState: {
      isValid: boolean;
      isDirty: boolean;
      errors: Record<string, any>;
    };
  };
  scenario: ScenarioRead;
  people: {
    fields: PersonField[];
    append: (value: Partial<any>) => void;
    remove: (index: number) => void;
  };
  incomes: {
    fields: IncomeField[];
    append: (value: Partial<any>) => void;
    remove: (index: number) => void;
  };
  expenses: {
    fields: ExpenseField[];
    append: (value: Partial<any>) => void;
    remove: (index: number) => void;
  };
  assets: {
    fields: AssetField[];
    append: (value: Partial<any>) => void;
    remove: (index: number) => void;
  };
  properties: {
    fields: PropertyField[];
    append: (value: Partial<any>) => void;
    remove: (index: number) => void;
  };
  // Computed totals
  income_total: number;
  assets_total: number;
  properties_total: number;
  expenses_total: number;
  property_mortgage_balance_total: number;
  property_mortgage_payment_total: number;
}

/**
 * Consumer hook for the scenario form context.
 */
export function useScenarioForm(): ScenarioFormContextValue {
  const ctx = useContext(SenarioFormContext);
  if (!ctx) {
    throw new Error("useScenarioForm must be used within a ScenarioFormProvider");
  }
  return ctx;
}

/**
 * Context — using a slightly different name to avoid naming conflicts.
 * The provider component wraps the form and passes all state down.
 */
export const SenarioFormContext = createContext<ScenarioFormContextValue | null>(null);

export function ScenarioFormProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: ScenarioFormContextValue;
}) {
  return (
    <SenarioFormContext.Provider value={value}>
      {children}
    </SenarioFormContext.Provider>
  );
}
