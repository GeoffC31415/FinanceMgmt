import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExpensesChart } from "../ExpensesChart";
import { GraduationCapIcon, HouseIcon } from "../ExpensesChart";

// Test SVG icon components directly
describe("GraduationCapIcon", () => {
  it("renders an SVG element", () => {
    const { container } = render(<GraduationCapIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.tagName).toBe("svg");
  });

  it("renders the graduation cap path", () => {
    const { container } = render(<GraduationCapIcon />);
    const svg = container.querySelector("svg");
    const paths = svg?.querySelectorAll("path");
    expect(paths?.length).toBeGreaterThan(0);
  });

  it("accepts custom size", () => {
    const { container } = render(<GraduationCapIcon size={24} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
  });
});

describe("HouseIcon", () => {
  it("renders an SVG element", () => {
    const { container } = render(<HouseIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.tagName).toBe("svg");
  });

  it("renders the house path and polyline", () => {
    const { container } = render(<HouseIcon />);
    const svg = container.querySelector("svg");
    const paths = svg?.querySelectorAll("path");
    const polylines = svg?.querySelectorAll("polyline");
    expect(paths?.length).toBe(1);
    expect(polylines?.length).toBe(1);
  });

  it("accepts custom size", () => {
    const { container } = render(<HouseIcon size={32} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });
});

describe("ExpensesChart", () => {
  it("renders the chart heading", () => {
    const data = createMockData([2024, 2025, 2026]);
    render(<ExpensesChart {...data} />);
    expect(screen.getByText("Outgoings Breakdown")).toBeInTheDocument();
  });

  it("renders the log scale toggle", () => {
    const data = createMockData([2024, 2025, 2026]);
    render(<ExpensesChart {...data} />);
    expect(screen.getByText("Log scale")).toBeInTheDocument();
  });

  it("shows P{percentile} when percentile is not 50", () => {
    const data = createMockData([2024, 2025, 2026]);
    render(<ExpensesChart {...data} percentile={25} />);
    expect(screen.getByText("(P25)")).toBeInTheDocument();
  });

  it("does not show percentile label when percentile is 50", () => {
    const data = createMockData([2024, 2025, 2026]);
    render(<ExpensesChart {...data} percentile={50} />);
    expect(screen.queryByText("(P50)")).not.toBeInTheDocument();
  });

  it("renders without crashing when children_leaving is provided", () => {
    const data = createMockData([2024, 2025, 2026, 2027, 2028]);
    render(<ExpensesChart {...data} children_leaving={[{ name: "Alice", year: 2028 }]} />);
    expect(screen.getByText("Outgoings Breakdown")).toBeInTheDocument();
  });

  it("renders without crashing when mortgage_payoff_year is provided", () => {
    const data = createMockData([2024, 2025, 2026, 2027, 2028]);
    render(<ExpensesChart {...data} mortgage_payoff_year={2028} />);
    expect(screen.getByText("Outgoings Breakdown")).toBeInTheDocument();
  });

  it("renders without crashing when children_leaving is empty", () => {
    const data = createMockData([2024, 2025, 2026]);
    render(<ExpensesChart {...data} children_leaving={[]} />);
    expect(screen.getByText("Outgoings Breakdown")).toBeInTheDocument();
  });

  it("renders without crashing when mortgage_payoff_year is null", () => {
    const data = createMockData([2024, 2025, 2026]);
    render(<ExpensesChart {...data} mortgage_payoff_year={null} />);
    expect(screen.getByText("Outgoings Breakdown")).toBeInTheDocument();
  });

  it("handles undefined data arrays gracefully", () => {
    const data = createMockData([2024, 2025, 2026]);
    render(
      <ExpensesChart
        {...data}
        total_expenses_median={undefined as unknown as number[]}
        mortgage_payment_median={undefined as unknown as number[]}
        pension_contributions_median={undefined as unknown as number[]}
        total_tax_median={undefined as unknown as number[]}
        fun_fund_median={undefined as unknown as number[]}
        property_maintenance_median={undefined as unknown as number[]}
      />
    );
    expect(screen.getByText("Outgoings Breakdown")).toBeInTheDocument();
  });

  it("handles null/NaN values in data arrays", () => {
    const data = createMockData([2024, 2025, 2026]);
    render(
      <ExpensesChart
        {...data}
        total_expenses_median={[NaN, null, undefined]}
        mortgage_payment_median={[0, 0, 0]}
        pension_contributions_median={[0, 0, 0]}
        total_tax_median={[0, 0, 0]}
        fun_fund_median={[0, 0, 0]}
        property_maintenance_median={[0, 0, 0]}
      />
    );
    expect(screen.getByText("Outgoings Breakdown")).toBeInTheDocument();
  });

  it("renders with multiple child leaving entries", () => {
    const data = createMockData([2024, 2025, 2026, 2027, 2028]);
    render(
      <ExpensesChart {...data} children_leaving={[
        { name: "Alice", year: 2026 },
        { name: "Bob", year: 2027 },
        { name: "Charlie", year: 2028 },
      ]} />
    );
    expect(screen.getByText("Outgoings Breakdown")).toBeInTheDocument();
  });

  it("renders with both child leaving and mortgage payoff", () => {
    const data = createMockData([2024, 2025, 2026, 2027, 2028]);
    render(
      <ExpensesChart {...data}
        children_leaving={[{ name: "Alice", year: 2026 }]}
        mortgage_payoff_year={2028}
      />
    );
    expect(screen.getByText("Outgoings Breakdown")).toBeInTheDocument();
  });

  it("renders with empty years array", () => {
    render(<ExpensesChart years={[]} total_expenses_median={[]} mortgage_payment_median={[]}
      pension_contributions_median={[]} total_tax_median={[]} fun_fund_median={[]}
      property_maintenance_median={[]} retirement_years={[]} />);
    expect(screen.getByText("Outgoings Breakdown")).toBeInTheDocument();
  });
});

function createMockData(years: number[]) {
  const n = years.length;
  return {
    years,
    total_expenses_median: Array.from({ length: n }, (_, i) => 30000 + i * 500),
    mortgage_payment_median: Array.from({ length: n }, (_, i) => i < 20 ? 12000 : 0),
    pension_contributions_median: Array.from({ length: n }, () => 4000),
    total_tax_median: Array.from({ length: n }, (_, i) => 5000 + i * 100),
    fun_fund_median: Array.from({ length: n }, (_, i) => i >= 25 ? 20000 : 0),
    property_maintenance_median: Array.from({ length: n }, () => 2000),
    retirement_years: [25],
    children_leaving: [{ name: "Alice", year: 20 }, { name: "Bob", year: 22 }],
    mortgage_payoff_year: 20,
    percentile: 50,
  };
}
