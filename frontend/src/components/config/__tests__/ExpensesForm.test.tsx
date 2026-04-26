import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { ExpensesForm } from "../ExpensesForm";

function TestWrapper() {
  const form = useForm<any>({
    defaultValues: {
      expenses: [
        {
          name: "Groceries",
          monthly_amount: 500,
          is_inflation_linked: true,
        },
        {
          name: "Utilities",
          monthly_amount: 150,
          is_inflation_linked: true,
        },
      ],
    },
  });

  const expenses_total = 7800; // (500 + 150) * 12

  return (
    <ExpensesForm
      form={form}
      expenses={{
        fields: form.getValues("expenses"),
        append: vi.fn(),
        remove: vi.fn(),
      }}
      expenses_total={expenses_total}
    />
  );
}

describe("ExpensesForm", () => {
  it("renders the section heading", () => {
    render(<TestWrapper />);
    expect(screen.getByText("Expenses")).toBeInTheDocument();
  });

  it("shows the annual total", () => {
    render(<TestWrapper />);
    expect(screen.getByText(/£7,800/)).toBeInTheDocument();
  });

  it("renders expense row with name input", () => {
    render(<TestWrapper />);
    expect(screen.getByDisplayValue("Groceries")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Utilities")).toBeInTheDocument();
  });

  it("renders monthly amount inputs", () => {
    render(<TestWrapper />);
    expect(screen.getByDisplayValue("500")).toBeInTheDocument();
    expect(screen.getByDisplayValue("150")).toBeInTheDocument();
  });

  it("shows inflation linked checkbox for each expense", () => {
    render(<TestWrapper />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    // Both should be checked by default
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it("shows remove button when multiple expenses", () => {
    render(<TestWrapper />);
    const removeButtons = screen.getAllByText("Remove");
    expect(removeButtons).toHaveLength(2);
  });

  it("hides remove button when single expense", () => {
    function SingleExpense() {
      const form = useForm<any>({
        defaultValues: {
          expenses: [
            { name: "Groceries", monthly_amount: 500, is_inflation_linked: true },
          ],
        },
      });
      return (
        <ExpensesForm
          form={form}
          expenses={{
            fields: form.getValues("expenses"),
            append: vi.fn(),
            remove: vi.fn(),
          }}
          expenses_total={6000}
        />
      );
    }
    render(<SingleExpense />);
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
  });

  it("shows add expense button", () => {
    render(<TestWrapper />);
    expect(screen.getByText("Add expense")).toBeInTheDocument();
  });

  it("displays annual amount via AnnualFromMonthlyInput", () => {
    render(<TestWrapper />);
    // Annual from monthly for 500 = 6000
    expect(screen.getByDisplayValue("6,000")).toBeInTheDocument();
    // Annual from monthly for 150 = 1800
    expect(screen.getByDisplayValue("1,800")).toBeInTheDocument();
  });

  it("toggles inflation linked checkbox", () => {
    render(<TestWrapper />);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();
  });
});
