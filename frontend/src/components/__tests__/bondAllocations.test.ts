import { describe, it, expect } from "vitest";
import { getScenarioBondAllocations, format_currency_compact } from "../Dashboard/utils";

describe("getScenarioBondAllocations", () => {
  it("returns zero allocations for null input", () => {
    expect(getScenarioBondAllocations(null)).toEqual({ ISA: 0, GIA: 0, PENSION: 0 });
  });

  it("returns zero allocations for undefined input", () => {
    expect(getScenarioBondAllocations(undefined)).toEqual({ ISA: 0, GIA: 0, PENSION: 0 });
  });

  it("returns zero allocations for empty assets", () => {
    expect(getScenarioBondAllocations({ assets: [] })).toEqual({ ISA: 0, GIA: 0, PENSION: 0 });
  });

  it("extracts bond allocations from assets", () => {
    const scenario = {
      assets: [
        { asset_type: "ISA", bond_allocation: 0.3 },
        { asset_type: "GIA", bond_allocation: 0.6 },
        { asset_type: "PENSION", bond_allocation: 0.8 },
      ],
    };
    expect(getScenarioBondAllocations(scenario)).toEqual({ ISA: 30, GIA: 60, PENSION: 80 });
  });

  it("handles mixed case asset types", () => {
    const scenario = {
      assets: [
        { asset_type: "isa", bond_allocation: 0.5 },
        { asset_type: "gia", bond_allocation: 0.4 },
        { asset_type: "pension", bond_allocation: 0.2 },
      ],
    };
    expect(getScenarioBondAllocations(scenario)).toEqual({ ISA: 50, GIA: 40, PENSION: 20 });
  });

  it("handles missing bond_allocation", () => {
    const scenario = {
      assets: [
        { asset_type: "ISA", bond_allocation: undefined },
        { asset_type: "GIA", bond_allocation: 0.5 },
      ],
    };
    expect(getScenarioBondAllocations(scenario)).toEqual({ ISA: 0, GIA: 50, PENSION: 0 });
  });

  it("ignores non-ISA/GIA/PENSION asset types", () => {
    const scenario = {
      assets: [
        { asset_type: "CASH", bond_allocation: 0.5 },
        { asset_type: "ISA", bond_allocation: 0.3 },
      ],
    };
    expect(getScenarioBondAllocations(scenario)).toEqual({ ISA: 30, GIA: 0, PENSION: 0 });
  });

  it("rounds bond allocations", () => {
    const scenario = {
      assets: [
        { asset_type: "ISA", bond_allocation: 0.333 },
        { asset_type: "GIA", bond_allocation: 0.666 },
      ],
    };
    expect(getScenarioBondAllocations(scenario)).toEqual({ ISA: 33, GIA: 67, PENSION: 0 });
  });
});

describe("format_currency_compact", () => {
  it("formats values under 1M with thousands separator", () => {
    expect(format_currency_compact(123456)).toBe("£123,456");
    expect(format_currency_compact(1234)).toBe("£1,234");
  });

  it("formats values over 1M in millions", () => {
    expect(format_currency_compact(1_200_000)).toBe("£1.2m");
    expect(format_currency_compact(2_500_000)).toBe("£2.5m");
  });

  it("formats zero", () => {
    expect(format_currency_compact(0)).toBe("£0");
  });

  it("formats negative values", () => {
    expect(format_currency_compact(-1_200_000)).toBe("£-1.2m");
  });

  it("formats exactly 1M", () => {
    expect(format_currency_compact(1_000_000)).toBe("£1.0m");
  });
});
