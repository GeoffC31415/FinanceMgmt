import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { ScenarioCreate, ScenarioRead } from "../../../types";
import { ScenarioForm } from "../ScenarioForm";

function createMockScenario(): ScenarioRead {
  return {
    id: "test-scenario-1",
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
    incomes: [
      {
        person_id: "p1",
        kind: "salary",
        gross_annual: 50000,
        annual_growth_rate: 0.02,
        employee_pension_pct: 0.05,
        employer_pension_pct: 0.03,
      },
    ],
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
    expenses: [
      { name: "Groceries", monthly_amount: 500, is_inflation_linked: true },
      { name: "Utilities", monthly_amount: 150, is_inflation_linked: true },
    ],
  };
}

function TestWrapper() {
  const scenario = createMockScenario();
  const savedPayload = vi.fn();
  const form = useForm<any>({
    defaultValues: {
      name: scenario.name,
      assumptions: scenario.assumptions,
      people: scenario.people,
      incomes: scenario.incomes,
      assets: scenario.assets,
      properties: scenario.properties,
      expenses: scenario.expenses,
    },
  });

  return (
    <ScenarioForm
      scenario={scenario}
      on_save={savedPayload}
      is_saving={false}
      save_error={null}
    />
  );
}

describe("ScenarioForm integration", () => {
  it("renders all tab buttons", () => {
    render(<TestWrapper />);
    const tabs = ["Assumptions", "People", "Income", "Expenses", "Assets", "Properties", "Housing", "Sell Order"];
    for (const tab of tabs) {
      expect(screen.getByText(tab)).toBeInTheDocument();
    }
  });

  it("renders the scenario name input with default value", () => {
    render(<TestWrapper />);
    expect(screen.getByDisplayValue("Test Scenario")).toBeInTheDocument();
  });

  it("shows validation state", () => {
    render(<TestWrapper />);
    // The form shows either "Valid" or "Fix validation errors before saving"
    expect(
      screen.getByText(/Valid|Fix validation errors before saving/)
    ).toBeInTheDocument();
  });

  it("shows unsaved changes indicator after editing", async () => {
    render(<TestWrapper />);
    // Find the name input by its value
    const nameInput = screen.getByDisplayValue("Test Scenario");
    fireEvent.change(nameInput, { target: { value: "Modified Scenario" } });
    await waitFor(() => {
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    });
  });

  it("renders expenses with correct annual total", () => {
    render(<TestWrapper />);
    // Switch to expenses tab
    fireEvent.click(screen.getByText("Expenses"));
    expect(screen.getByText(/£7,800/)).toBeInTheDocument();
  });

  it("renders expenses form with all fields", () => {
    render(<TestWrapper />);
    fireEvent.click(screen.getByText("Expenses"));
    expect(screen.getByDisplayValue("Groceries")).toBeInTheDocument();
    expect(screen.getByDisplayValue("500")).toBeInTheDocument();
    expect(screen.getByDisplayValue("6,000")).toBeInTheDocument();
    // Both inflation linked checkboxes
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it("renders assets with correct total", () => {
    render(<TestWrapper />);
    fireEvent.click(screen.getByText("Assets"));
    expect(screen.getByText(/£50,000/)).toBeInTheDocument();
  });

  it("renders people form with adults and children options", () => {
    render(<TestWrapper />);
    fireEvent.click(screen.getByText("People"));
    expect(screen.getByText("Adult 1")).toBeInTheDocument();
    expect(screen.getByText("Adult 2")).toBeInTheDocument();
    expect(screen.getByText("Add adult")).toBeInTheDocument();
    expect(screen.getByText("Add child")).toBeInTheDocument();
  });

  it("renders income form with total", () => {
    render(<TestWrapper />);
    fireEvent.click(screen.getByText("Income"));
    expect(screen.getByText(/£50,000/)).toBeInTheDocument();
    expect(screen.getByText("Salary")).toBeInTheDocument();
  });

  it("renders properties form", () => {
    render(<TestWrapper />);
    fireEvent.click(screen.getByText("Properties"));
    expect(screen.getByText("Properties")).toBeInTheDocument();
  });

  it("renders sell order summary", () => {
    render(<TestWrapper />);
    fireEvent.click(screen.getByText("Sell Order"));
    expect(screen.getByText("Sell Order Summary")).toBeInTheDocument();
    // Should show the ISA asset in the sell order
    expect(screen.getByText("ISA Account")).toBeInTheDocument();
  });

  it("renders housing tab with mortgage info", () => {
    render(<TestWrapper />);
    fireEvent.click(screen.getByText("Housing"));
    expect(screen.getByText("Property Mortgages")).toBeInTheDocument();
  });

  it("renders assumptions tab with all fields", () => {
    render(<TestWrapper />);
    // Assumptions is the default tab
    expect(screen.getByText("Tax Year")).toBeInTheDocument();
    expect(screen.getByText("Investment Return Model")).toBeInTheDocument();
    expect(screen.getByText("Inflation rate")).toBeInTheDocument();
    expect(screen.getByText("ISA annual limit")).toBeInTheDocument();
    expect(screen.getByText("State pension annual")).toBeInTheDocument();
    expect(screen.getByText("Pension access age")).toBeInTheDocument();
    expect(screen.getByText("Start year")).toBeInTheDocument();
    expect(screen.getByText("End year")).toBeInTheDocument();
    expect(screen.getByText("Extra retirement spending")).toBeInTheDocument();
    expect(screen.getByText("Debt interest rate")).toBeInTheDocument();
    expect(screen.getByText("Bankruptcy threshold")).toBeInTheDocument();
  });

  it("switches between tabs correctly", () => {
    render(<TestWrapper />);
    // Start on assumptions (default)
    expect(screen.getByText("Tax Year")).toBeInTheDocument();

    // Switch to expenses tab
    fireEvent.click(screen.getByRole("button", { name: "Expenses" }));
    expect(screen.getByDisplayValue("Groceries")).toBeInTheDocument();

    // Switch to assets
    fireEvent.click(screen.getByRole("button", { name: "Assets" }));
    expect(screen.getByText(/£50,000/)).toBeInTheDocument();

    // Switch back to people
    fireEvent.click(screen.getByRole("button", { name: "People" }));
    expect(screen.getByText("Adult 1")).toBeInTheDocument();
  });

  it("shows inflation linked toggle in expenses", () => {
    render(<TestWrapper />);
    fireEvent.click(screen.getByText("Expenses"));
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    // Toggle one
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
  });

  it("shows add expense button", () => {
    render(<TestWrapper />);
    fireEvent.click(screen.getByText("Expenses"));
    expect(screen.getByText("Add expense")).toBeInTheDocument();
  });

  it("shows add asset button", () => {
    render(<TestWrapper />);
    fireEvent.click(screen.getByText("Assets"));
    expect(screen.getByText("Add asset")).toBeInTheDocument();
  });

  it("shows add income button", () => {
    render(<TestWrapper />);
    fireEvent.click(screen.getByText("Income"));
    expect(screen.getByText("Add income")).toBeInTheDocument();
  });
});
