import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AllocationTab } from "../Dashboard/AllocationTab";
import type { SimulationResponse, BondSweepResponse } from "../../types";

function createMockDisplayResult(): SimulationResponse {
  const years = Array.from({ length: 10 }, (_, i) => 2024 + i);
  return {
    years,
    net_worth_median: Array.from({ length: 10 }, (_, i) => 100000 + i * 50000),
    net_worth_p10: Array.from({ length: 10 }, (_, i) => 80000 + i * 40000),
    net_worth_p90: Array.from({ length: 10 }, (_, i) => 120000 + i * 60000),
    salary_gross_median: Array.from({ length: 10 }, () => 50000),
    salary_net_median: Array.from({ length: 10 }, () => 40000),
    rental_income_median: Array.from({ length: 10 }, () => 0),
    gift_income_median: Array.from({ length: 10 }, () => 0),
    pension_income_median: Array.from({ length: 10 }, (_, i) => i >= 5 ? 15000 : 0),
    state_pension_median: Array.from({ length: 10 }, (_, i) => i >= 7 ? 11500 : 0),
    investment_returns_median: Array.from({ length: 10 }, () => 5000),
    total_income_median: Array.from({ length: 10 }, () => 60000),
    total_expenses_median: Array.from({ length: 10 }, () => 30000),
    mortgage_payment_median: Array.from({ length: 10 }, (_, i) => i < 5 ? 12000 : 0),
    pension_contributions_median: Array.from({ length: 10 }, () => 4000),
    fun_fund_median: Array.from({ length: 10 }, (_, i) => i >= 5 ? 20000 : 0),
    total_tax_median: Array.from({ length: 10 }, () => 8000),
    ni_median: Array.from({ length: 10 }, () => 3000),
    isa_balance_median: Array.from({ length: 10 }, (_, i) => 50000 + i * 5000),
    pension_balance_median: Array.from({ length: 10 }, (_, i) => 100000 + i * 10000),
    cash_balance_median: Array.from({ length: 10 }, (_, i) => 20000 + i * 1000),
    property_balance_median: Array.from({ length: 10 }, (_, i) => 300000 + i * 10000),
    total_assets_median: Array.from({ length: 10 }, (_, i) => 470000 + i * 26000),
    investment_returns_isa: Array.from({ length: 10 }, () => 3000),
    investment_returns_pension: Array.from({ length: 10 }, () => 6000),
    investment_returns_cash: Array.from({ length: 10 }, () => 500),
    investment_returns_gia: Array.from({ length: 10 }, () => 4000),
    contributions_isa: Array.from({ length: 10 }, () => 5000),
    contributions_pension: Array.from({ length: 10 }, () => 4000),
    contributions_cash: Array.from({ length: 10 }, () => 0),
    contributions_gia: Array.from({ length: 10 }, () => 0),
    withdrawals_isa: Array.from({ length: 10 }, () => 0),
    withdrawals_pension: Array.from({ length: 10 }, () => 0),
    withdrawals_cash: Array.from({ length: 10 }, () => 0),
    withdrawals_gia: Array.from({ length: 10 }, () => 0),
    mortgage_balance: Array.from({ length: 10 }, (_, i) => i < 5 ? 200000 - i * 40000 : 0),
    debt_balance: Array.from({ length: 10 }, () => 0),
    debt_interest: Array.from({ length: 10 }, () => 0),
    mortgage_paid_off_pct: Array.from({ length: 10 }, (_, i) => i < 5 ? (1 - i / 5) * 100 : 100),
    is_depleted_pct: Array.from({ length: 10 }, () => 0),
    is_bankrupt_pct: Array.from({ length: 10 }, () => 0),
    child_leaving_expenses: Array.from({ length: 10 }, () => 0),
    total_outgoings_median: Array.from({ length: 10 }, () => 35000),
    property_appreciation_median: Array.from({ length: 10 }, (_, i) => 5000 + i * 500),
    property_maintenance_median: Array.from({ length: 10 }, () => 2000),
    property_rental_income_median: Array.from({ length: 10 }, () => 0),
    gift_inheritance_median: Array.from({ length: 10 }, () => 0),
    is_depleted: Array.from({ length: 10 }, () => 0),
    is_bankrupt: Array.from({ length: 10 }, () => 0),
  };
}

function createMockBondSweepResult(): BondSweepResponse {
  return {
    asset_classes: ["ISA", "GIA", "PENSION"],
    optimal: {
      isa_bond_pct: 30,
      gia_bond_pct: 20,
      pension_bond_pct: 40,
      max_safe_fun_fund: 25000,
      bankruptcy_pct: 3.5,
      depletion_pct: 8.2,
    },
    top_combos: [],
    marginals: [],
    target_year: 2049,
    total_combos_tested: 121,
  };
}

function renderAllocationTab(props: Partial<React.ComponentProps<typeof AllocationTab>> = {}) {
  const defaultProps = {
    display_result: createMockDisplayResult(),
    bond_sweep_result: null,
    is_loading_bond_sweep: false,
    sweep_progress: null,
    risk_threshold: 5,
    setRiskThreshold: vi.fn(),
    bond_target_year: 2049,
    setBondTargetYear: vi.fn(),
    bond_allocations: { ISA: 30, GIA: 20, PENSION: 40 },
    percentile: 50,
    annual_spend_target: 30000,
    retirement_age_offset: 0,
    session_id: "test-session",
    fetch_bond_sweep: vi.fn(),
    onBondAllocationChange: vi.fn(),
    onSaveBondAllocations: vi.fn(),
    isSaving: false,
    saveError: null,
    ...props,
  };
  return render(<AllocationTab {...defaultProps} />);
}

describe("AllocationTab", () => {
  it("renders the bond allocation optimiser heading", () => {
    renderAllocationTab();
    expect(screen.getByText("Bond Allocation Optimiser")).toBeInTheDocument();
  });

  it("renders the run bond sweep button", () => {
    renderAllocationTab();
    expect(screen.getByText("Run Bond Sweep")).toBeInTheDocument();
  });

  it("shows key figures for the current quick allocation projection", () => {
    renderAllocationTab({ percentile: 25 });
    expect(screen.getByText("Current allocation projection")).toBeInTheDocument();
    expect(screen.getByText("Peak net worth")).toBeInTheDocument();
    expect(screen.getByText("Final net worth")).toBeInTheDocument();
    expect(screen.getByText("Bankruptcy risk")).toBeInTheDocument();
    expect(screen.getByText(/selected P25 path/)).toBeInTheDocument();
    expect(screen.getAllByText("£550k")).toHaveLength(2);
    expect(screen.getByText("0.0%")).toBeInTheDocument();
  });

  it("shows loading state when bond sweep is running", () => {
    renderAllocationTab({ is_loading_bond_sweep: true });
    expect(screen.getByText("Running...")).toBeInTheDocument();
  });

  it("is disabled when no session_id", () => {
    const { container } = renderAllocationTab({ session_id: null });
    const button = container.querySelector('button');
    expect(button?.disabled).toBe(true);
  });

  describe("aria attributes", () => {
    it("provides aria-live region for bond sweep progress", () => {
      renderAllocationTab({
        is_loading_bond_sweep: true,
        sweep_progress: {
          completed: 50,
          total: 100,
          phase: "Testing",
          eta_seconds: 30,
        },
      });
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toBeInTheDocument();
      expect(progressbar).toHaveAttribute("aria-valuenow", "50");
      expect(progressbar).toHaveAttribute("aria-valuemin", "0");
      expect(progressbar).toHaveAttribute("aria-valuemax", "100");
      expect(progressbar).toHaveAttribute("aria-label", "Bond sweep progress");
      expect(progressbar).toHaveAttribute("aria-live", "polite");
    });

    it("does not show aria-valuenow when total is 0 (indeterminate)", () => {
      renderAllocationTab({
        is_loading_bond_sweep: true,
        sweep_progress: {
          completed: 0,
          total: 0,
          phase: "Starting",
          eta_seconds: null,
        },
      });
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveAttribute("aria-valuemin", "0");
      expect(progressbar).toHaveAttribute("aria-valuemax", "100");
      // aria-valuenow should be undefined for indeterminate progress
      expect(progressbar).not.toHaveAttribute("aria-valuenow");
    });

    it("shows correct percentage for progress", () => {
      renderAllocationTab({
        is_loading_bond_sweep: true,
        sweep_progress: {
          completed: 75,
          total: 100,
          phase: "Testing",
          eta_seconds: 10,
        },
      });
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveAttribute("aria-valuenow", "75");
    });

    it("shows phase text in progress section", () => {
      renderAllocationTab({
        is_loading_bond_sweep: true,
        sweep_progress: {
          completed: 50,
          total: 100,
          phase: "Running simulations",
          eta_seconds: 30,
        },
      });
      expect(screen.getByText("Running simulations")).toBeInTheDocument();
    });

    it("shows completion count when total > 0", () => {
      renderAllocationTab({
        is_loading_bond_sweep: true,
        sweep_progress: {
          completed: 50,
          total: 100,
          phase: "Testing",
          eta_seconds: 30,
        },
      });
      expect(screen.getByText(/50 \/ 100/)).toBeInTheDocument();
    });

    it("does not show completion count when total is 0", () => {
      renderAllocationTab({
        is_loading_bond_sweep: true,
        sweep_progress: {
          completed: 0,
          total: 0,
          phase: "Starting",
          eta_seconds: null,
        },
      });
      expect(screen.queryByText("0 / 0")).not.toBeInTheDocument();
    });

    it("shows ETA when available", () => {
      renderAllocationTab({
        is_loading_bond_sweep: true,
        sweep_progress: {
          completed: 50,
          total: 100,
          phase: "Testing",
          eta_seconds: 125,
        },
      });
      expect(screen.getByText(/~2m 5s left/)).toBeInTheDocument();
    });

    it("does not show ETA when eta_seconds is null", () => {
      renderAllocationTab({
        is_loading_bond_sweep: true,
        sweep_progress: {
          completed: 0,
          total: 0,
          phase: "Starting",
          eta_seconds: null,
        },
      });
      expect(screen.queryByText(/left/)).not.toBeInTheDocument();
    });
  });

  describe("optimal combination display", () => {
    it("shows optimal allocation when bond sweep result is available", () => {
      renderAllocationTab({
        bond_sweep_result: createMockBondSweepResult(),
      });
      expect(screen.getByText("Optimal allocation (121 simulation runs)")).toBeInTheDocument();
    });

    it("shows bankruptcy risk in optimal result", () => {
      renderAllocationTab({
        bond_sweep_result: createMockBondSweepResult(),
      });
      expect(screen.getByText("3.5%")).toBeInTheDocument();
    });

    it("shows max safe fun fund in optimal result", () => {
      renderAllocationTab({
        bond_sweep_result: createMockBondSweepResult(),
      });
      expect(screen.getByText("£25,000")).toBeInTheDocument();
    });

    it("shows risk horizon in optimal result", () => {
      renderAllocationTab({
        bond_sweep_result: createMockBondSweepResult(),
      });
      expect(screen.getByText("2049 @ 5% risk")).toBeInTheDocument();
    });
  });
});
