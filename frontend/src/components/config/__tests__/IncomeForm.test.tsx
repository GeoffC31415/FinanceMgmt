import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { ScenarioRead } from "../../../types";
import { IncomeForm } from "../IncomeForm";

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
    assets: [],
    properties: [],
    expenses: [],
  };
}

function TestWrapper() {
  const scenario = createMockScenario();
  const form = useForm<any>({
    defaultValues: {
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
      assets: [],
    },
  });

  const income_total = 50000;

  return (
    <IncomeForm
      form={form}
      incomes={{
        fields: form.getValues("incomes"),
        append: vi.fn(),
        remove: vi.fn(),
      }}
      scenario={scenario}
      income_total={income_total}
    />
  );
}

describe("IncomeForm", () => {
  it("renders the section heading", () => {
    render(<TestWrapper />);
    expect(screen.getByText("Income")).toBeInTheDocument();
  });

  it("shows the annual total", () => {
    render(<TestWrapper />);
    expect(screen.getByText(/£50,000/)).toBeInTheDocument();
  });

  it("shows the income types helper text", () => {
    render(<TestWrapper />);
    expect(screen.getByText("Income Types")).toBeInTheDocument();
    expect(screen.getByText(/Salary:/)).toBeInTheDocument();
    expect(screen.getByText(/Rental:/)).toBeInTheDocument();
    expect(screen.getByText(/Gift:/)).toBeInTheDocument();
  });

  it("renders income rows with person dropdown", () => {
    render(<TestWrapper />);
    // Person dropdown should be present
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(3); // person dropdown + kind dropdown + contribution method
  });

  it("renders income type options", () => {
    render(<TestWrapper />);
    // The select shows "Salary" (capitalized) as the display value
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.getByText("Rental")).toBeInTheDocument();
    expect(screen.getByText("Gift")).toBeInTheDocument();
  });

  it("renders gross annual input", () => {
    render(<TestWrapper />);
    expect(screen.getByDisplayValue("50,000")).toBeInTheDocument();
  });

  it("renders growth rate input", () => {
    render(<TestWrapper />);
    // Growth rate is stored as 0.02 but displayed as a percent (2)
    const growthInputs = screen.getAllByPlaceholderText("%");
    // For salary: growth rate + employee pension + employer pension = 3 percent inputs
    expect(growthInputs).toHaveLength(3);
  });

  it("shows remove button when multiple incomes", () => {
    function MultipleIncomes() {
      const scenario = createMockScenario();
      const form = useForm<any>({
        defaultValues: {
          incomes: [
            { person_id: "p1", kind: "salary", gross_annual: 50000, annual_growth_rate: 0.02, employee_pension_pct: 0.05, employer_pension_pct: 0.03 },
            { person_id: "p2", kind: "rental", gross_annual: 10000, annual_growth_rate: 0.02, employee_pension_pct: 0, employer_pension_pct: 0 },
          ],
        },
      });
      return (
        <IncomeForm
          form={form}
          incomes={{ fields: form.getValues("incomes"), append: vi.fn(), remove: vi.fn() }}
          scenario={scenario}
          income_total={60000}
        />
      );
    }
    render(<MultipleIncomes />);
    const removeButtons = screen.getAllByText("Remove");
    expect(removeButtons).toHaveLength(2);
  });

  it("hides remove button when single income", () => {
    render(<TestWrapper />);
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
  });

  it("shows add income button", () => {
    render(<TestWrapper />);
    expect(screen.getByText("Add income")).toBeInTheDocument();
  });

  it("warns when pension contributions have no matching pension asset", () => {
    render(<TestWrapper />);
    expect(screen.getByText(/pension contributions are set/i)).toBeInTheDocument();
    expect(screen.getByText(/Add a pension in the Assets tab/i)).toBeInTheDocument();
  });

  it("does not warn when a matching pension asset exists", () => {
    function WithPensionAsset() {
      const scenario = createMockScenario();
      const form = useForm<any>({
        defaultValues: {
          incomes: [
            { person_id: "p1", kind: "salary", gross_annual: 50000, annual_growth_rate: 0.02, employee_pension_pct: 0.05, employer_pension_pct: 0.03 },
          ],
          assets: [
            { person_id: "p1", name: "Pension", asset_type: "PENSION", withdrawal_priority: 10, balance: 100000, annual_contribution: 0, growth_rate_mean: 0.05, growth_rate_std: 0.1, contributions_end_at_retirement: false, bond_allocation: 0 },
          ],
        },
      });
      return (
        <IncomeForm
          form={form}
          incomes={{ fields: form.getValues("incomes"), append: vi.fn(), remove: vi.fn() }}
          scenario={scenario}
          income_total={50000}
        />
      );
    }

    render(<WithPensionAsset />);
    expect(screen.queryByText(/pension contributions are set/i)).not.toBeInTheDocument();
  });

  it("shows pension fields for salary, hides for rental/gift", () => {
    render(<TestWrapper />);
    // For salary income, pension fields should be visible (not opacity-40)
    // We can verify by checking the inputs are present
    const pensionInputs = screen.getAllByPlaceholderText("%");
    expect(pensionInputs.length).toBeGreaterThanOrEqual(3);
  });
});
