import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ScenarioCreate, ScenarioRead } from "../../types";
import { create_scenario, update_scenario } from "../../api/client";

type StepId =
  | "start"
  | "people"
  | "income"
  | "assets"
  | "mortgage"
  | "expenses"
  | "assumptions"
  | "review";

const STEPS: { id: StepId; label: string }[] = [
  { id: "start", label: "Start" },
  { id: "people", label: "People" },
  { id: "income", label: "Income" },
  { id: "assets", label: "Assets" },
  { id: "mortgage", label: "Mortgage" },
  { id: "expenses", label: "Expenses" },
  { id: "assumptions", label: "Assumptions" },
  { id: "review", label: "Review" }
];

function default_draft(): ScenarioCreate {
  const year = new Date().getFullYear();
  return {
    name: "New scenario",
    assumptions: {
      inflation_rate: 0.02,
      equity_return_mean: 0.05,
      equity_return_std: 0.1,
      isa_annual_limit: 20000,
      state_pension_annual: 11500,
      start_year: year,
      end_year: year + 60,
      annual_spend_target: 30000
    },
    people: [{ id: null, label: "you", birth_date: "1985-01-01", planned_retirement_age: 60, state_pension_age: 67 }],
    incomes: [{ kind: "salary", gross_annual: 60000, annual_growth_rate: 0.02, employee_pension_pct: 0.05, employer_pension_pct: 0.05, person_id: null }],
    assets: [
      { name: "ISA", asset_type: "ISA", withdrawal_priority: 20, balance: 50000, annual_contribution: 10000, growth_rate_mean: 0.05, growth_rate_std: 0.10, contributions_end_at_retirement: false, person_id: null },
      { name: "Pension", asset_type: "PENSION", withdrawal_priority: 30, balance: 150000, annual_contribution: 0, growth_rate_mean: 0.05, growth_rate_std: 0.10, contributions_end_at_retirement: false, person_id: null },
      { name: "Cash", asset_type: "CASH", withdrawal_priority: 0, balance: 20000, annual_contribution: 0, growth_rate_mean: 0.0, growth_rate_std: 0.0, contributions_end_at_retirement: false, person_id: null }
    ],
    mortgage: null,
    expenses: [{ name: "Household", monthly_amount: 2500, is_inflation_linked: true }]
  };
}

function to_draft(scenario: ScenarioRead): ScenarioCreate {
  return {
    name: scenario.name,
    assumptions: scenario.assumptions,
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
      person_id: i.person_id ?? null
    })),
    assets: scenario.assets.map((a) => ({
      name: a.name,
      asset_type: ((a as any).asset_type ?? (a.name.toLowerCase().includes("cash") ? "CASH" : a.name.toLowerCase().includes("isa") ? "ISA" : a.name.toLowerCase().includes("pension") ? "PENSION" : "GIA")) as any,
      withdrawal_priority: ((a as any).withdrawal_priority ?? 100) as number,
      balance: a.balance,
      annual_contribution: a.annual_contribution,
      growth_rate_mean: a.growth_rate_mean,
      growth_rate_std: a.growth_rate_std,
      contributions_end_at_retirement: a.contributions_end_at_retirement,
      person_id: a.person_id ?? null
    })),
    mortgage: scenario.mortgage ?? null,
    expenses: scenario.expenses.map((e) => ({
      name: e.name,
      monthly_amount: e.monthly_amount,
      is_inflation_linked: e.is_inflation_linked
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
    const next = STEPS[Math.min(STEPS.length - 1, idx + 1)]?.id ?? "review";
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
            We create the scenario in the database first, then save updates page-by-page.
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
          <div className="h-full bg-indigo-600" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={`rounded px-2 py-1 ${
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
          <div>
            <label className="block text-sm font-medium">Scenario name</label>
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
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
                  const created: ScenarioRead = await create_scenario({ name: draft.name, assumptions: {}, people: [], incomes: [], assets: [], mortgage: null, expenses: [] });
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
              <div className="hidden md:grid md:grid-cols-4 md:gap-3 text-xs text-slate-400">
                <div>Name</div>
                <div>DoB</div>
                <div>Retirement_age</div>
                <div>State_pension_age</div>
              </div>
              {draft.people.map((p, idx) => (
                <div key={idx} className="grid gap-3 md:grid-cols-4">
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={p.label}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        people: d.people.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x))
                      }))
                    }
                    placeholder="label"
                  />
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={p.birth_date}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        people: d.people.map((x, i) => (i === idx ? { ...x, birth_date: e.target.value } : x))
                      }))
                    }
                    placeholder="YYYY-MM-DD"
                  />
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    type="number"
                    value={p.planned_retirement_age}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        people: d.people.map((x, i) =>
                          i === idx ? { ...x, planned_retirement_age: Number(e.target.value) } : x
                        )
                      }))
                    }
                    placeholder="retirement age"
                  />
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    type="number"
                    value={p.state_pension_age}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        people: d.people.map((x, i) => (i === idx ? { ...x, state_pension_age: Number(e.target.value) } : x))
                      }))
                    }
                    placeholder="state pension age"
                  />
                </div>
              ))}
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
                        state_pension_age: 67
                      }
                    ]
                  }))
                }
              >
                Add person
              </button>
            </div>
          )}

          {step === "income" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Income</div>
              <div className="hidden md:grid md:grid-cols-6 md:gap-3 text-xs text-slate-400">
                <div>Person</div>
                <div>Type</div>
                <div>Gross_annual</div>
                <div>Growth_rate</div>
                <div>Employee_pension_pct</div>
                <div>Employer_pension_pct</div>
              </div>
              {draft.incomes.map((inc, idx) => (
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
                    {draft.people.map((p) => (
                      <option key={p.id ?? p.label} value={p.id ?? ""}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={inc.kind}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        incomes: d.incomes.map((x, i) => (i === idx ? { ...x, kind: e.target.value } : x))
                      }))
                    }
                    placeholder="kind"
                  />
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
                    placeholder="gross annual"
                  />
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    type="number"
                    step="0.01"
                    value={inc.annual_growth_rate}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        incomes: d.incomes.map((x, i) => (i === idx ? { ...x, annual_growth_rate: Number(e.target.value) } : x))
                      }))
                    }
                    placeholder="growth"
                  />
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    type="number"
                    step="0.01"
                    value={inc.employee_pension_pct}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        incomes: d.incomes.map((x, i) => (i === idx ? { ...x, employee_pension_pct: Number(e.target.value) } : x))
                      }))
                    }
                    placeholder="employee pension %"
                  />
                  <input
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    type="number"
                    step="0.01"
                    value={inc.employer_pension_pct}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        incomes: d.incomes.map((x, i) => (i === idx ? { ...x, employer_pension_pct: Number(e.target.value) } : x))
                      }))
                    }
                    placeholder="employer pension %"
                  />
                </div>
              ))}
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
              <div className="hidden md:grid md:grid-cols-9 md:gap-3 text-xs text-slate-400">
                <div>Person</div>
                <div>Name</div>
                <div>Type</div>
                <div>Withdraw_priority</div>
                <div>Balance</div>
                <div>Annual_invest_cap</div>
                <div>Growth_mean</div>
                <div>Growth_std</div>
                <div>End_at_retire</div>
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
                    {draft.people.map((p) => (
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
                    value={(a as any).asset_type ?? "GIA"}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assets: d.assets.map((x, i) => (i === idx ? { ...x, asset_type: e.target.value as any } : x))
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
                    value={(a as any).withdrawal_priority ?? 100}
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
                    placeholder="balance"
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
                    placeholder="annual invest cap"
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
                    placeholder="growth mean"
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
                    placeholder="growth std"
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
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    assets: [...d.assets, { name: "New asset", asset_type: "GIA", withdrawal_priority: 100, balance: 0, annual_contribution: 0, growth_rate_mean: 0.05, growth_rate_std: 0.10, contributions_end_at_retirement: false, person_id: null }]
                  }))
                }
              >
                Add asset
              </button>
            </div>
          )}

          {step === "mortgage" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Mortgage</div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.mortgage !== null}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      mortgage: e.target.checked ? { balance: 0, annual_interest_rate: 0.04, monthly_payment: 0, months_remaining: 0 } : null
                    }))
                  }
                />
                Has mortgage
              </label>
              {draft.mortgage !== null && (
                <div className="grid gap-3 md:grid-cols-4">
                  {[
                    ["balance", "Balance"],
                    ["annual_interest_rate", "Annual interest rate"],
                    ["monthly_payment", "Monthly payment"],
                    ["months_remaining", "Months remaining"]
                  ].map(([k, label]) => (
                    <div key={k}>
                      <label className="block text-sm font-medium">{label}</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        step={k === "annual_interest_rate" ? "0.01" : "1"}
                        value={(draft.mortgage as any)[k]}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            mortgage: d.mortgage ? { ...d.mortgage, [k]: Number(e.target.value) } : null
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "expenses" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Expenses</div>
              <div className="hidden md:grid md:grid-cols-3 md:gap-3 text-xs text-slate-400">
                <div>Name</div>
                <div>Monthly_amount</div>
                <div>Inflation_linked</div>
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
                    placeholder="name"
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
                    placeholder="monthly amount"
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
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["inflation_rate", "Inflation rate"],
                  ["equity_return_mean", "Equity return mean"],
                  ["equity_return_std", "Equity return std dev"],
                  ["isa_annual_limit", "ISA annual limit"],
                  ["state_pension_annual", "State pension annual"],
                  ["start_year", "Start year"],
                  ["end_year", "End year"],
                  ["annual_spend_target", "Annual spend target"]
                ].map(([k, label]) => (
                  <div key={k}>
                    <label className="block text-sm font-medium">{label}</label>
                    <input
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      value={String((draft.assumptions as any)[k] ?? "")}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          assumptions: { ...(d.assumptions as any), [k]: Number(e.target.value) }
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Review</div>
              <p className="text-sm text-slate-300">
                This is the configuration that will be used by the simulator. You can still edit it later on the Config page.
              </p>
              <pre className="max-h-[520px] overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-200">
                {JSON.stringify(draft, null, 2)}
              </pre>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
                  disabled={!scenario_id}
                  onClick={() => navigate(`/config?selected=${encodeURIComponent(scenario_id ?? "")}`)}
                >
                  Finish
                </button>
              </div>
            </div>
          )}

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
              {step !== "review" && (
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

