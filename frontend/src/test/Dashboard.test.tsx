import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { Dashboard } from "../components/Dashboard";

// Mock the hooks to avoid actual API calls
vi.mock("../hooks/useScenario", () => ({
  useScenarioList: () => ({
    scenarios: [
      { id: "s1", name: "Test Scenario", assumptions: {}, people: [], incomes: [], assets: [], expenses: [] },
      { id: "s2", name: "Scenario Two", assumptions: {}, people: [], incomes: [], assets: [], expenses: [] },
    ],
    is_loading: false,
    error: null,
  }),
}));

vi.mock("../hooks/useSimulation", () => ({
  useSimulation: () => ({
    result: null,
    session_id: null,
    is_loading: false,
    error: null,
    init: vi.fn(),
    recalc: vi.fn(),
    run: vi.fn(),
  }),
}));

function renderDashboard() {
  return render(
    <BrowserRouter>
      <Dashboard />
    </BrowserRouter>
  );
}

describe("Dashboard", () => {
  it("renders the heading", () => {
    renderDashboard();
    expect(screen.getByText("Scenario Simulation")).toBeInTheDocument();
  });

  it("renders scenario dropdown with options", () => {
    renderDashboard();
    expect(screen.getByText("Test Scenario")).toBeInTheDocument();
    expect(screen.getByText("Scenario Two")).toBeInTheDocument();
  });

  it("renders control labels", () => {
    renderDashboard();
    expect(screen.getByText("Extra spend (retired)")).toBeInTheDocument();
    expect(screen.getByText("Retirement age offset")).toBeInTheDocument();
    expect(screen.getByText("End year")).toBeInTheDocument();
  });

  it("does not render charts when no result", () => {
    renderDashboard();
    // Net Worth chart title should NOT appear when no simulation result
    const netWorthElements = screen.queryAllByText("Net Worth");
    expect(netWorthElements).toHaveLength(0);
  });

  it("renders export CSV button (disabled when no result)", () => {
    renderDashboard();
    const button = screen.getByText("Export CSV");
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });
});
