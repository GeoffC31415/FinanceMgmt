import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { ScenarioRead } from "../../../types";
import { PropertiesForm } from "../PropertiesForm";

// Mock property_mortgage_balance from formConverters
vi.mock("../formConverters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../formConverters")>();
  return {
    ...actual,
    property_mortgage_balance: vi.fn((p: { value: number; mortgage_ltv: number }) => {
      return p.value * p.mortgage_ltv;
    }),
    property_mortgage_monthly_payment: vi.fn(() => 2000),
  };
});

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
    assets: [],
    properties: [],
    expenses: [],
  };
}

function TestWrapper({ scenario }: { scenario: ScenarioRead }) {
  const form = useForm<any>({
    defaultValues: {
      properties: [],
    },
  });

  const properties_total = 500000;
  const property_mortgage_balance_total = 300000;

  return (
    <PropertiesForm
      form={form}
      properties={{
        fields: [],
        append: vi.fn(),
        remove: vi.fn(),
      }}
      expandedPropertyIdx={null}
      setExpandedPropertyIdx={vi.fn()}
      scenario={scenario}
      properties_total={properties_total}
      property_mortgage_balance_total={property_mortgage_balance_total}
    />
  );
}

describe("PropertiesForm", () => {
  it("renders the portfolio summary bar", () => {
    render(<TestWrapper scenario={createMockScenario()} />);
    expect(screen.getByText("Property Portfolio")).toBeInTheDocument();
    expect(screen.getByText("Total value:")).toBeInTheDocument();
    expect(screen.getByText("£500,000")).toBeInTheDocument();
  });

  it("shows total equity and debt when mortgage balance > 0", () => {
    render(<TestWrapper scenario={createMockScenario()} />);
    expect(screen.getByText("Total equity:")).toBeInTheDocument();
    expect(screen.getByText("Total debt:")).toBeInTheDocument();
    expect(screen.getByText("£200,000")).toBeInTheDocument(); // 500k - 300k
    expect(screen.getByText("£300,000")).toBeInTheDocument();
  });

  it("shows placeholder when no properties", () => {
    render(<TestWrapper scenario={createMockScenario()} />);
    expect(screen.getByText("No properties yet. Add one below to model buy-to-let investments.")).toBeInTheDocument();
  });

  it("renders the add property button", () => {
    render(<TestWrapper scenario={createMockScenario()} />);
    expect(screen.getByText("Add property")).toBeInTheDocument();
  });

  it("does not show mortgage summary when no mortgage balance", () => {
    function TestNoMortgage() {
      const scenario = createMockScenario();
      const form = useForm<any>({ defaultValues: { properties: [] } });
      return (
        <PropertiesForm
          form={form}
          properties={{ fields: [], append: vi.fn(), remove: vi.fn() }}
          expandedPropertyIdx={null}
          setExpandedPropertyIdx={vi.fn()}
          scenario={scenario}
          properties_total={500000}
          property_mortgage_balance_total={0}
        />
      );
    }
    render(<TestNoMortgage />);
    // Should not show debt text
    expect(screen.queryByText("Total debt:")).not.toBeInTheDocument();
  });
});
