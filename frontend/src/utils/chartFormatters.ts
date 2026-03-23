export function formatCompactCurrencyTick(value: number): string {
  if (!Number.isFinite(value)) return "£0";

  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `£${formatCompactNumber(value / 1_000_000_000)}b`;
  if (abs >= 1_000_000) return `£${formatCompactNumber(value / 1_000_000)}m`;
  if (abs >= 1_000) return `£${formatCompactNumber(value / 1_000)}k`;
  return `£${Math.round(value)}`;
}

export function getCurrencyAxisWidth(values: number[]): number {
  const finite_values = values.filter((value) => Number.isFinite(value));
  if (finite_values.length === 0) return 56;

  const max_abs = Math.max(...finite_values.map((value) => Math.abs(value)), 0);
  const samples = Array.from(
    new Set([0, max_abs, max_abs * 0.75, max_abs * 0.5, -max_abs].filter((value) => Number.isFinite(value)))
  );
  const max_label_length = Math.max(...samples.map((value) => formatCompactCurrencyTick(value).length));

  return Math.min(Math.max(16 + max_label_length * 8, 56), 88);
}

function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  const decimals = abs < 10 ? 1 : 0;
  return stripTrailingZeros(value.toFixed(decimals));
}

function stripTrailingZeros(value: string): string {
  return value.replace(/\.0$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}
