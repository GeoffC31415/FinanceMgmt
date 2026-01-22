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
              <StepIntro>
                Add everyone whose finances you want to model. The simulation uses each person's age to determine when they retire, when they receive state pension, and when they can access private pensions (age 55+).
              </StepIntro>
              
              <div className="hidden md:grid md:grid-cols-4 md:gap-3 text-xs text-slate-400">
                <Label tooltip="A friendly name to identify this person in the scenario">Name</Label>
                <Label tooltip="Used to calculate current age and project retirement timing">Date of Birth</Label>
                <Label tooltip="When salary income stops and retirement spending begins. Can be different from state pension age.">Retirement Age</Label>
                <Label tooltip="When UK state pension payments start (currently 66-67 for most people)">State Pension Age</Label>
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
                    placeholder="e.g. you, partner"
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
                    placeholder="e.g. 60"
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
                    placeholder="e.g. 67"
                  />
                </div>
              ))}
              <Hint>
                Salary stops at retirement age. Private pension access requires age 55+. State pension begins at state pension age.
              </Hint>
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
                <Label tooltip="How much this income increases each year (e.g. 0.02 = 2%).">Growth Rate</Label>
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
                      {draft.people.map((p) => (
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
                      placeholder="0.02"
                    />
                    <input
                      className={`rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm ${isSalary ? "" : "opacity-40"}`}
                      type="number"
                      step="0.01"
                      value={inc.employee_pension_pct}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          incomes: d.incomes.map((x, i) => (i === idx ? { ...x, employee_pension_pct: Number(e.target.value) } : x))
                        }))
                      }
                      placeholder="0.05"
                      disabled={!isSalary}
                    />
                    <input
                      className={`rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm ${isSalary ? "" : "opacity-40"}`}
                      type="number"
                      step="0.01"
                      value={inc.employer_pension_pct}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          incomes: d.incomes.map((x, i) => (i === idx ? { ...x, employer_pension_pct: Number(e.target.value) } : x))
                        }))
                      }
                      placeholder="0.05"
                      disabled={!isSalary}
                    />
                  </div>
                );
              })}
              <Hint>
                Salary income stops when the assigned person retires. Rental and gift income can continue — use the full config editor to set start/end years. Use decimal format for percentages (0.05 = 5%).
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
                Define your investment accounts. The simulation automatically manages cash flow: excess cash is invested (ISA first, then GIA), and assets are withdrawn when needed to cover expenses. Lower withdrawal priority = withdrawn first.
              </StepIntro>
              
              <div className="hidden md:grid md:grid-cols-9 md:gap-3 text-xs text-slate-400">
                <Label tooltip="Optional: link to a person for retirement-aware contributions">Person</Label>
                <Label tooltip="A friendly name for this account">Name</Label>
                <Label tooltip="CASH: Emergency fund, no growth. ISA: Tax-free growth & withdrawals. GIA: Taxable gains. PENSION: Managed separately via income contributions.">Type</Label>
                <Label tooltip="Lower numbers are withdrawn first when cash is needed. Cash is always 0, so ISA (20) is used before Pension (30).">Priority</Label>
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
                Typical growth: Cash 0%, Bonds 2-3%, Stocks 5-7%. Typical std: Bonds 0.03-0.05, Stocks 0.10-0.15. Pensions are drawn at age 55+ and taxed as income.
              </Hint>
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
              <StepIntro>
                If you have a mortgage, it's deducted as a fixed monthly expense. The simulation tracks the declining balance and stops payments when the mortgage is paid off. This is modelled separately from other expenses.
              </StepIntro>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.mortgage !== null}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      mortgage: e.target.checked ? { balance: 0, annual_interest_rate: 0.04, monthly_payment: 0 } : null
                    }))
                  }
                />
                I have a mortgage to include
              </label>
              {draft.mortgage !== null && (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <Label tooltip="Current outstanding mortgage balance">Balance (£)</Label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        value={draft.mortgage.balance}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            mortgage: d.mortgage ? { ...d.mortgage, balance: Number(e.target.value) } : null
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label tooltip="Your current mortgage interest rate as a decimal (0.04 = 4%)">Annual Interest Rate</Label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        step="0.01"
                        value={draft.mortgage.annual_interest_rate}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            mortgage: d.mortgage ? { ...d.mortgage, annual_interest_rate: Number(e.target.value) } : null
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label tooltip="Your current monthly mortgage payment. Stays fixed until paid off.">Monthly Payment (£)</Label>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        type="number"
                        value={draft.mortgage.monthly_payment}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            mortgage: d.mortgage ? { ...d.mortgage, monthly_payment: Number(e.target.value) } : null
                          }))
                        }
                      />
                    </div>
                  </div>
                  <Hint>
                    The simulation amortises the mortgage and tracks when it's paid off. Once complete, the monthly payment is freed up for other uses.
                  </Hint>
                </>
              )}
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
                      value={((draft.assumptions as any).inflation_rate ?? 0) * 100}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          assumptions: { ...(d.assumptions as any), inflation_rate: Number(e.target.value) / 100 }
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
                    value={String((draft.assumptions as any).isa_annual_limit ?? "")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assumptions: { ...(d.assumptions as any), isa_annual_limit: Number(e.target.value) }
                      }))
                    }
                  />
                  <Hint>The simulation prioritises ISA contributions up to this limit each year.</Hint>
                </div>
                
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <Label tooltip="Annual UK state pension amount. Paid to each person once they reach state pension age.">State Pension Annual (£)</Label>
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={String((draft.assumptions as any).state_pension_annual ?? "")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assumptions: { ...(d.assumptions as any), state_pension_annual: Number(e.target.value) }
                      }))
                    }
                  />
                  <Hint>Full new state pension (2024): ~£11,500. Check gov.uk for your forecast.</Hint>
                </div>
                
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <Label tooltip="Minimum age to access private pension funds. UK is 55 now, rising to 57 in 2028.">Pension Access Age</Label>
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    type="number"
                    value={(draft.assumptions as any).pension_access_age ?? 55}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assumptions: { ...(d.assumptions as any), pension_access_age: Number(e.target.value) }
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
                    value={String((draft.assumptions as any).start_year ?? "")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assumptions: { ...(d.assumptions as any), start_year: Number(e.target.value) }
                      }))
                    }
                  />
                  <Hint>The simulation begins from this year using your current balances.</Hint>
                </div>
                
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <Label tooltip="Last year of the simulation. Set this to cover your expected lifespan.">End Year</Label>
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={String((draft.assumptions as any).end_year ?? "")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assumptions: { ...(d.assumptions as any), end_year: Number(e.target.value) }
                      }))
                    }
                  />
                  <Hint>Run until age ~90+ to see if your money lasts. Longer = more uncertainty.</Hint>
                </div>
                
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <Label tooltip="Target annual spending in retirement. If defined expenses are less than this, the simulation adds extra spending to meet this lifestyle budget.">Annual Spend Target (£)</Label>
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={String((draft.assumptions as any).annual_spend_target ?? "")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        assumptions: { ...(d.assumptions as any), annual_spend_target: Number(e.target.value) }
                      }))
                    }
                  />
                  <Hint>Set to 0 to only use defined expenses. Otherwise, this is your retirement "lifestyle" target.</Hint>
                </div>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Review</div>
              <StepIntro>
                Here's your complete scenario configuration. After finishing, you can run simulations to see projected outcomes, or return to edit any section.
              </StepIntro>
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <div className="text-xs font-medium text-slate-400">People</div>
                  <div className="mt-1 text-sm">{draft.people.length} person(s)</div>
                </div>
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <div className="text-xs font-medium text-slate-400">Income Sources</div>
                  <div className="mt-1 text-sm">{draft.incomes.length} income(s)</div>
                </div>
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <div className="text-xs font-medium text-slate-400">Assets</div>
                  <div className="mt-1 text-sm">{draft.assets.length} account(s)</div>
                </div>
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <div className="text-xs font-medium text-slate-400">Mortgage</div>
                  <div className="mt-1 text-sm">{draft.mortgage ? `£${draft.mortgage.balance.toLocaleString()}` : "None"}</div>
                </div>
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <div className="text-xs font-medium text-slate-400">Expenses</div>
                  <div className="mt-1 text-sm">{draft.expenses.length} expense(s)</div>
                </div>
                <div className="rounded border border-slate-700/50 bg-slate-800/20 p-3">
                  <div className="text-xs font-medium text-slate-400">Simulation Period</div>
                  <div className="mt-1 text-sm">{(draft.assumptions as any).start_year} – {(draft.assumptions as any).end_year}</div>
                </div>
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
