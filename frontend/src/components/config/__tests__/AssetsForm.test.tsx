import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { ScenarioRead } from "../../../types";
import { AssetsForm } from "../AssetsForm";

function createMockScenario(): ScenarioRead {
  return {
    id: "test-scenario",
    name: "Test Scenario",
    assumptions: {
      inflation_rate: 0.02,
      isa_annual_limit: 20000,
      state_pension_annual: 11500,
      pension_access_age: 55,
      start_year: 2024,
      end_year: 2084,
      annual_spend_target: 30000,
      debt_interest_rate: 0.08,
      bankruptcy_threshold: -100000,
      return_model: "parametric",
    },
    people: [
      { id: "p1", label: "Adult 1", birth_date: "1980-01-15", is_child: false },
      { id: "p2", label: "Adult 2", birth_date: "1982-06-20", is_child: false },
    ],
    incomes: [],
    assets: [
      {
        person_id: "p1",
        name: "ISA Account",
        asset_type: "ISA",
        withdrawal_priority: 30,
        balance: 50000,
        annual_contribution: 5000,
        growth_rate_mean: 0.06,
        growth_rate_std: 0.15,
        contributions_end_at_retirement: true,
        bond_allocation: 0.3,
      },
    ],
    properties: [],
    expenses: [],
  };
}

function TestWrapper() {
  const scenario = createMockScenario();
  const form = useForm<any>({
    defaultValues: {
      assets: [
        {
          person_id: "p1",
          name: "ISA Account",
          asset_type: "ISA",
          withdrawal_priority: 30,
          balance: 50000,
          annual_contribution: 5000,
          growth_rate_mean: 0.06,
          growth_rate_std: 0.15,
          contributions_end_at_retirement: true,
          bond_allocation: 0.3,
        },
      ],
      assumptions: { return_model: "parametric" },
    },
  });

  const assets_total = 50000;

  return (
    <AssetsForm
      form={form}
      assets={{
        fields: form.getValues("assets"),
        append: vi.fn(),
        remove: vi.fn(),
      }}
      scenario={scenario}
      assets_total={assets_total}
    />
  );
}

describe("AssetsForm", () => {
  it("renders the section heading", () => {
    render(<TestWrapper />);
    expect(screen.getByText("Assets")).toBeInTheDocument();
  });

  it("shows the total balance", () => {
    render(<TestWrapper />);
    expect(screen.getByText(/£50,000/)).toBeInTheDocument();
  });

  it("shows the withdrawal priority helper text", () => {
    render(<TestWrapper />);
    expect(screen.getByText("Withdrawal Priority")).toBeInTheDocument();
    expect(screen.getByText(/ISA \(30\)/)).toBeInTheDocument();
    expect(screen.getByText(/GIA \(20\)/)).toBeInTheDocument();
    expect(screen.getByText(/Pension \(10\)/)).toBeInTheDocument();
  });

  it("shows accurate pension withdrawal tax copy", () => {
    render(<TestWrapper />);
    expect(screen.getByText("About Pensions")).toBeInTheDocument();
    expect(screen.getByText(/Age restriction/)).toBeInTheDocument();
    expect(screen.getByText(/25% tax-free and 75% taxable income/)).toBeInTheDocument();
    expect(screen.queryByText(/not yet modelled here/)).not.toBeInTheDocument();
  });

  it("renders asset rows with person dropdown", () => {
    render(<TestWrapper />);
    // Person dropdown should be present
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThanOrEqual(2); // person dropdown + type dropdown
  });

  it("renders asset type options", () => {
    render(<TestWrapper />);
    expect(screen.getByText("ISA")).toBeInTheDocument();
    expect(screen.getByText("GIA")).toBeInTheDocument();
    expect(screen.getByText("Pension")).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();
  });

  it("renders balance input", () => {
    render(<TestWrapper />);
    expect(screen.getByDisplayValue("50,000")).toBeInTheDocument();
  });

  it("renders contribution input", () => {
    render(<TestWrapper />);
    expect(screen.getByDisplayValue("5,000")).toBeInTheDocument();
  });

  it("shows remove button when multiple assets", () => {
    function MultipleAssets() {
      const scenario = createMockScenario();
      const form = useForm<any>({
        defaultValues: {
          assets: [
            { person_id: "p1", name: "ISA", asset_type: "ISA", withdrawal_priority: 30, balance: 50000, annual_contribution: 5000, growth_rate_mean: 0.06, growth_rate_std: 0.15, contributions_end_at_retirement: true, bond_allocation: 0.3 },
            { person_id: "p1", name: "GIA", asset_type: "GIA", withdrawal_priority: 20, balance: 100000, annual_contribution: 10000, growth_rate_mean: 0.07, growth_rate_std: 0.18, contributions_end_at_retirement: false, bond_allocation: 0.2 },
          ],
          assumptions: { return_model: "parametric" },
        },
      });
      return (
        <AssetsForm
          form={form}
          assets={{ fields: form.getValues("assets"), append: vi.fn(), remove: vi.fn() }}
          scenario={scenario}
          assets_total={150000}
        />
      );
    }
    render(<MultipleAssets />);
    const removeButtons = screen.getAllByText("Remove");
    expect(removeButtons).toHaveLength(2);
  });

  it("hides remove button when single asset", () => {
    render(<TestWrapper />);
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
  });

  it("shows add asset button", () => {
    render(<TestWrapper />);
    expect(screen.getByText("Add asset")).toBeInTheDocument();
  });

  it("warns when a pension asset has no owner", () => {
    function PensionWithoutOwner() {
      const scenario = createMockScenario();
      const form = useForm<any>({
        defaultValues: {
          assets: [
            { person_id: "", name: "Pension", asset_type: "PENSION", withdrawal_priority: 10, balance: 100000, annual_contribution: 0, growth_rate_mean: 0.05, growth_rate_std: 0.1, contributions_end_at_retirement: false, bond_allocation: 0 },
          ],
          assumptions: { return_model: "parametric" },
        },
      });
      return (
        <AssetsForm
          form={form}
          assets={{ fields: form.getValues("assets"), append: vi.fn(), remove: vi.fn() }}
          scenario={scenario}
          assets_total={100000}
        />
      );
    }

    render(<PensionWithoutOwner />);
    expect(screen.getByText(/pension assets should have an owner/i)).toBeInTheDocument();
  });

  it("shows bond allocation for non-cash assets with parametric model", () => {
    render(<TestWrapper />);
    // With parametric model, bond % should be visible (not opacity-40)
    const bondInputs = screen.getAllByPlaceholderText("0%");
    expect(bondInputs.length).toBeGreaterThanOrEqual(1);
  });
});
