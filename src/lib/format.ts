// Centralized number formatting — Croatian standard (comma as decimal separator).
const LOCALE = "hr-HR";

/** Format a number with a fixed number of decimals (comma separator, no grouping surprises). */
export function formatNumber(
  value: number | null | undefined,
  decimals = 2,
  fallback = "—"
): string {
  if (value == null || Number.isNaN(Number(value))) return fallback;
  return Number(value).toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format an integer-ish quantity (no forced decimals). */
export function formatQty(value: number | null | undefined, fallback = "—"): string {
  if (value == null || Number.isNaN(Number(value))) return fallback;
  return Number(value).toLocaleString(LOCALE, { maximumFractionDigits: 2 });
}

/** Format a money amount with currency suffix, e.g. "21,65 EUR". */
export function formatMoney(
  value: number | null | undefined,
  currency = "EUR",
  fallback = "—"
): string {
  if (value == null || Number.isNaN(Number(value))) return fallback;
  return `${formatNumber(value, 2)}${currency ? ` ${currency}` : ""}`;
}

/** Format a percentage, e.g. "10,5%". Trailing ",0" is dropped. */
export function formatPercent(
  value: number | null | undefined,
  decimals = 1,
  fallback = "—"
): string {
  if (value == null || Number.isNaN(Number(value))) return fallback;
  const rounded = Number(Number(value).toFixed(decimals));
  return `${rounded.toLocaleString(LOCALE, { maximumFractionDigits: decimals })}%`;
}

/**
 * Parse user input that may use a comma (or dot) as decimal separator.
 * Returns NaN when the input is not a usable number.
 */
export function parseDecimalInput(value: string): number {
  if (value == null) return NaN;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "" || normalized === "-" || normalized === ".") return NaN;
  return Number(normalized);
}

/** Render a numeric value for use inside a text input (comma separator). */
export function toInputString(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "";
  return String(Number(Number(value).toFixed(2))).replace(".", ",");
}
