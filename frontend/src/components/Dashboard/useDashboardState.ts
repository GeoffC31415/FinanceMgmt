import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScenarioRead } from "../../types";
import { useScenarioList } from "../../hooks/useScenario";
import { useSimulation } from "../../hooks/useSimulation";
import type { BondAllocations } from "./utils";
import { getScenarioBondAllocations } from "./utils";
import { update_scenario } from "../../api/client";

const PERCENTILE_PRESETS = [
  { label: "P10", value: 10, desc: "pessimistic" },
  { label: "P25", value: 25, desc: "cautious" },
  { label: "P50", value: 50, desc: "median" },
  { label: "P75", value: 75, desc: "optimistic" },
  { label: "P90", value: 90, desc: "very optimistic" },
] as const;

export type TabId = "overview" | "income-spending" | "assets" | "risk" | "allocation";

export interface UseDashboardStateReturn {
  scenarios: ScenarioRead[];
  is_loading_scenarios: boolean;
  scenarios_error: string | null;
  simulation: ReturnType<typeof useSimulation>;
  selected: ScenarioRead | null;
  selected_id: string | null;
  setSelectedId: (id: string | null) => void;
  annual_spend_target: number;
  setAnnualSpendTarget: (v: number) => void;
  end_year: number;
  setEndYear: (v: number) => void;
  retirement_age_offset: number;
  setRetirementAgeOffset: (v: number) => void;
  show_real_values: boolean;
  setShowRealValues: (v: boolean | ((prev: boolean) => boolean)) => void;
  percentile: number;
  setPercentile: (v: number) => void;
  risk_threshold: number;
  setRiskThreshold: (v: number) => void;
  bond_target_year: number | null;
  setBondTargetYear: (v: number | null) => void;
  active_tab: TabId;
  setActiveTab: (tab: TabId) => void;
  bond_allocations: BondAllocations;
  setBondAllocations: (v: BondAllocations | ((prev: BondAllocations) => BondAllocations)) => void;
  saved_bond_allocations: BondAllocations;
  is_saving_bonds: boolean;
  bond_save_error: string | null;
  PERCENTILE_PRESETS: typeof PERCENTILE_PRESETS;
  refresh: () => Promise<void>;
  handleBondAllocationChange: (assetType: keyof BondAllocations, value: number) => Promise<void>;
  handleSaveBondAllocations: (allocations: Partial<BondAllocations>, assetTypes?: Array<keyof BondAllocations>) => Promise<void>;
}

export function useDashboardState(): UseDashboardStateReturn {
  const { scenarios, is_loading: is_loading_scenarios, error: scenarios_error, refresh } = useScenarioList();
  const simulation = useSimulation();

  const [selected_id, setSelectedId] = useState<string | null>(null);
  const [annual_spend_target, setAnnualSpendTarget] = useState<number>(0);
  const [end_year, setEndYear] = useState<number>(new Date().getFullYear() + 60);
  const [retirement_age_offset, setRetirementAgeOffset] = useState<number>(0);
  const [show_real_values, setShowRealValues] = useState<boolean>(false);
  const [percentile, setPercentile] = useState<number>(50);
  const [risk_threshold, setRiskThreshold] = useState<number>(5);
  const [bond_target_year, setBondTargetYear] = useState<number | null>(null);
  const [active_tab, setActiveTab] = useState<TabId>("overview");
  const [saved_bond_allocations, setSavedBondAllocations] = useState<BondAllocations>({
    ISA: 0, GIA: 0, PENSION: 0
  });
  const [bond_allocations, setBondAllocations] = useState<BondAllocations>({
    ISA: 0, GIA: 0, PENSION: 0
  });
  const [is_saving_bonds, setIsSavingBonds] = useState(false);
  const [bond_save_error, setBondSaveError] = useState<string | null>(null);

  const selected = useMemo(() => scenarios.find((s) => s.id === selected_id) ?? null, [scenarios, selected_id]);

  // Sync bond allocations when scenario changes
  useEffect(() => {
    const next = getScenarioBondAllocations(selected);
    setSavedBondAllocations(next);
    setBondAllocations(next);
    setBondSaveError(null);
  }, [selected]);

  // Sync end_year and annual_spend_target from scenario assumptions when scenario changes
  useEffect(() => {
    if (!selected) return;
    const assumptions = selected.assumptions;
    
    const scenario_end_year = assumptions.end_year;
    const scenario_start_year = assumptions.start_year ?? new Date().getFullYear();
    setEndYear(scenario_end_year ?? scenario_start_year + 60);

    const scenario_spend_target = assumptions.annual_spend_target;
    setAnnualSpendTarget(scenario_spend_target ?? 0);
  }, [selected?.id]);
  
  // Initialize cached simulation session when scenario or end_year changes.
  useEffect(() => {
    if (!selected) return;
    simulation.init({
      scenario_id: selected.id,
      iterations: 2000,
      seed: 0,
      annual_spend_target,
      end_year
    }).catch(() => {
      // error is handled in hook state
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, end_year]);

  // Debounced recalc for spend + retirement age offset + percentile.
  useEffect(() => {
    if (!selected || !simulation.session_id) return;
    const t = window.setTimeout(() => { 
      simulation.recalc({
        annual_spend_target,
        retirement_age_offset,
        percentile
      }).catch(() => {
        // error is handled in hook state
      });
    }, 100);
    return () => window.clearTimeout(t);
  }, [selected, simulation.session_id, annual_spend_target, retirement_age_offset, percentile, simulation.recalc]);

  // Fetch safe withdrawal data when session or retirement offset or risk threshold changes.
  useEffect(() => {
    if (!simulation.session_id) return;
    const t = window.setTimeout(() => {
      simulation.fetch_safe_withdrawal({
        retirement_age_offset,
        risk_threshold,
        max_spend: 200_000,
        steps: 25,
      }).catch(() => {
        // non-critical, logged in hook
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [simulation.session_id, retirement_age_offset, risk_threshold, simulation.fetch_safe_withdrawal]);

  // Sync bond_target_year when display_result years change
  useEffect(() => {
    const display_result = simulation.result;
    if (!display_result || display_result.years.length === 0) {
      setBondTargetYear(null);
      return;
    }
    const default_year = display_result.years[display_result.years.length - 1];
    setBondTargetYear((current) => {
      if (current != null && display_result.years.includes(current)) return current;
      return default_year;
    });
  }, [simulation.result]);

  // Bond allocation change handler
  const handleBondAllocationChange = useCallback(async (assetType: keyof BondAllocations, value: number) => {
    const updatedAllocations = { ...bond_allocations, [assetType]: value };
    setBondAllocations(updatedAllocations);
    setBondSaveError(null);

    if (!simulation.session_id) return;

    try {
      await simulation.fetch_bond_override({
        session_id: simulation.session_id,
        isa_bond_pct: updatedAllocations.ISA,
        gia_bond_pct: updatedAllocations.GIA,
        pension_bond_pct: updatedAllocations.PENSION,
        annual_spend_target: null,
        retirement_age_offset: null,
      });
    } catch (e) {
      console.error("Failed to recalculate with new bond allocation:", e);
    }
  }, [bond_allocations, simulation.session_id, simulation.fetch_bond_override]);

  // Save bond allocations handler
  const handleSaveBondAllocations = useCallback(async (allocations: Partial<BondAllocations>, assetTypes?: Array<keyof BondAllocations>) => {
    if (!selected) return;

    const typesToSave = new Set<keyof BondAllocations>(
      assetTypes ?? (Object.keys(allocations) as Array<keyof BondAllocations>)
    );
    if (typesToSave.size === 0) return;

    setIsSavingBonds(true);
    setBondSaveError(null);
    try {
      const { id: _id, ...payload } = selected;
      const updated = await update_scenario(selected.id, {
        ...payload,
        assets: selected.assets.map((asset) => {
          const assetType = asset.asset_type?.toUpperCase() as keyof BondAllocations | undefined;
          if (!assetType || !typesToSave.has(assetType)) return asset;
          return {
            ...asset,
            bond_allocation: (allocations[assetType] ?? bond_allocations[assetType] ?? 0) / 100,
          };
        })
      });

      const nextSaved = getScenarioBondAllocations(updated);
      setSavedBondAllocations(nextSaved);
      setBondAllocations((current) => ({
        ...current,
        ...Object.fromEntries(
          Array.from(typesToSave).map((assetType) => [
            assetType,
            allocations[assetType] ?? current[assetType],
          ])
        ) as Partial<BondAllocations>,
      }));
      await refresh();
    } catch (e) {
      setBondSaveError(e instanceof Error ? e.message : "Failed to save");
      throw e;
    } finally {
      setIsSavingBonds(false);
    }
  }, [selected, bond_allocations, refresh]);

  return {
    scenarios,
    is_loading_scenarios,
    scenarios_error,
    simulation,
    selected,
    selected_id,
    setSelectedId,
    annual_spend_target,
    setAnnualSpendTarget,
    end_year,
    setEndYear,
    retirement_age_offset,
    setRetirementAgeOffset,
    show_real_values,
    setShowRealValues,
    percentile,
    setPercentile,
    risk_threshold,
    setRiskThreshold,
    bond_target_year,
    setBondTargetYear,
    active_tab,
    setActiveTab,
    saved_bond_allocations,
    bond_allocations,
    setBondAllocations,
    is_saving_bonds,
    bond_save_error,
    PERCENTILE_PRESETS,
    refresh,
    handleBondAllocationChange,
    handleSaveBondAllocations,
  };
}
