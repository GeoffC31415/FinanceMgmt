import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HousingForm } from "../HousingForm";

const mockProperties = [
  {
    name: "Rental Flat",
    value: 250000,
    mortgage_ltv: 0.75,
    mortgage_rate: 0.045,
    mortgage_term_years: 25,
  },
  {
    name: "Buy-to-Let House",
    value: 400000,
    mortgage_ltv: 0.6,
    mortgage_rate: 0.04,
    mortgage_term_years: 20,
  },
];

// Wrapper that provides the required functions
function TestWrapper() {
  return (
    <HousingForm
      watched_properties={mockProperties}
      property_mortgage_balance_total={437500}
      property_mortgage_payment_total={1850}
      property_mortgage_balance={(params: { value: number; mortgage_ltv: number }) =>
        params.value * (params.mortgage_ltv / 100)
      }
      property_mortgage_monthly_payment={(params) => {
        const { value, mortgage_ltv, mortgage_rate, mortgage_term_years } = params;
        if (mortgage_term_years === 0) return 0;
        const loan = value * (mortgage_ltv / 100);
        const rate = mortgage_rate / 12;
        const n = mortgage_term_years * 12;
        if (rate === 0) return loan / n;
        return (loan * rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1);
      }}
    />
  );
}

describe("HousingForm", () => {
  it("renders the section heading", () => {
    render(<TestWrapper />);
    expect(screen.getByText("Property Mortgages")).toBeInTheDocument();
  });

  it("displays total mortgage balance", () => {
    render(<TestWrapper />);
    expect(screen.getByText(/Total mortgage balance/i)).toBeInTheDocument();
  });

  it("displays estimated monthly payments", () => {
    render(<TestWrapper />);
    expect(screen.getByText(/Estimated monthly payments/i)).toBeInTheDocument();
  });

  it("shows property mortgage details", () => {
    render(<TestWrapper />);
    expect(screen.getByText("Rental Flat")).toBeInTheDocument();
    expect(screen.getByText("Buy-to-Let House")).toBeInTheDocument();
  });

  it("shows empty state when no mortgages configured", () => {
    render(
      <HousingForm
        watched_properties={[]}
        property_mortgage_balance_total={0}
        property_mortgage_payment_total={0}
        property_mortgage_balance={() => 0}
        property_mortgage_monthly_payment={() => 0}
      />
    );
    expect(screen.getByText("No property mortgages configured yet.")).toBeInTheDocument();
  });

  it("shows mortgage configuration help text", () => {
    render(<TestWrapper />);
    expect(screen.getByText(/Mortgages are configured on each property/i)).toBeInTheDocument();
  });
});
