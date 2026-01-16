import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { ScenarioCreate } from "../../types";
import { useScenarioCreate, useScenarioDetail, useScenarioList } from "../../hooks/useScenario";
import { ScenarioForm } from "./ScenarioForm";

function DeleteConfirmModal({
  scenario_name,
  is_open,
  is_deleting,
  on_confirm,
  on_cancel
}: {
  scenario_name: string;
  is_open: boolean;
  is_deleting: boolean;
  on_confirm: () => void;
  on_cancel: () => void;
}) {
  if (!is_open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-900/50">
            <svg className="h-5 w-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Delete Scenario</h3>
        </div>
        <p className="mb-6 text-sm text-slate-300">
          Are you sure you want to delete <span className="font-medium text-white">"{scenario_name}"</span>? 
          This action cannot be undone and all associated data will be permanently removed.
        </p>
        <div className="flex justify-end gap-3">
          <button
            className="rounded px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            onClick={on_cancel}
            disabled={is_deleting}
          >
            Cancel
          </button>
          <button
            className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
            onClick={on_confirm}
            disabled={is_deleting}
          >
            {is_deleting ? "Deleting..." : "Delete Scenario"}
          </button>
        </div>
      </div>
    </div>
  );
}

const EMPTY_SCENARIO: ScenarioCreate = {
  name: "My Scenario",
  assumptions: {
    inflation_rate: 0.02,
    equity_return_mean: 0.05,
    equity_return_std: 0.1,
    isa_annual_limit: 20000,
    state_pension_annual: 11500,
    start_year: new Date().getFullYear(),
    end_year: new Date().getFullYear() + 60,
    annual_spend_target: 30000
  },
  people: [
    {
      label: "you",
      birth_date: "1985-01-01",
      planned_retirement_age: 60,
      state_pension_age: 67
    }
  ],
  incomes: [
    {
      kind: "salary",
      gross_annual: 60000,
      annual_growth_rate: 0.02,
      employee_pension_pct: 0.05,
      employer_pension_pct: 0.05
    }
  ],
  assets: [
    { name: "ISA", asset_type: "ISA", withdrawal_priority: 30, balance: 50000, annual_contribution: 10000, growth_rate_mean: 0.05, growth_rate_std: 0.10, contributions_end_at_retirement: false },
    { name: "Pension", asset_type: "PENSION", withdrawal_priority: 10, balance: 150000, annual_contribution: 0, growth_rate_mean: 0.05, growth_rate_std: 0.10, contributions_end_at_retirement: false },
    { name: "Cash", asset_type: "CASH", withdrawal_priority: 0, balance: 20000, annual_contribution: 0, growth_rate_mean: 0.0, growth_rate_std: 0.0, contributions_end_at_retirement: false }
  ],
  mortgage: { balance: 200000, annual_interest_rate: 0.04, monthly_payment: 1200, months_remaining: 300 },
  expenses: [{ name: "Household", monthly_amount: 2500, is_inflation_linked: true }]
};

export function ScenarioConfigPage() {
  const location = useLocation();
  const { scenarios, is_loading, error, refresh } = useScenarioList();
  const { create, is_loading: is_creating, error: create_error } = useScenarioCreate();

  const [selected_id, setSelectedId] = useState<string | null>(null);
  const { scenario, is_loading: is_loading_detail, error: detail_error, save, remove } = useScenarioDetail(selected_id);
  const [save_error, setSaveError] = useState<string | null>(null);
  const [is_saving, setIsSaving] = useState(false);
  const [show_delete_modal, setShowDeleteModal] = useState(false);
  const [is_deleting, setIsDeleting] = useState(false);
  const [delete_error, setDeleteError] = useState<string | null>(null);

  const selected_label = useMemo(() => scenarios.find((s) => s.id === selected_id)?.name ?? "", [scenarios, selected_id]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const selected = params.get("selected");
    if (selected) setSelectedId(selected);
  }, [location.search]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Configuration</h1>
          <p className="text-slate-300">Create and load scenarios. Next step adds full tabbed forms.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/config/wizard"
            className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700"
          >
            Walkthrough
          </Link>
          <button
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
            disabled={is_creating}
            onClick={async () => {
              const created = await create(EMPTY_SCENARIO);
              await refresh();
              setSelectedId(created.id);
            }}
          >
            Create starter scenario
          </button>
        </div>
      </div>

      {(error || create_error || delete_error) && (
        <div className="rounded border border-rose-800 bg-rose-950 px-4 py-3 text-sm text-rose-200">
          {error || create_error || delete_error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded border border-slate-800 bg-slate-900/30 md:col-span-1">
          <div className="border-b border-slate-800 px-4 py-3">
            <div className="text-sm font-semibold">Saved scenarios</div>
          </div>
          <div className="p-4 max-h-[70vh] overflow-auto">
            {is_loading ? (
              <div className="text-sm text-slate-300">Loading...</div>
            ) : scenarios.length === 0 ? (
              <div className="text-sm text-slate-300">No scenarios yet.</div>
            ) : (
              <ul className="space-y-2">
                {scenarios.map((s) => (
                  <li key={s.id}>
                    <button
                      className={`w-full rounded px-3 py-2 text-left text-sm ${
                        selected_id === s.id ? "bg-slate-800" : "hover:bg-slate-900"
                      }`}
                      onClick={() => setSelectedId(s.id)}
                    >
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-slate-400">{s.id}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded border border-slate-800 bg-slate-900/30 md:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Selected scenario</div>
              <div className="text-xs text-slate-400">{selected_label}</div>
            </div>
            {selected_id && scenario && (
              <button
                className="rounded border border-rose-800 bg-rose-950/50 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/50 disabled:opacity-50"
                onClick={() => setShowDeleteModal(true)}
                disabled={is_deleting}
              >
                Delete
              </button>
            )}
          </div>
          <div className="p-4">
            {detail_error ? (
              <div className="text-sm text-rose-200">{detail_error}</div>
            ) : !selected_id ? (
              <div className="text-sm text-slate-300">Select a scenario to view details.</div>
            ) : is_loading_detail ? (
              <div className="text-sm text-slate-300">Loading...</div>
            ) : scenario ? (
              <ScenarioForm
                scenario={scenario}
                is_saving={is_saving}
                save_error={save_error}
                on_save={async (payload) => {
                  setIsSaving(true);
                  setSaveError(null);
                  try {
                    await save(payload);
                    await refresh();
                  } catch (e) {
                    setSaveError(e instanceof Error ? e.message : "Failed to save scenario");
                  } finally {
                    setIsSaving(false);
                  }
                }}
              />
            ) : (
              <div className="text-sm text-slate-300">Not found.</div>
            )}
          </div>
        </div>
      </div>

      <DeleteConfirmModal
        scenario_name={selected_label}
        is_open={show_delete_modal}
        is_deleting={is_deleting}
        on_confirm={async () => {
          setIsDeleting(true);
          setDeleteError(null);
          try {
            await remove();
            await refresh();
            setSelectedId(null);
            setShowDeleteModal(false);
          } catch (e) {
            setDeleteError(e instanceof Error ? e.message : "Failed to delete scenario");
          } finally {
            setIsDeleting(false);
          }
        }}
        on_cancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
}

