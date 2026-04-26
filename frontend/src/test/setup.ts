import "@testing-library/jest-dom/vitest";

// Recharts ResponsiveContainer needs ResizeObserver
if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class ResizeObserver {
    observe() { return undefined; }
    unobserve() { return undefined; }
    disconnect() { return undefined; }
  };
}
