import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSimulation } from "../useSimulation";
import * as apiClient from "../../api/client";

// Mock the API client
vi.mock("../../api/client", () => ({
  init_simulation: vi.fn(),
  recalc_simulation: vi.fn(),
  safe_withdrawal: vi.fn(),
  bond_override: vi.fn(),
  bond_sweep: vi.fn(),
  bond_sweep_progress: vi.fn(),
}));

function makeMockResponse() {
  return {
    years: [2024, 2025, 2026],
    inflation_rate: 0.02,
    start_year: 2024,
    net_worth_p10: [100_000, 110_000, 120_000],
    net_worth_median: [150_000, 165_000, 180_000],
    net_worth_p90: [200_000, 220_000, 240_000],
    income_median: [50_000, 50_000, 50_000],
    spend_median: [30_000, 30_000, 30_000],
    salary_gross_median: [60_000, 60_000, 60_000],
    salary_net_median: [48_000, 48_000, 48_000],
    rental_income_median: [0, 0, 0],
    gift_income_median: [0, 0, 0],
    pension_income_median: [0, 0, 0],
    state_pension_income_median: [0, 0, 0],
    investment_returns_median: [5_000, 5_000, 5_000],
    total_income_median: [53_000, 53_000, 53_000],
    total_expenses_median: [30_000, 30_000, 30_000],
    mortgage_payment_median: [1_000, 1_000, 1_000],
    pension_contributions_median: [2_000, 2_000, 2_000],
    fun_fund_median: [10_000, 10_000, 10_000],
    income_tax_paid_median: [10_000, 10_000, 10_000],
    ni_paid_median: [4_000, 4_000, 4_000],
    total_tax_median: [14_000, 14_000, 14_000],
    // P1.1: Structured tax breakdown
    salary_income_tax_paid_median: [6_000, 6_000, 6_000],
    rental_income_tax_paid_median: [0, 0, 0],
    pension_drawdown_tax_paid_median: [0, 0, 0],
    capital_gains_tax_paid_median: [0, 0, 0],
    isa_balance_median: [50_000, 52_000, 55_000],
    pension_balance_median: [80_000, 85_000, 90_000],
    cash_balance_median: [20_000, 21_000, 22_000],
    gia_balance_median: [30_000, 32_000, 35_000],
    total_assets_median: [180_000, 190_000, 202_000],
    isa_returns_median: [3_000, 3_000, 3_000],
    gia_returns_median: [2_500, 2_500, 2_500],
    cash_returns_median: [500, 500, 500],
    pension_returns_median: [4_000, 4_000, 4_000],
    isa_contributions_median: [2_000, 2_000, 2_000],
    gia_contributions_median: [1_500, 1_500, 1_500],
    isa_withdrawals_median: [0, 0, 0],
    gia_withdrawals_median: [0, 0, 0],
    pension_withdrawals_median: [0, 0, 0],
    mortgage_balance_median: [200_000, 190_000, 180_000],
    total_liabilities_median: [200_000, 190_000, 180_000],
    debt_balance_median: [0, 0, 0],
    debt_interest_paid_median: [0, 0, 0],
    property_value_median: [300_000, 305_000, 310_000],
    property_returns_median: [0, 0, 0],
    property_rental_income_median: [0, 0, 0],
    property_maintenance_median: [0, 0, 0],
    mortgage_paid_off_median: [0, 0, 0],
    is_depleted_median: [0, 0, 0],
    is_bankrupt_median: [0, 0, 0],
    retirement_years: [2035, 2040],
  };
}

describe("useSimulation hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  describe("initial state", () => {
    it("starts with null result and no session", () => {
      const { result } = renderHook(() => useSimulation());
      expect(result.current.result).toBeNull();
      expect(result.current.session_id).toBeNull();
      expect(result.current.is_loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("has all expected methods", () => {
      const { result } = renderHook(() => useSimulation());
      expect(typeof result.current.init).toBe("function");
      expect(typeof result.current.recalc).toBe("function");
      expect(typeof result.current.fetch_safe_withdrawal).toBe("function");
      expect(typeof result.current.fetch_bond_sweep).toBe("function");
      expect(typeof result.current.fetch_bond_override).toBe("function");
    });
  });

  describe("init", () => {
    it("sets loading state during init", async () => {
      const initMock = vi.mocked(apiClient.init_simulation);
      initMock.mockReturnValue(
        new Promise(() => {}) // never resolves
      );

      const { result } = renderHook(() => useSimulation());

      act(() => {
        result.current.init({
          scenario_id: "s1",
        } as any);
      });

      expect(result.current.is_loading).toBe(true);
    });

    it("sets result and session_id on success", async () => {
      const mockResponse = makeMockResponse();
      const initMock = vi.mocked(apiClient.init_simulation);
      initMock.mockResolvedValue({
        ...mockResponse,
        session_id: "sess-123",
      });

      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await result.current.init({ scenario_id: "s1" } as any);
      });

      expect(result.current.result).not.toBeNull();
      expect(result.current.session_id).toBe("sess-123");
      expect(result.current.is_loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("sets error on failure", async () => {
      const initMock = vi.mocked(apiClient.init_simulation);
      initMock.mockRejectedValue(new Error("Connection failed"));

      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await expect(
          result.current.init({ scenario_id: "s1" } as any)
        ).rejects.toThrow("Connection failed");
      });

      expect(result.current.error).toContain("Connection failed");
      expect(result.current.is_loading).toBe(false);
    });

    it("throws generic error for non-Error rejection", async () => {
      const initMock = vi.mocked(apiClient.init_simulation);
      initMock.mockRejectedValue("string error");

      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await expect(
          result.current.init({ scenario_id: "s1" } as any)
        ).rejects.toThrow();
      });

      // Non-Error values get caught by the outer catch and set the hook's error
      expect(result.current.error).toBe("Simulation init failed");
    });
  });

  describe("recalc", () => {
    it("throws when no session exists", async () => {
      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await expect(
          result.current.recalc({ annual_spend_target: 30_000 } as any)
        ).rejects.toThrow("No simulation session");
      });
    });

    it("uses explicit session_id over stored one", async () => {
      const mockResponse = makeMockResponse();
      const initMock = vi.mocked(apiClient.init_simulation);
      initMock.mockResolvedValue({
        ...mockResponse,
        session_id: "sess-stored",
      });

      const recalcMock = vi.mocked(apiClient.recalc_simulation);
      recalcMock.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await result.current.init({ scenario_id: "s1" } as any);
      });

      await act(async () => {
        await result.current.recalc({
          annual_spend_target: 35_000,
          session_id: "sess-override",
        } as any);
      });

      expect(recalcMock).toHaveBeenCalledWith({
        session_id: "sess-override",
        annual_spend_target: 35_000,
        retirement_age_offset: null,
        percentile: null,
      });
    });

    it("updates result on success", async () => {
      const mockResponse = makeMockResponse();
      const initMock = vi.mocked(apiClient.init_simulation);
      initMock.mockResolvedValue({
        ...mockResponse,
        session_id: "sess-123",
      });

      const recalcMock = vi.mocked(apiClient.recalc_simulation);
      recalcMock.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await result.current.init({ scenario_id: "s1" } as any);
      });

      await act(async () => {
        await result.current.recalc({ annual_spend_target: 35_000 } as any);
      });

      expect(result.current.result).toEqual(mockResponse);
      expect(result.current.is_loading).toBe(false);
    });
  });

  describe("safe withdrawal", () => {
    it("throws when no session exists", async () => {
      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await expect(
          result.current.fetch_safe_withdrawal({
            retirement_age_offset: 0,
            risk_threshold: 0.05,
            max_spend: 30_000,
            steps: 10,
          })
        ).rejects.toThrow("No simulation session");
      });
    });

    it("sets loading state during calculation", async () => {
      const mockResponse = makeMockResponse();
      const initMock = vi.mocked(apiClient.init_simulation);
      initMock.mockResolvedValue({
        ...mockResponse,
        session_id: "sess-123",
      });

      const safeWithdrawalMock = vi.mocked(apiClient.safe_withdrawal);
      safeWithdrawalMock.mockReturnValue(
        new Promise(() => {}) // never resolves
      );

      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await result.current.init({ scenario_id: "s1" } as any);
      });

      act(() => {
        result.current.fetch_safe_withdrawal({
          retirement_age_offset: 0,
          risk_threshold: 0.05,
          max_spend: 30_000,
          steps: 10,
        });
      });

      expect(result.current.is_loading_safe_withdrawal).toBe(true);
    });

    it("sets safe_withdrawal_result on success", async () => {
      const mockResponse = makeMockResponse();
      const initMock = vi.mocked(apiClient.init_simulation);
      initMock.mockResolvedValue({
        ...mockResponse,
        session_id: "sess-123",
      });

      const safeWithdrawalMock = vi.mocked(apiClient.safe_withdrawal);
      safeWithdrawalMock.mockResolvedValue({
        max_safe_fun_fund: 25_000,
        risk_threshold: 0.05,
        sensitivity_curve: [],
      });

      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await result.current.init({ scenario_id: "s1" } as any);
      });

      await act(async () => {
        await result.current.fetch_safe_withdrawal({
          retirement_age_offset: 0,
          risk_threshold: 0.05,
          max_spend: 30_000,
          steps: 10,
        });
      });

      expect(result.current.safe_withdrawal_result).not.toBeNull();
      expect(result.current.safe_withdrawal_result!.max_safe_fun_fund).toBe(25_000);
      expect(result.current.safe_withdrawal_error).toBeNull();
      expect(result.current.is_loading_safe_withdrawal).toBe(false);
    });

    it("sets safe_withdrawal_error on failure", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const mockResponse = makeMockResponse();
      const initMock = vi.mocked(apiClient.init_simulation);
      initMock.mockResolvedValue({
        ...mockResponse,
        session_id: "sess-123",
      });

      const safeWithdrawalMock = vi.mocked(apiClient.safe_withdrawal);
      safeWithdrawalMock.mockRejectedValue(new Error("HTTP 500: missing numpy import"));

      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await result.current.init({ scenario_id: "s1" } as any);
      });

      await act(async () => {
        await expect(
          result.current.fetch_safe_withdrawal({
            retirement_age_offset: 0,
            risk_threshold: 5,
            max_spend: 30_000,
            steps: 10,
          })
        ).rejects.toThrow("missing numpy import");
      });

      expect(result.current.safe_withdrawal_error).toContain("missing numpy import");
      expect(result.current.is_loading_safe_withdrawal).toBe(false);
      consoleErrorSpy.mockRestore();
    });
  });

  describe("bond override", () => {
    it("throws when no session exists", async () => {
      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await expect(
          result.current.fetch_bond_override({
            isa_bond_pct: 30,
            gia_bond_pct: 50,
            pension_bond_pct: 40,
          })
        ).rejects.toThrow("No simulation session");
      });
    });

    it("updates result on success", async () => {
      const mockResponse = makeMockResponse();
      const initMock = vi.mocked(apiClient.init_simulation);
      initMock.mockResolvedValue({
        ...mockResponse,
        session_id: "sess-123",
      });

      const bondOverrideMock = vi.mocked(apiClient.bond_override);
      bondOverrideMock.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await result.current.init({ scenario_id: "s1" } as any);
      });

      await act(async () => {
        await result.current.fetch_bond_override({
          isa_bond_pct: 30,
          gia_bond_pct: 50,
          pension_bond_pct: 40,
          annual_spend_target: 45_000,
          retirement_age_offset: 2,
          percentile: 10,
        });
      });

      expect(bondOverrideMock).toHaveBeenCalledWith({
        session_id: "sess-123",
        isa_bond_pct: 30,
        gia_bond_pct: 50,
        pension_bond_pct: 40,
        annual_spend_target: 45_000,
        retirement_age_offset: 2,
        percentile: 10,
      });
      expect(result.current.result).toEqual(mockResponse);
      expect(result.current.is_loading).toBe(false);
    });
  });

  describe("bond sweep", () => {
    it("throws when no session exists", async () => {
      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await expect(
          result.current.fetch_bond_sweep({
            retirement_age_offset: 0,
            risk_threshold: 0.05,
            target_year: 2050,
            max_spend: 30_000,
          })
        ).rejects.toThrow("No simulation session");
      });
    });

    it("shows initial progress state", async () => {
      const mockResponse = makeMockResponse();
      const initMock = vi.mocked(apiClient.init_simulation);
      initMock.mockResolvedValue({
        ...mockResponse,
        session_id: "sess-123",
      });

      const bondSweepMock = vi.mocked(apiClient.bond_sweep);
      bondSweepMock.mockReturnValue(
        new Promise(() => {}) // never resolves
      );

      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await result.current.init({ scenario_id: "s1" } as any);
      });

      act(() => {
        result.current.fetch_bond_sweep({
          retirement_age_offset: 0,
          risk_threshold: 0.05,
          target_year: 2050,
          max_spend: 30_000,
        });
      });

      expect(result.current.sweep_progress).not.toBeNull();
      expect(result.current.sweep_progress!.completed).toBe(0);
      expect(result.current.sweep_progress!.phase).toBe("Starting...");
      expect(result.current.is_loading_bond_sweep).toBe(true);
    });

    it("updates progress via polling", async () => {
      const mockResponse = makeMockResponse();
      const initMock = vi.mocked(apiClient.init_simulation);
      initMock.mockResolvedValue({
        ...mockResponse,
        session_id: "sess-123",
      });

      const bondSweepMock = vi.mocked(apiClient.bond_sweep);
      bondSweepMock.mockReturnValue(
        new Promise(() => {}) // never resolves
      );

      const progressMock = vi.mocked(apiClient.bond_sweep_progress);
      progressMock
        .mockResolvedValueOnce({ completed: 50, total: 100, phase: "Running...", running: true })
        .mockResolvedValueOnce({ completed: 100, total: 100, phase: "Complete", running: false });

      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await result.current.init({ scenario_id: "s1" } as any);
      });

      act(() => {
        result.current.fetch_bond_sweep({
          retirement_age_offset: 0,
          risk_threshold: 0.05,
          target_year: 2050,
          max_spend: 30_000,
        });
      });

      // Advance timers to trigger polling
      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      // Progress should have been updated
      expect(result.current.sweep_progress).not.toBeNull();
      expect(result.current.sweep_progress!.total).toBe(100);

      // Complete the sweep
      await act(async () => {
        bondSweepMock.mockResolvedValue({
          asset_classes: ["ISA", "GIA", "PENSION"],
          optimal: { isa_bond_pct: 30, gia_bond_pct: 50, pension_bond_pct: 40, bankruptcy_pct: 2, depletion_pct: 3, max_safe_fun_fund: 25_000 },
          top_combos: [],
          marginals: [],
          target_year: 2050,
          total_combos_tested: 100,
        });
        vi.advanceTimersByTime(600);
      });
    });

    it("clears progress on completion", async () => {
      const mockResponse = makeMockResponse();
      const initMock = vi.mocked(apiClient.init_simulation);
      initMock.mockResolvedValue({
        ...mockResponse,
        session_id: "sess-123",
      });

      const bondSweepMock = vi.mocked(apiClient.bond_sweep);
      bondSweepMock.mockResolvedValue({
        asset_classes: ["ISA", "GIA", "PENSION"],
        optimal: { isa_bond_pct: 30, gia_bond_pct: 50, pension_bond_pct: 40, bankruptcy_pct: 2, depletion_pct: 3, max_safe_fun_fund: 25_000 },
        top_combos: [],
        marginals: [],
        target_year: 2050,
        total_combos_tested: 100,
      });

      const { result } = renderHook(() => useSimulation());

      await act(async () => {
        await result.current.init({ scenario_id: "s1" } as any);
      });

      await act(async () => {
        await result.current.fetch_bond_sweep({
          retirement_age_offset: 0,
          risk_threshold: 0.05,
          target_year: 2050,
          max_spend: 30_000,
        });
      });

      expect(result.current.bond_sweep_result).not.toBeNull();
      expect(result.current.sweep_progress).toBeNull();
      expect(result.current.is_loading_bond_sweep).toBe(false);
    });
  });

  describe("returned interface", () => {
    it("returns all expected state and methods", () => {
      const { result } = renderHook(() => useSimulation());
      const keys = Object.keys(result.current);
      const expectedKeys = [
        "result", "session_id", "is_loading", "error",
        "init", "recalc",
        "safe_withdrawal_result", "is_loading_safe_withdrawal", "safe_withdrawal_error", "fetch_safe_withdrawal",
        "bond_sweep_result", "is_loading_bond_sweep", "sweep_progress", "fetch_bond_sweep",
        "fetch_bond_override",
      ];
      for (const key of expectedKeys) {
        expect(keys).toContain(key);
      }
    });
  });
});
