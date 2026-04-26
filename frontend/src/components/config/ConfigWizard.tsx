import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AssetCreate, ScenarioCreate, ScenarioRead } from "../../types";
import { create_scenario, update_scenario } from "../../api/client";

type StepId =
  | "start"
  | "people"
  | "income"
  | "assets"
  | "property"
  | "expenses"
  | "assumptions"
  | "summary";

const STEPS: { id: StepId; label: string }[] = [
  { id: "start", label: "Start" },
  { id: "people", label: "People" },
  { id: "income", label: "Income" },
  { id: "assets", label: "Assets" },
  { id: "property", label: "Property" },
  { id: "expenses", label: "Expenses" },
  { id: "assumptions", label: "Assumptions" },
  { id: "summary", label: "Summary" }
];

// --- Tooltip component ---
function Tooltip({ text }: { text: string }) {
  return (
    <span
      className="ml-1.5 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-500 text-[10px] text-slate-400 transition-colors hover:border-indigo-400 hover:text-indigo-300"
      title={text}
      aria-label={text}
    >
      ?
    </span>
  );
}

// --- Hint component for italic helper text ---
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs italic text-slate-400">{children}</p>;
}

// --- Section intro component ---
function StepIntro({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border border-slate-700/50 bg-slate-800/30 px-4 py-3">
      <p className="text-sm text-slate-300">{children}</p>
    </div>
  );
}

// --- Label with optional tooltip ---
function Label({ children, tooltip }: { children: React.ReactNode; tooltip?: string }) {
  return (
    <label className="flex items-center text-xs text-slate-400">
      {children}
      {tooltip && <Tooltip text={tooltip} />}
    </label>
  );
}

function default_draft(): ScenarioCreate {
  const year = new Date().getFullYear();
  return {
    name: "New scenario",
    assumptions: {
      inflation_rate: 0.02,
      isa_annual_limit: 20000,
      state_pension_annual: 11500,
      pension_access_age: 55,
      start_year: year,
      end_year: year + 60,
      annual_spend_target: 30000,
      return_model: "historical_bootstrap",
      debt_interest_rate: 0.08,
      bankruptcy_threshold: -100000,
    },
    people: [{ id: null, label: "you", birth_date: "1985-01-01", planned_retirement_age: 60, state_pension_age: 67 }],
    incomes: [{ kind: "salary", gross_annual: 60000, annual_growth_rate: 0.02, employee_pension_pct: 0.05, employer_pension_pct: 0.05, person_id: null }],
    assets: [
      { name: "ISA", asset_type: "ISA", withdrawal_priority: 30, balance: 50000, annual_contribution: 10000, growth_rate_mean: 0.05, growth_rate_std: 0.10, contributions_end_at_retirement: false, bond_allocation: 0, person_id: null },
      { name: "Pension", asset_type: "PENSION", withdrawal_priority: 10, balance: 150000, annual_contribution: 0, growth_rate_mean: 0.05, growth_rate_std: 0.10, contributions_end_at_retirement: false, bond_allocation: 0, person_id: null },
      { name: "Cash", asset_type: "CASH", withdrawal_priority: 0, balance: 20000, annual_contribution: 0, growth_rate_mean: 0.0, growth_rate_std: 0.0, contributions_end_at_retirement: false, bond_allocation: 0, person_id: null }
    ],
    properties: [],
    expenses: [{ name: "Household", monthly_amount: 2500, is_inflation_linked: true }]
  };
}

function property_mortgage_monthly_payment(property: ScenarioCreate["properties"][number]): number {
  const balance = property.value * property.mortgage_ltv;
  if (balance <= 0 || property.mortgage_rate < 0) return 0;

  const monthly_rate = property.mortgage_rate / 12;
  if (property.mortgage_term_years <= 0) return balance * monthly_rate;

  const periods = property.mortgage_term_years * 12;
  if (monthly_rate === 0) return periods > 0 ? balance / periods : 0;

  const growth = (1 + monthly_rate) ** periods;
  return (balance * monthly_rate * growth) / (growth - 1);
}

function property_mortgage_balance(property: ScenarioCreate["properties"][number]): number {
  return property.value * property.mortgage_ltv;
}

function to_draft(scenario: ScenarioRead): ScenarioCreate {
  return {
    name: scenario.name,
    assumptions: scenario.assumptions,
    people: scenario.people.map((p) => ({
      id: p.id,
      label: p.label,
      birth_date: p.birth_date,
      planned_retirement_age: p.planned_retirement_age ?? null,
      state_pension_age: p.state_pension_age ?? null,
      is_child: p.is_child ?? false,
      annual_cost: p.annual_cost ?? null,
      leaves_household_age: p.leaves_household_age ?? null,
    })),
    incomes: scenario.incomes.map((i) => ({
      kind: i.kind,
      gross_annual: i.gross_annual,
      annual_growth_rate: i.annual_growth_rate,
      employee_pension_pct: i.employee_pension_pct,
      employer_pension_pct: i.employer_pension_pct,
      person_id: i.person_id ?? null,
      start_year: i.start_year ?? null,
      end_year: i.end_year ?? null,
    })),
    assets: scenario.assets.map((a) => {
      const existingType = (a as AssetCreate).asset_type;
      const inferred: AssetCreate["asset_type"] =
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
        asset_type: inferred,
        withdrawal_priority: a.withdrawal_priority ?? 100,
        balance: a.balance,
        annual_contribution: a.annual_contribution,
        growth_rate_mean: a.growth_rate_mean,
        growth_rate_std: a.growth_rate_std,
        contributions_end_at_retirement: a.contributions_end_at_retirement,
        bond_allocation: a.bond_allocation ?? 0,
        person_id: a.person_id ?? null
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
      person_id: p.person_id ?? null
    })),
    expenses: scenario.expenses.map((e) => ({
      name: e.name,
      monthly_amount: e.monthly_amount,
      is_inflation_linked: e.is_inflation_linked,
      start_year: e.start_year ?? null,
      end_year: e.end_year ?? null,
    }))
  };
}

function step_index(step: StepId): number {
  return STEPS.findIndex((s) => s.id === step);
}

export function ConfigWizard() {
  const navigate = useNavigate();

  const [step, setStep] = useState<StepId>("start");
  const [scenario_id, setScenarioId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScenarioCreate>(() => default_draft());

  const [is_working, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progress = useMemo(() => {
    const idx = step_index(step);
    return idx <= 0 ? 0 : Math.round((idx / (STEPS.length - 1)) * 100);
  }, [step]);

  async function persist_now(next: ScenarioCreate) {
    if (!scenario_id) return;
    setIsWorking(true);
    setError(null);
    try {
      const updated = await update_scenario(scenario_id, next);
      setDraft(to_draft(updated));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save progress");
      throw e;
    } finally {
      setIsWorking(false);
    }
  }

  async function next_step() {
    const idx = step_index(step);
    const next = STEPS[Math.min(STEPS.length - 1, idx + 1)]?.id ?? "summary";
    setStep(next);
  }

  async function prev_step() {
    const idx = step_index(step);
    const prev = STEPS[Math.max(0, idx - 1)]?.id ?? "start";
    setStep(prev);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">New scenario walkthrough</h1>
          <p className="text-slate-300">
            Build your financial scenario step by step. Each setting shapes how the simulation models your future.
          </p>
        </div>
        <button
          type="button"
          className="rounded bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
          onClick={() => navigate("/config")}
        >
          Back to Config
        </button>
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">Progress</div>
          <div className="text-xs text-slate-400">{progress}%</div>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-800">
          <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={`rounded px-2 py-1 transition-colors ${
                s.id === step ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-200"
              }`}
            >
              {s.label}
            </div>
          ))}
        </div>
      </div>

      {error && <div className="rounded border border-rose-800 bg-rose-950 px-4 py-3 text-sm text-rose-200">{error}</div>}

      {step === "start" && (
        <div className="rounded border border-slate-800 bg-slate-900/30 p-4 space-y-4">
          <StepIntro>
            Give your scenario a memorable name. You might create multiple scenarios to compare different life choices — e.g. "Early retirement at 55" vs "Work until 60".
          </StepIntro>
          
          <div>
            <label className="block text-sm font-medium">Scenario name</label>
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
            <Hint>Choose something descriptive so you can identify it later.</Hint>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
              disabled={is_working || draft.name.trim().length === 0}
              onClick={async () => {
                setIsWorking(true);
                setError(null);
                try {
                  // Create the DB row first (basic entry). This returns an id.
                  const created: ScenarioRead = await create_scenario({ name: draft.name, assumptions: { inflation_rate: 0.02, isa_annual_limit: 20000, state_pension_annual: 11500, pension_access_age: 55, start_year: new Date().getFullYear(), end_year: new Date().getFullYear() + 60, annual_spend_target: 30000, debt_interest_rate: 0.08, bankruptcy_threshold: -100000, return_model: "parametric" }, people: [], incomes: [], assets: [], properties: [], expenses: [] });
                  setScenarioId(created.id);

                  // Immediately persist the full draft so step 1 starts from sensible defaults.
                  const updated = await update_scenario(created.id, draft);
                  setDraft(to_draft(updated));
                  await next_step();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to create scenario");
                } finally {
                  setIsWorking(false);
                }
              }}
            >
              Create and start
            </button>
          </div>
        </div>
      )}

      {step !== "start" && (
        <div className="rounded border border-slate-800 bg-slate-900/30 p-4 space-y-4">
          <div className="text-sm text-slate-300">
            Scenario id: <span className="font-mono text-slate-200">{scenario_id ?? "(creating...)"}</span>
          </div>

          {step === "people" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">People</div>
              <StepIntro>
                Add everyone whose finances you want to model. Adults have retirement timelines and pension planning. Children contribute an annual cost until they leave the household.
              </StepIntro>

              {draft.people.map((p, idx) => {
                const isChild = p.is_child === true;
                return (
                  <div key={idx} className="rounded border border-slate-700/60 bg-slate-800/20 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-200">
                          {isChild ? "Child" : "Adult"} {idx + 1}
                        </span>
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChild}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                people: d.people.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        is_child: e.target.checked,
                                        planned_retirement_age: e.target.checked ? null : (x.planned_retirement_age ?? 60),
                                        state_pension_age: e.target.checked ? null : (x.state_pension_age ?? 67),
                                        annual_cost: e.target.checked ? (x.annual_cost ?? 10000) : null,
                                        leaves_household_age: e.target.checked ? (x.leaves_household_age ?? 18) : null,
                                      }
                                    : x
                                )
                              }))
                            }
                          />
                          Is a child
                        </label>
                      </div>
                      {draft.people.length > 1 && (
                        <button
                          type="button"
                          className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                          onClick={() =>
                            setDraft((d) => ({ ...d, people: d.people.filter((_, i) => i !== idx) }))
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label tooltip="A friendly name to identify this person in the scenario">Name</Label>
                        <input
                          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                          value={p.label}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              people: d.people.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x))
                            }))
                          }
                          placeholder="e.g. you, partner, child1"
                        />
                      </div>
                      <div>
                        <Label tooltip="Used to calculate current age and project retirement or cost timing">Date of Birth</Label>
                        <input
                          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                          value={p.birth_date}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              people: d.people.map((x, i) => (i === idx ? { ...x, birth_date: e.target.value } : x))
                            }))
                          }
                          placeholder="YYYY-MM-DD"
                        />
                      </div>

                      {!isChild && (
                        <>
                          <div>
                            <Label tooltip="When salary income stops and retirement spending begins">Retirement Age</Label>
                            <input
                              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                              type="number"
                              value={p.planned_retirement_age ?? ""}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  people: d.people.map((x, i) =>
                                    i === idx ? { ...x, planned_retirement_age: Number(e.target.value) } : x
                                  )
                                }))
                              }
                              placeholder="e.g. 60"
                            />
                          </div>
                          <div>
                            <Label tooltip="When UK state pension payments start (currently 66–67 for most people)">State Pension Age</Label>
                            <input
                              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                              type="number"
                              value={p.state_pension_age ?? ""}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  people: d.people.map((x, i) =>
                                    i === idx ? { ...x, state_pension_age: Number(e.target.value) } : x
                                  )
                                }))
                              }
                              placeholder="e.g. 67"
                            />
                          </div>
                        </>
                      )}

                      {isChild && (
                        <>
                          <div>
                            <Label tooltip="Estimated annual cost of raising this child (grows with inflation each year)">Annual Cost (£)</Label>
                            <input
                              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                              type="number"
                              value={p.annual_cost ?? ""}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  people: d.people.map((x, i) =>
                                    i === idx ? { ...x, annual_cost: Number(e.target.value) } : x
                                  )
                                }))
                              }
                              placeholder="e.g. 10000"
                            />
                          </div>
                          <div>
                            <Label tooltip="Costs stop when the child reaches this age">Leaves Household Age</Label>
                            <input
                              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                              type="number"
                              value={p.leaves_household_age ?? ""}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  people: d.people.map((x, i) =>
                                    i === idx ? { ...x, leaves_household_age: Number(e.target.value) } : x
                                  )
                                }))
                              }
                              placeholder="e.g. 18"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              <Hint>
                Salary stops at retirement age. Private pension access requires age 55+. State pension begins at state pension age. Child costs stop when they leave the household.
              </Hint>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      people: [
                        ...d.people,
                        {
                          id: null,
                          label: `person${d.people.length + 1}`,
                          birth_date: "1985-01-01",
                          planned_retirement_age: 60,
                          state_pension_age: 67,
                          is_child: false,
                          annual_cost: null,
                          leaves_household_age: null,
                        }
                      ]
                    }))
                  }
                >
                  Add adult
                </button>
                <button
                  type="button"
                  className="rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      people: [
                        ...d.people,
                        {
                          id: null,
                          label: `child${d.people.filter((x) => x.is_child).length + 1}`,
                          birth_date: new Date().toISOString().split("T")[0],
                          planned_retirement_age: null,
                          state_pension_age: null,
                          is_child: true,
                          annual_cost: 10000,
                          leaves_household_age: 18,
                        }
                      ]
                    }))
                  }
                >
                  Add child
                </button>
              </div>
            </div>
          )}

          {step === "income" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Income</div>
              <StepIntro>
                Define income sources for your household. Different income types have different tax treatments:
              </StepIntro>
              
              {/* Income type explanations */}
              <div className="rounded border border-sky-800/50 bg-sky-950/30 p-3 text-sm text-sky-200/90">
                <div className="font-medium text-sky-100">Income Types</div>
                <ul className="mt-2 ml-4 list-disc space-y-1 text-xs">
                  <li><strong>Salary:</strong> Employment income subject to Income Tax and National Insurance. Automatically ends at the person's retirement age. Pension contributions can be deducted before tax.</li>
                  <li><strong>Rental:</strong> Property rental income subject to Income Tax only (no National Insurance). Can continue into retirement — use start/end years in the full config to limit the period.</li>
                  <li><strong>Gift:</strong> Tax-free income (e.g., regular gifts from family, expected inheritance). No taxes apply. Can be one-off or recurring.</li>
                </ul>
              </div>
              
              <div className="hidden md:grid md:grid-cols-6 md:gap-3 text-xs text-slate-400">
                <Label tooltip="Link this income to a specific person's retirement timeline (for salary only)">Person</Label>
                <Label tooltip="Salary: taxed with NI, ends at retirement. Rental: income tax only. Gift: tax-free.">Type</Label>
                <Label tooltip="Annual amount before any tax deductions.">Gross Annual (£)</Label>
                <Label tooltip="How much this income increases each year (e.g. 2 = 2%).">Growth Rate (%)</Label>
                <Label tooltip="Salary only: Percentage you contribute to pension. Deducted before tax.">Employee Pension %</Label>
                <Label tooltip="Salary only: Percentage your employer adds to your pension.">Employer Pension %</Label>
              </div>
              {draft.incomes.map((inc, idx) => {
                const isSalary = inc.kind === "salary";
                return (
                  <div key={idx} className="grid gap-3 md:grid-cols-6">
                    <select
                      className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      value={inc.person_id ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          incomes: d.incomes.map((x, i) => (i === idx ? { ...x, person_id: e.target.value || null } : x))
                        }))
                      }
                    >
                      <option value="">Household</option>
                      {draft.people.filter((p) => !p.is_child).map((p) => (
                        <option key={p.id ?? p.label} value={p.id ?? ""}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      value={inc.kind}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          incomes: d.incomes.map((x, i) => (i === idx ? { ...x, kind: e.target.value } : x))
                        }))
                      }
                    >
                      <option value="salary">Salary</option>
                      <option value="rental">Rental</option>
                      <option value="gift">Gift</option>
                    </select>
                    <input
                      className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      type="number"
                      value={inc.gross_annual}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          incomes: d.incomes.map((x, i) => (i === idx ? { ...x, gross_annual: Number(e.target.value) } : x))
                        }))
                      }
                      placeholder="60000"
                    />
                    <div className="relative">
                      <input
                        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 pr-8 text-sm"
                        type="number"
                        step="0.1"
                        value={Math.round(inc.annual_growth_rate * 10000) / 100}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            incomes: d.incomes.map((x, i) => (i === idx ? { ...x, annual_growth_rate: Number(e.target.value) / 100 } : x))
                          }))
                        }
                        placeholder="2"
                      />
                      <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400">%</div>
                    </div>
                    <div className="relative">
                      <input
                        className={`w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 pr-8 text-sm ${isSalary ? "" : "opacity-40"}`}
                        type="number"
                        step="0.1"
                        value={Math.round(inc.employee_pension_pct * 10000) / 100}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            incomes: d.incomes.map((x, i) => (i === idx ? { ...x, employee_pension_pct: Number(e.target.value) / 100 } : x))
                          }))
                        }
                        placeholder="5"
                        disabled={!isSalary}
                      />
                      <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400">%</div>
                    </div>
                    <div className="relative">
                      <input
                        className={`w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 pr-8 text-sm ${isSalary ? "" : "opacity-40"}`}
                        type="number"
                        step="0.1"
                        value={Math.round(inc.employer_pension_pct * 10000) / 100}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            incomes: d.incomes.map((x, i) => (i === idx ? { ...x, employer_pension_pct: Number(e.target.value) / 100 } : x))
                          }))
                        }
                        placeholder="5"
                        disabled={!isSalary}
                      />
                      <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400">%</div>
                    </div>
                  </div>
                );
              })}
              {draft.incomes.some((inc) => inc.kind === "salary" && (inc.employee_pension_pct > 0 || inc.employer_pension_pct > 0)) &&
                !draft.assets.some((asset) => asset.asset_type === "PENSION") && (
                  <div className="rounded border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-200">
                    <div className="font-medium text-amber-100">Pension contributions need a pension account</div>
                    <p className="mt-1">You have entered pension contributions, but there is no pension asset for them to be invested into.</p>
                    <button
                      type="button"
                      className="mt-2 rounded bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          assets: [
                            ...d.assets,
                            { name: "Pension", asset_type: "PENSION", withdrawal_priority: 10, balance: 0, annual_contribution: 0, growth_rate_mean: 0.05, growth_rate_std: 0.10, contributions_end_at_retirement: false, bond_allocation: 0, person_id: null }
                          ]
                        }))
                      }
                    >
                      Add pension account
                    </button>
                  </div>
                )}
              <Hint>
                Salary income stops when the assigned person retires. Rental and gift income can continue — use the full config editor to set start/end years.
              </Hint>
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    incomes: [
                      ...d.incomes,
                      {
                        kind: "salary",
                        gross_annual: 0,
                        annual_growth_rate: 0,
                        employee_pension_pct: 0,
                        employer_pension_pct: 0,
                        person_id: d.people[0]?.id ?? null
                      }
                    ]
                  }))
                }
              >
                Add income
              </button>
            </div>
          )}

          {step === "assets" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Assets</div>
              <StepIntro>
                Define your investment accounts. The simulation automatically manages cash flow: excess cash is invested (ISA first, then GIA), and assets are withdrawn when needed to cover expenses. Higher withdrawal priority = withdrawn first.
              </StepIntro>
              
              <div className="hidden md:grid md:grid-cols-9 md:gap-3 text-xs text-slate-400">
                <Label tooltip="Optional: link to a person for retirement-aware contributions">Person</Label>
                <Label tooltip="A friendly name for this account">Name</Label>
                <Label tooltip="CASH: Float/emergency fund, not included in withdrawal order. ISA: Tax-free growth & withdrawals. GIA: Taxable gains (CGT may apply). PENSION: Funded via salary pension contributions; withdrawals taxed as income, age-restricted.">Type</Label>
                <Label tooltip="Higher numbers are withdrawn first. Cash accounts are excluded from this order (always used as the float). Suggested: ISA 30, GIA 20, Pension 10.">Priority</Label>
                <Label tooltip="Current value of this account. Starting point for the simulation.">Balance (£)</Label>
                <Label tooltip="Maximum annual investment into this account. 0 = unlimited (within ISA annual limits).">Annual Cap (£)</Label>
                <Label tooltip="Expected average annual return (0.05 = 5%). Used with std dev for Monte Carlo simulation.">Growth Mean</Label>
                <Label tooltip="Volatility of returns. Higher = more variation between simulation runs. Typical stocks: 0.10-0.15">Growth Std</Label>
                <Label tooltip="If checked, new contributions stop when everyone retires. Balance still grows and can be withdrawn.">Stop at Retire</Label>
              </div>
              {draft.assets.map((a, idx) => (
                <div key={idx} className="grid gap-3 md:grid-cols-9 items-center">
                  <select
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={a.person_id ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assets: d.assets.map((x, i) => (i === idx ? { ...x, person_id: e.target.value || null } : x))
                      }))
                    }
                  >
                    <option value="">Household</option>
                    {draft.people.filter((p) => !p.is_child).map((p) => (
                      <option key={p.id ?? p.label} value={p.id ?? ""}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={a.name}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assets: d.assets.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x))
                      }))
                    }
                    placeholder="name"
                  />
                  <select
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={(a as AssetCreate).asset_type ?? "GIA"}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assets: d.assets.map((x, i) => (i === idx ? { ...x, asset_type: e.target.value as AssetCreate["asset_type"] } : x))
                      }))
                    }
                  >
                    <option value="CASH">Cash</option>
                    <option value="ISA">ISA</option>
                    <option value="GIA">GIA</option>
                    <option value="PENSION">Pension</option>
                  </select>
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    type="number"
                    value={(a as AssetCreate).withdrawal_priority ?? 100}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assets: d.assets.map((x, i) => (i === idx ? { ...x, withdrawal_priority: Number(e.target.value) } : x))
                      }))
                    }
                    placeholder="priority"
                  />
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    type="number"
                    value={a.balance}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assets: d.assets.map((x, i) => (i === idx ? { ...x, balance: Number(e.target.value) } : x))
                      }))
                    }
                    placeholder="50000"
                  />
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    type="number"
                    value={a.annual_contribution}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assets: d.assets.map((x, i) => (i === idx ? { ...x, annual_contribution: Number(e.target.value) } : x))
                      }))
                    }
                    placeholder="10000"
                  />
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    type="number"
                    step="0.01"
                    value={a.growth_rate_mean}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assets: d.assets.map((x, i) => (i === idx ? { ...x, growth_rate_mean: Number(e.target.value) } : x))
                      }))
                    }
                    placeholder="0.05"
                  />
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    type="number"
                    step="0.01"
                    value={a.growth_rate_std}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assets: d.assets.map((x, i) => (i === idx ? { ...x, growth_rate_std: Number(e.target.value) } : x))
                      }))
                    }
                    placeholder="0.10"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={a.contributions_end_at_retirement}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          assets: d.assets.map((x, i) => (i === idx ? { ...x, contributions_end_at_retirement: e.target.checked } : x))
                        }))
                      }
                    />
                  </label>
                </div>
              ))}
              <Hint>
                Typical growth: Cash 0%, Bonds 2-3%, Stocks 5-7%. Typical std: Bonds 0.03-0.05, Stocks 0.10-0.15. Pension withdrawals are modelled as 25% tax-free and 75% taxable income.
              </Hint>
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    assets: [...d.assets, { name: "New asset", asset_type: "GIA", withdrawal_priority: 100, balance: 0, annual_contribution: 0, growth_rate_mean: 0.05, growth_rate_std: 0.10, contributions_end_at_retirement: false, bond_allocation: 0, person_id: null }]
                  }))
                }
              >
                Add asset
              </button>
            </div>
          )}

          {step === "property" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Property</div>
              <StepIntro>
                Add any properties (e.g. main home, BTL). Properties are sold in order of withdrawal priority when funds run low — after liquidating financial assets first. Higher priority number = sold first. Mortgages now belong to each property directly.
              </StepIntro>

              {draft.properties.map((prop, idx) => (
                <div key={idx} className="rounded border border-slate-700/60 bg-slate-800/20 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-200">{prop.name}</span>
                    {draft.properties.length > 0 && (
                      <button
                        type="button"
                        className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                        onClick={() =>
                          setDraft((d) => ({ ...d, properties: d.properties.filter((_, i) => i !== idx) }))
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <Label tooltip="A friendly name for this property">Name</Label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        value={prop.name}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            properties: d.properties.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x))
                          }))
                        }
                        placeholder="e.g. Home, BTL"
                      />
                    </div>
                    <div>
                      <Label tooltip="Link to a person for ownership">Person</Label>
                      <select
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        value={prop.person_id ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            properties: d.properties.map((x, i) => (i === idx ? { ...x, person_id: e.target.value || null } : x))
                          }))
                        }
                      >
                        <option value="">Household</option>
                        {draft.people.filter((p) => !p.is_child).map((p) => (
                          <option key={p.id ?? p.label} value={p.id ?? ""}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label tooltip="Current market value">Current Value (£)</Label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        value={prop.value}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            properties: d.properties.map((x, i) => (i === idx ? { ...x, value: Number(e.target.value) } : x))
                          }))
                        }
                        placeholder="300000"
                      />
                    </div>
                    <div>
                      <Label tooltip="Expected average annual appreciation (0.03 = 3%)">Appreciation Mean</Label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        step="0.01"
                        value={prop.appreciation_rate_mean}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            properties: d.properties.map((x, i) => (i === idx ? { ...x, appreciation_rate_mean: Number(e.target.value) } : x))
                          }))
                        }
                        placeholder="0.03"
                      />
                    </div>
                    <div>
                      <Label tooltip="Volatility of property value">Appreciation Std</Label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        step="0.01"
                        value={prop.appreciation_rate_std}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            properties: d.properties.map((x, i) => (i === idx ? { ...x, appreciation_rate_std: Number(e.target.value) } : x))
                          }))
                        }
                        placeholder="0.05"
                      />
                    </div>
                    <div>
                      <Label tooltip="0 for owner-occupied">Monthly Rental Income (£)</Label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        value={prop.monthly_rental_income}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            properties: d.properties.map((x, i) => (i === idx ? { ...x, monthly_rental_income: Number(e.target.value) } : x))
                          }))
                        }
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label tooltip="How much rental income grows each year">Rental Growth Rate</Label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        step="0.01"
                        value={prop.rental_growth_rate}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            properties: d.properties.map((x, i) => (i === idx ? { ...x, rental_growth_rate: Number(e.target.value) } : x))
                          }))
                        }
                        placeholder="0.02"
                      />
                    </div>
                    <div>
                      <Label tooltip="0–1, e.g. 0.95 for 95% occupancy">Occupancy Rate</Label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        step="0.01"
                        min={0}
                        max={1}
                        value={prop.occupancy_rate}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            properties: d.properties.map((x, i) => (i === idx ? { ...x, occupancy_rate: Number(e.target.value) } : x))
                          }))
                        }
                        placeholder="1.0"
                      />
                    </div>
                    <div>
                      <Label tooltip="Loan-to-value at the start of the simulation">Mortgage LTV</Label>
                      <div className="relative mt-1">
                        <input
                          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 pr-8 text-sm"
                          type="number"
                          step="0.1"
                          min={0}
                          max={100}
                          value={Math.round(prop.mortgage_ltv * 10000) / 100}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              properties: d.properties.map((x, i) => (i === idx ? { ...x, mortgage_ltv: Number(e.target.value) / 100 } : x))
                            }))
                          }
                          placeholder="80"
                        />
                        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400">%</div>
                      </div>
                    </div>
                    <div>
                      <Label tooltip="Annual mortgage interest rate for this property">Mortgage Rate</Label>
                      <div className="relative mt-1">
                        <input
                          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 pr-8 text-sm"
                          type="number"
                          step="0.1"
                          min={0}
                          max={100}
                          value={Math.round(prop.mortgage_rate * 10000) / 100}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              properties: d.properties.map((x, i) => (i === idx ? { ...x, mortgage_rate: Number(e.target.value) / 100 } : x))
                            }))
                          }
                          placeholder="4"
                        />
                        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400">%</div>
                      </div>
                    </div>
                    <div>
                      <Label tooltip="0 = interest-only, otherwise years to repay">Mortgage Term (Years)</Label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        min={0}
                        value={prop.mortgage_term_years}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            properties: d.properties.map((x, i) => (i === idx ? { ...x, mortgage_term_years: Number(e.target.value) } : x))
                          }))
                        }
                        placeholder="25"
                      />
                    </div>
                    <div className="rounded border border-slate-700/50 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
                      <div>Mortgage balance: £{Math.round(property_mortgage_balance(prop)).toLocaleString()}</div>
                      <div>Estimated payment: £{Math.round(property_mortgage_monthly_payment(prop)).toLocaleString()}/mo</div>
                    </div>
                    <div>
                      <Label tooltip="Annual maintenance cost">Annual Maintenance (£)</Label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        value={prop.annual_maintenance_cost}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            properties: d.properties.map((x, i) => (i === idx ? { ...x, annual_maintenance_cost: Number(e.target.value) } : x))
                          }))
                        }
                        placeholder="1500"
                      />
                    </div>
                    <div>
                      <Label tooltip="Higher = sold first when liquidating">Withdrawal Priority</Label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        value={prop.withdrawal_priority}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            properties: d.properties.map((x, i) => (i === idx ? { ...x, withdrawal_priority: Number(e.target.value) } : x))
                          }))
                        }
                        placeholder="5"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={prop.maintenance_is_inflation_linked}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              properties: d.properties.map((x, i) => (i === idx ? { ...x, maintenance_is_inflation_linked: e.target.checked } : x))
                            }))
                          }
                        />
                        Maintenance inflation linked
                      </label>
                    </div>
                  </div>
                </div>
              ))}
              <Hint>
                Owner-occupied: set rental income to 0 and occupancy to 1. BTL: set rental income and occupancy as appropriate. For a mortgage, set `LTV`, `Rate`, and either `0` for interest-only or a repayment term in years.
              </Hint>
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    properties: [
                      ...d.properties,
                      {
                        name: "Home",
                        value: 300000,
                        appreciation_rate_mean: 0.03,
                        appreciation_rate_std: 0.05,
                        monthly_rental_income: 0,
                        rental_growth_rate: 0.02,
                        occupancy_rate: 1.0,
                        mortgage_ltv: 0,
                        mortgage_rate: 0.04,
                        mortgage_term_years: 0,
                        annual_maintenance_cost: 1500,
                        maintenance_is_inflation_linked: true,
                        withdrawal_priority: 5,
                        person_id: null
                      }
                    ]
                  }))
                }
              >
                Add property
              </button>
            </div>
          )}

          {step === "expenses" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Expenses</div>
              <StepIntro>
                Define your regular outgoings. These are deducted from cash each year. Inflation-linked expenses grow with inflation, keeping their "real" value constant over time.
              </StepIntro>
              
              <div className="hidden md:grid md:grid-cols-3 md:gap-3 text-xs text-slate-400">
                <Label tooltip="A label for this expense category">Name</Label>
                <Label tooltip="Monthly cost in today's money. Multiplied by 12 for annual simulation.">Monthly Amount (£)</Label>
                <Label tooltip="If enabled, this expense grows with inflation each year. Disable for fixed costs like a fixed-rate utility contract.">Inflation Linked</Label>
              </div>
              {draft.expenses.map((ex, idx) => (
                <div key={idx} className="grid gap-3 md:grid-cols-3 items-center">
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={ex.name}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        expenses: d.expenses.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x))
                      }))
                    }
                    placeholder="e.g. Household, Childcare"
                  />
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    type="number"
                    value={ex.monthly_amount}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        expenses: d.expenses.map((x, i) => (i === idx ? { ...x, monthly_amount: Number(e.target.value) } : x))
                      }))
                    }
                    placeholder="2500"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={ex.is_inflation_linked}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          expenses: d.expenses.map((x, i) => (i === idx ? { ...x, is_inflation_linked: e.target.checked } : x))
                        }))
                      }
                    />
                    Inflation linked
                  </label>
                </div>
              ))}
              <Hint>
                These expenses run throughout the simulation. In retirement, the "Annual spend target" (set in Assumptions) may add additional spending if you want to model a lifestyle budget.
              </Hint>
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                onClick={() => setDraft((d) => ({ ...d, expenses: [...d.expenses, { name: "New expense", monthly_amount: 0, is_inflation_linked: true }] }))}
              >
                Add expense
              </button>
            </div>
          )}

          {step === "assumptions" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Assumptions</div>
              <StepIntro>
                These global settings shape the economic environment of your simulation. The Monte Carlo engine runs many iterations with randomised investment returns to show a range of possible outcomes.
              </StepIntro>
              
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <Label tooltip="Annual inflation rate. Affects inflation-linked expenses and real-value calculations.">Inflation Rate (%)</Label>
                  <div className="relative mt-1">
                    <input
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 pr-8 text-sm"
                      type="number"
                      step="0.1"
                      value={(draft.assumptions.inflation_rate ?? 0) * 100}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          assumptions: { ...d.assumptions, inflation_rate: Number(e.target.value) / 100 }
                        }))
                      }
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400">%</div>
                  </div>
                  <Hint>UK long-term average: ~2%. Higher inflation erodes purchasing power faster.</Hint>
                </div>
                
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <Label tooltip="Maximum annual ISA contribution (currently £20,000 in the UK). Excess cash goes to GIA instead.">ISA Annual Limit (£)</Label>
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={String(draft.assumptions.isa_annual_limit ?? "")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assumptions: { ...d.assumptions, isa_annual_limit: Number(e.target.value) }
                      }))
                    }
                  />
                  <Hint>The simulation prioritises ISA contributions up to this limit each year.</Hint>
                </div>
                
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <Label tooltip="Annual UK state pension amount. Paid to each person once they reach state pension age and modelled as taxable income for that person.">State Pension Annual (£)</Label>
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={String(draft.assumptions.state_pension_annual ?? "")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assumptions: { ...d.assumptions, state_pension_annual: Number(e.target.value) }
                      }))
                    }
                  />
                  <Hint>Full new state pension (2024): ~£11,500. It is taxable income and can use up personal allowance. Check gov.uk for your forecast.</Hint>
                </div>
                
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <Label tooltip="Minimum age to access private pension funds. UK is 55 now, rising to 57 in 2028.">Pension Access Age</Label>
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    type="number"
                    value={draft.assumptions.pension_access_age ?? 55}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assumptions: { ...d.assumptions, pension_access_age: Number(e.target.value) }
                      }))
                    }
                    min={50}
                    max={75}
                  />
                  <Hint>The simulation won't allow pension withdrawals until each person reaches this age.</Hint>
                </div>
                
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <Label tooltip="First year of the simulation. Usually the current year.">Start Year</Label>
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={String(draft.assumptions.start_year ?? "")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assumptions: { ...d.assumptions, start_year: Number(e.target.value) }
                      }))
                    }
                  />
                  <Hint>The simulation begins from this year using your current balances.</Hint>
                </div>
                
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <Label tooltip="Last year of the simulation. Set this to cover your expected lifespan.">End Year</Label>
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={String(draft.assumptions.end_year ?? "")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assumptions: { ...d.assumptions, end_year: Number(e.target.value) }
                      }))
                    }
                  />
                  <Hint>Run until age ~90+ to see if your money lasts. Longer = more uncertainty.</Hint>
                </div>
                
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <Label tooltip="Extra spending added on top of your configured expenses. It phases in by retired adult share (one of two adults retired = 50%) and grows with inflation. This is the same value as the 'Extra spend (retired)' slider on the dashboard.">Extra Retirement Spending (£)</Label>
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={String(draft.assumptions.annual_spend_target ?? "")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assumptions: { ...d.assumptions, annual_spend_target: Number(e.target.value) }
                      }))
                    }
                  />
                  <Hint>Set to 0 for no extra spending in retirement. This is added on top of your regular expenses, not instead of them.</Hint>
                </div>
              </div>
            </div>
          )}

          {step === "summary" && (() => {
            const adults = draft.people.filter((p) => !p.is_child);
            const statePensionAnnual = draft.assumptions.state_pension_annual ?? 0;

            const sellOrder = [
              ...draft.assets
                .filter((a) => (a as AssetCreate).asset_type !== "CASH")
                .map((a) => ({
                  name: a.name,
                  type: (a as AssetCreate).asset_type ?? "GIA",
                  balance: a.balance,
                  priority: (a as AssetCreate).withdrawal_priority ?? 100,
                })),
              ...draft.properties.map((p) => ({
                name: p.name,
                type: "PROPERTY",
                balance: p.value,
                priority: p.withdrawal_priority,
              })),
            ].sort((a, b) => b.priority - a.priority);

            const totalIncome =
              draft.incomes.reduce((s, i) => s + i.gross_annual, 0) +
              adults.length * statePensionAnnual;

            const totalExpensesAnnual = draft.expenses.reduce((s, e) => s + e.monthly_amount * 12, 0);
            const totalMortgageBalance = draft.properties.reduce(
              (sum, property) => sum + property_mortgage_balance(property),
              0
            );
            const mortgageAnnual = draft.properties.reduce(
              (sum, property) => sum + property_mortgage_monthly_payment(property) * 12,
              0
            );
            const grandTotalOutgoings = totalExpensesAnnual + mortgageAnnual;

            const personLabel = (id: string | null) =>
              id ? adults.find((p) => p.id === id)?.label ?? "Household" : "Household";

            return (
              <div className="space-y-6">
                <div className="text-sm font-semibold">Summary</div>
                <StepIntro>
                  Here's your complete scenario configuration. After finishing, you can run simulations to see projected outcomes, or return to edit any section.
                </StepIntro>

                <div className="space-y-4">
                  <section className="rounded border border-slate-700/50 bg-slate-800/20 p-4">
                    <h3 className="text-sm font-medium text-slate-300">Asset sell order</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Higher priority = withdrawn/sold first. CASH accounts are excluded (used as float).
                    </p>
                    {sellOrder.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">No assets in sell order</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <div className="grid grid-cols-[1fr_5rem_6rem_5rem] gap-2 px-3 text-xs text-slate-500">
                          <span>Name</span>
                          <span>Type</span>
                          <span className="text-right">Value</span>
                          <span className="text-right">Priority</span>
                        </div>
                        {sellOrder.map((item, i) => (
                          <div key={`${item.name}-${i}`} className="grid grid-cols-[1fr_5rem_6rem_5rem] gap-2 items-center rounded bg-slate-900/50 px-3 py-2 text-sm">
                            <span className="font-medium text-slate-200 truncate">{item.name}</span>
                            <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-400 text-center">
                              {item.type}
                            </span>
                            <span className="text-slate-300 text-right">£{item.balance.toLocaleString()}</span>
                            <span className="text-xs text-slate-500 text-right">{item.priority}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="rounded border border-slate-700/50 bg-slate-800/20 p-4">
                    <h3 className="text-sm font-medium text-slate-300">Income summary</h3>
                    <p className="mt-1 text-sm font-semibold text-emerald-400">
                      Total gross annual: £{totalIncome.toLocaleString()}
                    </p>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700 text-left text-xs text-slate-400">
                            <th className="pb-2 pr-4">Person</th>
                            <th className="pb-2 pr-4">Type</th>
                            <th className="pb-2">Annual (£)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {draft.incomes.map((inc, idx) => (
                            <tr key={idx} className="border-b border-slate-800">
                              <td className="py-2 pr-4 text-slate-300">{personLabel(inc.person_id ?? null)}</td>
                              <td className="py-2 pr-4 text-slate-300 capitalize">{inc.kind}</td>
                              <td className="py-2 text-slate-200">£{inc.gross_annual.toLocaleString()}</td>
                            </tr>
                          ))}
                          {adults.map((p) => (
                            <tr key={`sp-${p.id ?? p.label}`} className="border-b border-slate-800">
                              <td className="py-2 pr-4 text-slate-300">{p.label}</td>
                              <td className="py-2 pr-4 text-slate-300">State pension</td>
                              <td className="py-2 text-slate-200">£{statePensionAnnual.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="rounded border border-slate-700/50 bg-slate-800/20 p-4">
                    <h3 className="text-sm font-medium text-slate-300">Property mortgage summary</h3>
                    {draft.properties.filter((property) => property_mortgage_balance(property) > 0).length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">No property mortgages configured.</p>
                    ) : (
                      <>
                        <p className="mt-1 text-sm font-semibold text-sky-400">
                          Total mortgage balance: £{Math.round(totalMortgageBalance).toLocaleString()}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                          Total annual mortgage cost: £{Math.round(mortgageAnnual).toLocaleString()}
                        </p>
                        <div className="mt-3 space-y-2">
                          {draft.properties
                            .filter((property) => property_mortgage_balance(property) > 0)
                            .map((property, index) => (
                              <div key={`${property.name}-${index}`} className="flex items-center justify-between gap-4 rounded bg-slate-900/50 px-3 py-2 text-sm">
                                <div>
                                  <div className="text-slate-200">{property.name}</div>
                                  <div className="text-xs text-slate-400">
                                    {Math.round(property.mortgage_ltv * 1000) / 10}% LTV, {Math.round(property.mortgage_rate * 1000) / 10}% rate, {property.mortgage_term_years === 0 ? "interest-only" : `${property.mortgage_term_years} years`}
                                  </div>
                                </div>
                                <div className="text-right text-slate-300">
                                  <div>£{Math.round(property_mortgage_balance(property)).toLocaleString()}</div>
                                  <div className="text-xs text-slate-400">£{Math.round(property_mortgage_monthly_payment(property)).toLocaleString()}/mo</div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </>
                    )}
                  </section>

                  <section className="rounded border border-slate-700/50 bg-slate-800/20 p-4">
                    <h3 className="text-sm font-medium text-slate-300">Expenditure summary</h3>
                    <p className="mt-1 text-sm font-semibold text-rose-400">
                      Grand total annual: £{grandTotalOutgoings.toLocaleString()}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {draft.expenses.map((ex, idx) => (
                        <li key={idx} className="flex items-center justify-between gap-4 rounded bg-slate-900/50 px-3 py-2 text-sm">
                          <span className="text-slate-200">{ex.name}</span>
                          <span className="text-slate-300">
                            £{ex.monthly_amount.toLocaleString()}/mo → £{(ex.monthly_amount * 12).toLocaleString()}/yr
                          </span>
                          {ex.is_inflation_linked && (
                            <span className="rounded px-2 py-0.5 text-xs text-amber-600 bg-amber-950/50">Inflation linked</span>
                          )}
                        </li>
                      ))}
                      {draft.properties
                        .filter((property) => property_mortgage_monthly_payment(property) > 0)
                        .map((property) => {
                          const monthly_payment = property_mortgage_monthly_payment(property);
                          return (
                        <li className="flex items-center justify-between gap-4 rounded bg-slate-900/50 px-3 py-2 text-sm">
                          <span className="text-slate-200">{property.name} mortgage</span>
                          <span className="text-slate-300">
                            £{Math.round(monthly_payment).toLocaleString()}/mo → £{Math.round(monthly_payment * 12).toLocaleString()}/yr
                          </span>
                        </li>
                          );
                        })}
                    </ul>
                    <p className="mt-2 text-xs text-slate-500">
                      Expenses: £{totalExpensesAnnual.toLocaleString()}/yr
                      {mortgageAnnual > 0 ? ` + Mortgage: £${Math.round(mortgageAnnual).toLocaleString()}/yr` : ""}
                    </p>
                  </section>
                </div>

                <details className="rounded border border-slate-700/50 bg-slate-800/20">
                  <summary className="cursor-pointer px-3 py-2 text-sm text-slate-300 hover:text-white">
                    View raw JSON configuration
                  </summary>
                  <pre className="max-h-[400px] overflow-auto p-3 text-xs text-slate-200">
                    {JSON.stringify(draft, null, 2)}
                  </pre>
                </details>

                <div className="flex justify-end">
                  <button
                    type="button"
                    className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
                    disabled={!scenario_id}
                    onClick={() => navigate(`/config?selected=${encodeURIComponent(scenario_id ?? "")}`)}
                  >
                    Finish and view scenario
                  </button>
                </div>
              </div>
            );
          })()}

          <div className="flex items-center justify-between border-t border-slate-800 pt-4">
            <button
              type="button"
              className="rounded bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
              disabled={is_working || step === "people"}
              onClick={prev_step}
            >
              Back
            </button>
            <div className="flex gap-3">
              {step !== "summary" && (
                <button
                  type="button"
                  className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
                  disabled={is_working || !scenario_id}
                  onClick={async () => {
                    const next = draft;
                    await persist_now(next);
                    await next_step();
                  }}
                >
                  Save and continue
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
