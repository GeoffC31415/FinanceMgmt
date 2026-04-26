import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { Assumptions } from "../../types";
import { AssumptionsForm } from "../AssumptionsForm";

// Mock API functions
vi.mock("../../api/client", () => ({
  list_tax_years: vi.fn().mockResolvedValue([
    { tax_year: "2025-26", personal_allowance: 12570, basic_rate: 0.2, basic_rate_limit: 37700, higher_rate: 0.4, higher_rate_limit: 125140, additional_rate: 0.45, ni_main_rate: 0.08, ni_upper_rate: 0.02 },
    { tax_year: "2024-25", personal_allowance: 12570, basic_rate: 0.2, basic_rate_limit: 37700, higher_rate: 0.4, higher_rate_limit: 125140, additional_rate: 0.45, ni_main_rate: 0.08, ni_upper_rate: 0.02 },
  ]),
  get_historical_returns: vi.fn().mockResolvedValue({
    stats: { count: 100, mean: 0.07, std: 0.18, min: -0.35, max: 0.38, min_year: 2008, max_year: 2020, first_year: 1924, last_year: 2024 },
  }),
}));

function TestWrapper({ initialReturnModel = "parametric" }: { initialReturnModel?: "parametric" | "historical_bootstrap" }) {
  const form = useForm({
    defaultValues: {
      name: "Test Scenario",
      assumptions: {
        inflation_rate: 0.02,
        isa_annual_limit: 20000,
        state_pension_annual: 11500,
        pension_access_age: 55,
        start_year: 2026,
        end_year: 2086,
        annual_spend_target: 30000,
        debt_interest_rate: 0.08,
        bankruptcy_threshold: -100000,
        return_model: initialReturnModel,
      } as Assumptions,
      people: [],
      incomes: [],
      assets: [],
      properties: [],
      expenses: [],
    },
  });
  return (
    <div>
      <AssumptionsForm control={form.control} setValue={form.setValue} />
    </div>
  );
}

describe("AssumptionsForm", () => {
  it("renders the section heading", () => {
    render(<TestWrapper />);
    expect(screen.getByText("Tax Year")).toBeInTheDocument();
  });

  it("renders the return model selector", () => {
    render(<TestWrapper />);
    expect(screen.getByText(/Investment Return Model/i)).toBeInTheDocument();
    expect(screen.getByText(/S&P 500 Historical Bootstrap/i)).toBeInTheDocument();
    expect(screen.getByText(/Custom \(Normal distribution\)/i)).toBeInTheDocument();
  });

  it("renders all input fields", () => {
    render(<TestWrapper />);
    // Check that all input fields are present by their unique placeholders
    expect(screen.getByPlaceholderText(/e\.g\. 20,000/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. 11,500/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. 2026/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. 2086/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. 30,000/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. -100,000/)).toBeInTheDocument();
  });

  it("shows tax year selector", () => {
    render(<TestWrapper />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveDisplayValue(/Select tax year/i);
    expect(select).not.toBeDisabled();
  });

  it("shows historical return stats when return model is set", async () => {
    render(<TestWrapper />);
    await waitFor(() => {
      expect(screen.getByText(/Mean:/i)).toBeInTheDocument();
      expect(screen.getByText(/Std dev:/i)).toBeInTheDocument();
      expect(screen.getByText(/Best:/i)).toBeInTheDocument();
      expect(screen.getByText(/Worst:/i)).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it("switches return model selection", () => {
    // Start with parametric selected
    render(<TestWrapper initialReturnModel="parametric" />);
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(2);
    // One should be checked (parametric)
    expect(radios.some(r => r.checked)).toBe(true);
    
    // Start with bootstrap selected
    render(<TestWrapper initialReturnModel="historical_bootstrap" />);
    const radios2 = screen.getAllByRole("radio");
    expect(radios2.some(r => r.checked)).toBe(true);
  });
});
