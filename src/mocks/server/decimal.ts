/**
 * MOCK BACKEND ONLY — exact decimal helpers for the demonstration API.
 * Money is held as decimal strings; arithmetic is done on BigInt hundredths or exact rationals.
 * The production system performs all of this in FastAPI with Python Decimal.
 */
export interface Rational {
  n: bigint;
  d: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x || 1n;
}

export function rat(n: bigint, d: bigint = 1n): Rational {
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export function ratFrom(value: string): Rational {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const n = BigInt(whole + fraction || "0");
  return rat(negative ? -n : n, 10n ** BigInt(fraction.length));
}

export const radd = (a: Rational, b: Rational) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const rsub = (a: Rational, b: Rational) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const rmul = (a: Rational, b: Rational) => rat(a.n * b.n, a.d * b.d);
export const rdiv = (a: Rational, b: Rational) => rat(a.n * b.d, a.d * b.n);

export function rpow(a: Rational, exp: number): Rational {
  return rat(a.n ** BigInt(exp), a.d ** BigInt(exp));
}

/** Rounds half-up (away from zero on .5) to `increment` of the unit, returning hundredths. */
export function roundHalfUp(value: Rational, unitHundredths: bigint = 1n): bigint {
  const unit = rat(unitHundredths, 100n);
  const q = rdiv(value, unit);
  const sign = q.n < 0n ? -1n : 1n;
  const abs = q.n * sign;
  return sign * ((2n * abs + q.d) / (2n * q.d)) * unitHundredths;
}

export function roundUp(value: Rational, unitHundredths: bigint): bigint {
  const q = rdiv(value, rat(unitHundredths, 100n));
  return ((q.n + q.d - 1n) / q.d) * unitHundredths;
}

export function toCents(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const cents = BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -cents : cents;
}

export function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${abs / 100n}.${fraction}`;
}

export const centsRat = (cents: bigint) => rat(cents, 100n);
export const add = (...values: string[]) => fromCents(values.reduce((sum, v) => sum + toCents(v), 0n));
export const sub = (a: string, b: string) => fromCents(toCents(a) - toCents(b));
export const cmp = (a: string, b: string) => (toCents(a) === toCents(b) ? 0 : toCents(a) < toCents(b) ? -1 : 1);
export const min = (a: string, b: string) => (cmp(a, b) <= 0 ? a : b);
export const isZero = (a: string) => toCents(a) === 0n;
export const isPositive = (a: string) => toCents(a) > 0n;

/** value ÷ total as a percentage string with two decimals. */
export function percent(value: string, total: string): string {
  if (isZero(total)) return "0.00";
  return fromCents(roundHalfUp(rdiv(rmul(ratFrom(value), rat(100n)), ratFrom(total))));
}
