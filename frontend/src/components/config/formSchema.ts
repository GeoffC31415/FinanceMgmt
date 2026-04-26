import { z } from "zod";

/**
 * Zod schema for scenario form validation.
 * Extracted from ScenarioForm.tsx for testability and reusability.
 */
export const scenarioSchema = z.object({
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
        planned_retirement_age: z.coerce.number().int().min(0).max(120).nullable().optional(),
        state_pension_age: z.coerce.number().int().min(0).max(120).nullable().optional(),
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
      mortgage_ltv: z.coerce.number().min(0).max(1).default(0),
      mortgage_rate: z.coerce.number().min(0).max(1).default(0),
      mortgage_term_years: z.coerce.number().int().min(0).max(100).default(0),
      annual_maintenance_cost: z.coerce.number().min(0),
      maintenance_is_inflation_linked: z.coerce.boolean().default(true),
      withdrawal_priority: z.coerce.number().int().min(0).max(10000).default(15)
    })
  ),
  expenses: z.array(
    z.object({
      name: z.string().min(1).max(200),
      monthly_amount: z.coerce.number().min(0),
      is_inflation_linked: z.coerce.boolean()
    })
  )
});

export type FormValues = z.infer<typeof scenarioSchema>;
