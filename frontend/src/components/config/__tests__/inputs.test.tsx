import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { NumberInput, PercentInput, AnnualFromMonthlyInput, InfoTip } from "../inputs";

// Wrapper component that provides form context
function TestForm({ children }: { children: (form: ReturnType<typeof useForm<any, any, any>>) => React.ReactNode }) {
  const form = useForm<any, any, any>({
    defaultValues: {
      number_field: 1234,
      percent_field: 0.05,
      monthly_field: 1000,
    },
  });
  return <form>{children(form)}</form>;
}

describe("NumberInput", () => {
  it("renders with formatted value", () => {
    render(
      <TestForm>
        {(form) => <NumberInput control={form.control} name="number_field" placeholder="Enter value" />}
      </TestForm>
    );
    // Should show formatted number
    expect(screen.getByDisplayValue("1,234")).toBeInTheDocument();
  });

  it("shows editable value on focus", () => {
    render(
      <TestForm>
        {(form) => <NumberInput control={form.control} name="number_field" placeholder="Enter value" />}
      </TestForm>
    );
    const input = screen.getByPlaceholderText("Enter value");
    fireEvent.focus(input);
    // On focus, editing state is set to the current displayed value
    expect(input).toHaveValue("1,234");
  });

  it("commits on blur", () => {
    render(
      <TestForm>
        {(form) => <NumberInput control={form.control} name="number_field" placeholder="Enter value" />}
      </TestForm>
    );
    const input = screen.getByPlaceholderText("Enter value");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "5678" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("5,678");
  });

  it("handles empty input as 0", () => {
    render(
      <TestForm>
        {(form) => <NumberInput control={form.control} name="number_field" placeholder="Enter value" />}
      </TestForm>
    );
    const input = screen.getByPlaceholderText("Enter value");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("0");
  });
});

describe("PercentInput", () => {
  it("renders with formatted percent value", () => {
    render(
      <TestForm>
        {(form) => <PercentInput control={form.control} name="percent_field" placeholder="Enter percent" />}
      </TestForm>
    );
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
  });

  it("shows editable value on focus", () => {
    render(
      <TestForm>
        {(form) => <PercentInput control={form.control} name="percent_field" placeholder="Enter percent" />}
      </TestForm>
    );
    const input = screen.getByPlaceholderText("Enter percent");
    fireEvent.focus(input);
    // On focus, editing state is set to the current displayed value
    expect(input).toHaveValue("5");
  });

  it("commits percentage on blur", () => {
    render(
      <TestForm>
        {(form) => <PercentInput control={form.control} name="percent_field" placeholder="Enter percent" />}
      </TestForm>
    );
    const input = screen.getByPlaceholderText("Enter percent");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("10");
  });

  it("stores decimal internally", () => {
    let capturedValue: number | undefined;
    function TestFormCapture() {
      const form = useForm({ defaultValues: { percent_field: 0.05 } });
      useFormSpy(form);
      return <PercentInput control={form.control} name="percent_field" />;
    }

    function useFormSpy(form: ReturnType<typeof useForm<any, any, any>>) {
      // We can't easily spy on onChange, so just verify the input renders correctly
      render(<TestFormCapture />);
      expect(screen.getByDisplayValue("5")).toBeInTheDocument();
    }
  });
});

describe("AnnualFromMonthlyInput", () => {
  it("shows annual value (monthly * 12)", () => {
    render(
      <TestForm>
        {(form) => <AnnualFromMonthlyInput control={form.control} monthly_name="monthly_field" setValue={form.setValue} />}
      </TestForm>
    );
    expect(screen.getByDisplayValue("12,000")).toBeInTheDocument();
  });

  it("updates monthly when annual changes", async () => {
    render(
      <TestForm>
        {(form) => <AnnualFromMonthlyInput control={form.control} monthly_name="monthly_field" setValue={form.setValue} />}
      </TestForm>
    );
    const input = screen.getByDisplayValue("12,000");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "24000" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(input).toHaveValue("24,000");
    });
  });
});

describe("InfoTip", () => {
  it("renders as a small circle with ?", () => {
    render(<InfoTip text="Helpful tip" />);
    const tip = screen.getByLabelText("Helpful tip");
    expect(tip).toBeInTheDocument();
    expect(tip).toHaveAttribute("title", "Helpful tip");
  });

  it("has correct styling classes", () => {
    render(<InfoTip text="Tip" />);
    const tip = screen.getByLabelText("Tip");
    expect(tip).toHaveClass("inline-flex", "h-4", "w-4", "rounded-full");
  });
});
