/**
 * Display formatting for decimal strings. Amounts are never converted to JavaScript numbers:
 * every function here works on the digits of the string the API returned (SRS CN-5, §16.1).
 */
export type CurrencyCode = "USD" | "KHR";

export const CURRENCY_PRECISION: Record<CurrencyCode, number> = { USD: 2, KHR: 0 };

const DECIMAL = /^-?\d+(\.\d+)?$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL.test(value);
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Formats a decimal string to the currency's precision without changing its value. */
export function formatAmount(value: string | null | undefined, currency: CurrencyCode = "USD"): string {
  if (value === null || value === undefined || value === "" || !isDecimalString(value)) return "—";
  const precision = CURRENCY_PRECISION[currency];
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const shown = fraction.slice(0, precision).padEnd(precision, "0");
  const out = groupDigits(whole.replace(/^0+(?=\d)/, "")) + (precision ? `.${shown}` : "");
  return negative ? `-${out}` : out;
}

export function formatMoney(value: string | null | undefined, currency: CurrencyCode = "USD"): string {
  const amount = formatAmount(value, currency);
  return amount === "—" ? amount : `${currency} ${amount}`;
}

/** Strips grouping so a typed value can be sent to the API as a decimal string. */
export function normaliseDecimalInput(input: string, currency: CurrencyCode): string {
  const cleaned = input.replace(/,/g, "").replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  const whole = firstDot === -1 ? cleaned : cleaned.slice(0, firstDot);
  const fraction = firstDot === -1 ? "" : cleaned.slice(firstDot + 1).replace(/\./g, "");
  const precision = CURRENCY_PRECISION[currency];
  if (precision === 0 || firstDot === -1) return whole;
  return `${whole}.${fraction.slice(0, precision)}`;
}

/** True when the value is a positive decimal string. String-only check: no arithmetic. */
export function isPositiveDecimal(value: string): boolean {
  return isDecimalString(value) && !value.startsWith("-") && /[1-9]/.test(value);
}

export function formatPercent(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${value} %`;
}
