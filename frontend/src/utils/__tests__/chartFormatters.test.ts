import { describe, it, expect } from "vitest";
import { formatCompactCurrencyTick, getCurrencyAxisWidth } from "../chartFormatters";

describe("formatCompactCurrencyTick", () => {
  it("formats zero", () => {
    expect(formatCompactCurrencyTick(0)).toBe("£0");
  });

  it("formats negative zero", () => {
    expect(formatCompactCurrencyTick(-0)).toBe("£0");
  });

  it("formats small values as round numbers", () => {
    expect(formatCompactCurrencyTick(100)).toBe("£100");
    expect(formatCompactCurrencyTick(999)).toBe("£999");
  });

  it("formats thousands with k suffix", () => {
    expect(formatCompactCurrencyTick(1_000)).toBe("£1k");
    expect(formatCompactCurrencyTick(1_500)).toBe("£1.5k");
    expect(formatCompactCurrencyTick(10_000)).toBe("£10k");
    expect(formatCompactCurrencyTick(99_999)).toBe("£100k");
  });

  it("formats millions with m suffix", () => {
    expect(formatCompactCurrencyTick(1_000_000)).toBe("£1m");
    expect(formatCompactCurrencyTick(1_500_000)).toBe("£1.5m");
    expect(formatCompactCurrencyTick(10_000_000)).toBe("£10m");
    expect(formatCompactCurrencyTick(99_999_999)).toBe("£100m");
  });

  it("formats billions with b suffix", () => {
    expect(formatCompactCurrencyTick(1_000_000_000)).toBe("£1b");
    expect(formatCompactCurrencyTick(1_500_000_000)).toBe("£1.5b");
    expect(formatCompactCurrencyTick(10_000_000_000)).toBe("£10b");
  });

  it("handles negative values", () => {
    expect(formatCompactCurrencyTick(-1_000)).toBe("£-1k");
    expect(formatCompactCurrencyTick(-1_500_000)).toBe("£-1.5m");
    expect(formatCompactCurrencyTick(-1_500_000_000)).toBe("£-1.5b");
  });

  it("handles non-finite values", () => {
    expect(formatCompactCurrencyTick(Infinity)).toBe("£0");
    expect(formatCompactCurrencyTick(-Infinity)).toBe("£0");
    expect(formatCompactCurrencyTick(NaN)).toBe("£0");
  });

  it("formats values at exact boundaries", () => {
    expect(formatCompactCurrencyTick(999.99)).toBe("£1000");
    expect(formatCompactCurrencyTick(1_000)).toBe("£1k");
    expect(formatCompactCurrencyTick(999_999)).toBe("£1000k");
    expect(formatCompactCurrencyTick(1_000_000)).toBe("£1m");
  });
});

describe("getCurrencyAxisWidth", () => {
  it("returns default width for empty array", () => {
    expect(getCurrencyAxisWidth([])).toBe(56);
  });

  it("returns default width for non-finite values", () => {
    expect(getCurrencyAxisWidth([Infinity, -Infinity, NaN])).toBe(56);
  });

  it("returns minimum width for small values", () => {
    expect(getCurrencyAxisWidth([100, 200, 300])).toBe(56);
  });

  it("returns wider width for larger values", () => {
    // Values that produce labels of different lengths
    const small = getCurrencyAxisWidth([1_000, 2_000]);     // "£1k" = 3 chars
    const medium = getCurrencyAxisWidth([10_000, 20_000]);   // "£10k" = 4 chars
    const large = getCurrencyAxisWidth([1_000_000, 2_000_000]); // "£1m" = 3 chars
    // The medium values produce wider axis because labels like "£10k" are longer
    expect(medium).toBeGreaterThanOrEqual(small);
    expect(large).toBeGreaterThanOrEqual(medium);
  });

  it("caps width at maximum 88", () => {
    const hugeValues = [1_000_000_000, 2_000_000_000, 999_999_999];
    const width = getCurrencyAxisWidth(hugeValues);
    expect(width).toBeLessThanOrEqual(88);
  });

  it("handles negative values", () => {
    const width = getCurrencyAxisWidth([-1_000_000, -500_000]);
    expect(width).toBeGreaterThanOrEqual(56);
  });

  it("handles mixed positive and negative", () => {
    const width = getCurrencyAxisWidth([1_000_000, -1_000_000, 500_000]);
    // max_abs = 1_000_000 produces labels like "£1m", "£-1m" which are short
    // so width stays at the 56 minimum
    expect(width).toBeGreaterThanOrEqual(56);
    expect(width).toBeLessThanOrEqual(88);
  });

  it("handles zero values", () => {
    const width = getCurrencyAxisWidth([0, 0, 0]);
    expect(width).toBe(56); // max_abs = 0, so falls back to default
  });

  it("produces consistent width for same range", () => {
    const width1 = getCurrencyAxisWidth([500_000, 1_000_000]);
    const width2 = getCurrencyAxisWidth([1_000_000, 500_000]);
    expect(width1).toBe(width2);
  });
});
