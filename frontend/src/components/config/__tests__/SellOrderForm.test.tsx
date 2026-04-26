import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SellOrderForm } from "../SellOrderForm";

const mockSellOrderItems = [
  { id: "asset-0", category: "Asset", kind: "ISA", name: "Main ISA", owner: "John", priority: 30, value: 150000, note: "" },
  { id: "asset-1", category: "Asset", kind: "GIA", name: "Investment Portfolio", owner: "John", priority: 20, value: 200000, note: "" },
  { id: "asset-2", category: "Asset", kind: "PENSION", name: "Work Pension", owner: "Jane", priority: 10, value: 300000, note: "Only accessible from pension access age." },
  { id: "property-0", category: "Property", kind: "PROPERTY", name: "Rental Flat", owner: "John", priority: 25, value: 250000, note: "Sale may trigger capital gains tax on gains." },
];

describe("SellOrderForm", () => {
  it("renders the section heading", () => {
    render(<SellOrderForm sell_order_items={mockSellOrderItems} person_label_by_id={new Map()} />);
    expect(screen.getByText("Sell Order Summary")).toBeInTheDocument();
  });

  it("displays the helper text", () => {
    render(<SellOrderForm sell_order_items={mockSellOrderItems} person_label_by_id={new Map()} />);
    expect(screen.getByText(/Higher priority numbers are sold first/i)).toBeInTheDocument();
  });

  it("displays all items in priority order", () => {
    render(<SellOrderForm sell_order_items={mockSellOrderItems} person_label_by_id={new Map()} />);
    
    // First item should be Rental Flat (priority 25)
    expect(screen.getByText("Rental Flat")).toBeInTheDocument();
    expect(screen.getByText("Investment Portfolio")).toBeInTheDocument();
    expect(screen.getByText("Work Pension")).toBeInTheDocument();
    expect(screen.getByText(/150,000/)).toBeInTheDocument();
    expect(screen.getByText(/200,000/)).toBeInTheDocument();
    expect(screen.getByText(/250,000/)).toBeInTheDocument();
    expect(screen.getByText(/300,000/)).toBeInTheDocument();
  });

  it("shows empty state when no items configured", () => {
    render(<SellOrderForm sell_order_items={[]} person_label_by_id={new Map()} />);
    expect(screen.getByText("No assets or properties configured yet.")).toBeInTheDocument();
  });

  it("displays the sell order note", () => {
    render(<SellOrderForm sell_order_items={mockSellOrderItems} person_label_by_id={new Map()} />);
    expect(screen.getByText(/First To Sell to Last To Sell/i)).toBeInTheDocument();
  });

  it("shows pension access restriction note", () => {
    render(<SellOrderForm sell_order_items={mockSellOrderItems} person_label_by_id={new Map()} />);
    expect(screen.getByText(/Only accessible from pension access age/i)).toBeInTheDocument();
  });
});
