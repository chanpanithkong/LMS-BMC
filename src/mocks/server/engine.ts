/**
 * MOCK BACKEND ONLY — demonstration implementation of SRS §10.
 * Stands in for the FastAPI engine so the UI has realistic responses. Never used for real lending.
 */
import {
  centsRat, fromCents, rat, ratFrom, radd, rdiv, rmul, rpow, rsub, roundHalfUp, roundUp, toCents, type Rational,
} from "./decimal";

export type InterestMethod = "REDUCING" | "FLAT" | "SIMPLE";
export type Amortisation = "EQUAL_INSTALLMENT" | "EQUAL_PRINCIPAL" | "INTEREST_ONLY" | "BULLET";
export type DayCount = "30/360" | "ACT/365" | "ACT/366" | "ACT/ACT";
export type Frequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "AT_MATURITY";
export type GraceType = "NONE" | "PRINCIPAL" | "FULL_CAPITALISED";

export interface Terms {
  principal: string;
  currency: "USD" | "KHR";
  annual_rate: string;
  interest_method: InterestMethod;
  amortisation: Amortisation;
  day_count: DayCount;
  frequency: Frequency;
  term: number;
  disbursement_date: string;
  first_due_date?: string;
  grace_type?: GraceType;
  grace_periods?: number;
  rounding_increment?: string;
}

export interface EngineInstallment {
  no: number;
  due_date: string;
  payment_due_date: string;
  days: number;
  opening: string;
  principal: string;
  interest: string;
  total: string;
  closing: string;
}

export interface ScheduleResult {
  installments: EngineInstallment[];
  total_principal: string;
  total_interest: string;
  total_payment: string;
  regular_installment: string;
  maturity_date: string;
  effective_rate_per_period: string;
  effective_rate_nominal_annual: string;
  engine_version: string;
  warnings: string[];
}

export class EngineError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const PERIODS: Record<Frequency, bigint> = { WEEKLY: 52n, BIWEEKLY: 26n, MONTHLY: 12n, QUARTERLY: 4n, AT_MATURITY: 1n };

// Date helpers: pure calendar arithmetic on UTC midnights.
const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
export const addDays = (iso: string, days: number) => fromUtc(toUtc(iso) + days * 86_400_000);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function addMonthsAnchored(iso: string, months: number, anchor: number): string {
  const total = +iso.slice(0, 4) * 12 + (+iso.slice(5, 7) - 1) + months;
  const y = Math.floor(total / 12);
  const m = total % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(Math.min(anchor, daysInMonth(y, m))).padStart(2, "0")}`;
}

function days30360(a: string, b: string): number {
  const d1 = Math.min(+a.slice(8, 10), 30);
  const d2 = Math.min(+b.slice(8, 10), 30);
  return (+b.slice(0, 4) - +a.slice(0, 4)) * 360 + (+b.slice(5, 7) - +a.slice(5, 7)) * 30 + (d2 - d1);
}

/** BR-CALC-004: next-business-day payment date; the interest period keeps the scheduled date. */
export function adjustBusinessDay(iso: string, holidays: ReadonlySet<string>): string {
  let current = iso;
  for (;;) {
    const weekday = new Date(toUtc(current)).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(current)) return current;
    current = addDays(current, 1);
  }
}

function dueDates(t: Terms, count: number): string[] {
  const first = t.first_due_date ?? defaultFirstDue(t);
  if (t.frequency === "WEEKLY" || t.frequency === "BIWEEKLY") {
    const step = t.frequency === "WEEKLY" ? 7 : 14;
    return Array.from({ length: count }, (_, k) => addDays(first, step * k));
  }
  const step = t.frequency === "QUARTERLY" ? 3 : 1;
  const anchor = +first.slice(8, 10);
  return Array.from({ length: count }, (_, k) => addMonthsAnchored(first, k * step, anchor));
}

function defaultFirstDue(t: Terms): string {
  if (t.frequency === "WEEKLY") return addDays(t.disbursement_date, 7);
  if (t.frequency === "BIWEEKLY") return addDays(t.disbursement_date, 14);
  const months = t.frequency === "QUARTERLY" ? 3 : t.frequency === "AT_MATURITY" ? t.term : 1;
  return addMonthsAnchored(t.disbursement_date, months, +t.disbursement_date.slice(8, 10));
}

/** ACT/ACT splits a period by calendar year: days in a leap year over 366, the rest over 365. */
function actualFraction(t: Terms, from: string, to: string): Rational {
  if (t.day_count === "ACT/365") return rat(BigInt(daysBetween(from, to)), 365n);
  if (t.day_count === "ACT/366") return rat(BigInt(daysBetween(from, to)), 366n);
  let result = rat(0n);
  let cursor = from;
  while (cursor < to) {
    const y = +cursor.slice(0, 4);
    const yearEnd = `${y + 1}-01-01`;
    const end = yearEnd < to ? yearEnd : to;
    result = radd(result, rat(BigInt(daysBetween(cursor, end)), isLeap(y) ? 366n : 365n));
    cursor = end;
  }
  return result;
}

function validate(t: Terms) {
  const ok =
    (t.interest_method === "REDUCING" && ["EQUAL_INSTALLMENT", "EQUAL_PRINCIPAL", "INTEREST_ONLY", "BULLET"].includes(t.amortisation)) ||
    (t.interest_method === "FLAT" && ["EQUAL_INSTALLMENT", "BULLET"].includes(t.amortisation)) ||
    (t.interest_method === "SIMPLE" && ["INTEREST_ONLY", "BULLET"].includes(t.amortisation));
  if (!ok) throw new EngineError("UNSUPPORTED_METHOD_COMBINATION", `${t.interest_method} interest cannot be combined with ${t.amortisation} amortisation (SRS §10.2).`);
  if (toCents(t.principal) <= 0n) throw new EngineError("VALIDATION_FAILED", "Principal must be greater than zero.");
  if (!Number.isInteger(t.term) || t.term < 1) throw new EngineError("VALIDATION_FAILED", "Term must be at least one period.");
}

export function generateSchedule(t: Terms, holidays: ReadonlySet<string> = new Set()): ScheduleResult {
  validate(t);
  const single = t.amortisation === "BULLET";
  const count = single ? 1 : t.term;
  const grace = single ? 0 : (t.grace_periods ?? 0);
  const graceType: GraceType = grace > 0 ? (t.grace_type ?? "NONE") : "NONE";
  const principal = toCents(t.principal);
  const annual = rdiv(ratFrom(t.annual_rate), rat(100n));
  const i = rdiv(annual, rat(PERIODS[t.frequency === "AT_MATURITY" ? "MONTHLY" : t.frequency]));
  const dates = dueDates(t, count);
  const periodic = t.day_count === "30/360";
  const increment = t.rounding_increment ? toCents(t.rounding_increment) : 0n;
  const minorUnit = t.currency === "KHR" ? 100n : 1n;
  const round = (value: Rational) => roundHalfUp(value, minorUnit);
  const warnings: string[] = [];

  const interestFor = (balance: bigint, k: number): bigint => {
    if (periodic) return round(rmul(centsRat(balance), i));
    const from = k === 0 ? t.disbursement_date : dates[k - 1];
    return round(rmul(rmul(centsRat(balance), annual), actualFraction(t, from, dates[k])));
  };

  // Irregular first period on 30/360 products (BR-CALC-005, example E10).
  let oddInterest = 0n;
  if (periodic && t.first_due_date && t.frequency === "MONTHLY" && !single) {
    const odd = days30360(t.disbursement_date, t.first_due_date) - 30;
    if (odd !== 0) oddInterest = round(rdiv(rmul(rmul(centsRat(principal), annual), rat(BigInt(odd))), rat(360n)));
  }

  const rows: Omit<EngineInstallment, "due_date" | "payment_due_date" | "days">[] = [];
  let balance = principal;

  if (single) {
    const fraction = periodic
      ? rat(BigInt(days30360(t.disbursement_date, dates[0])), 360n)
      : actualFraction(t, t.disbursement_date, dates[0]);
    const interest = round(rmul(rmul(centsRat(principal), annual), fraction));
    rows.push(row(1, principal, principal, interest));
  } else if (t.interest_method === "FLAT") {
    const totalInterest = round(rmul(rmul(centsRat(principal), i), rat(BigInt(count))));
    const each = round(rdiv(centsRat(totalInterest), rat(BigInt(count))));
    const principalEach = round(rdiv(centsRat(principal), rat(BigInt(count))));
    for (let k = 0; k < count; k++) {
      const last = k === count - 1;
      const p = last ? balance : principalEach;
      rows.push(row(k + 1, balance, p, last ? totalInterest - each * BigInt(count - 1) : each));
      balance -= p;
    }
  } else if (t.amortisation === "INTEREST_ONLY") {
    for (let k = 0; k < count; k++) {
      const last = k === count - 1;
      rows.push(row(k + 1, balance, last ? balance : 0n, interestFor(balance, k)));
    }
  } else {
    for (let k = 0; k < grace; k++) {
      const interest = interestFor(balance, k);
      if (graceType === "FULL_CAPITALISED") {
        const next = balance + interest;
        rows.push({ no: k + 1, opening: fromCents(balance), principal: "0.00", interest: fromCents(interest), total: "0.00", closing: fromCents(next) });
        balance = next;
      } else {
        rows.push(row(k + 1, balance, 0n, interest));
      }
    }
    const remaining = count - grace;
    const annuity = () => {
      const factor = rsub(rat(1n), rdiv(rat(1n), rpow(radd(rat(1n), i), remaining)));
      return i.n === 0n ? rdiv(centsRat(balance), rat(BigInt(remaining))) : rdiv(rmul(centsRat(balance), i), factor);
    };
    const installment =
      t.amortisation === "EQUAL_INSTALLMENT" ? (increment ? roundUp(annuity(), increment) : round(annuity())) : 0n;
    const principalEach = round(rdiv(centsRat(balance), rat(BigInt(remaining))));
    for (let k = grace; k < count; k++) {
      const interest = interestFor(balance, k);
      const last = k === count - 1;
      const p = last ? balance : t.amortisation === "EQUAL_INSTALLMENT" ? installment - interest : principalEach;
      if (p <= 0n && !last) throw new EngineError("VALIDATION_FAILED", "Installment does not cover interest for these terms.");
      rows.push(row(k + 1, balance, p, interest));
      balance -= p;
    }
  }

  function row(no: number, opening: bigint, p: bigint, interest: bigint) {
    return { no, opening: fromCents(opening), principal: fromCents(p), interest: fromCents(interest), total: fromCents(p + interest), closing: fromCents(opening - p) };
  }

  if (oddInterest !== 0n) {
    rows[0].interest = fromCents(toCents(rows[0].interest) + oddInterest);
    rows[0].total = fromCents(toCents(rows[0].total) + oddInterest);
  }

  const installments = rows.map((r, k) => ({
    ...r,
    due_date: dates[k],
    payment_due_date: adjustBusinessDay(dates[k], holidays),
    days: periodic ? days30360(k === 0 ? t.disbursement_date : dates[k - 1], dates[k]) : daysBetween(k === 0 ? t.disbursement_date : dates[k - 1], dates[k]),
  }));

  const totalInterest = installments.reduce((s, r) => s + toCents(r.interest), 0n);
  const totalPayment = installments.reduce((s, r) => s + toCents(r.total), 0n);
  const scheduled = graceType === "FULL_CAPITALISED" ? totalPayment - totalInterest + toCents(installments.slice(0, grace).reduce((s, r) => fromCents(toCents(s) + toCents(r.interest)), "0.00")) : totalPayment - totalInterest;

  const irr = internalRate(principal, installments.map((r) => toCents(r.total)));
  const periodsPerYear = PERIODS[t.frequency === "AT_MATURITY" ? "MONTHLY" : t.frequency];
  return {
    installments,
    total_principal: fromCents(scheduled),
    total_interest: fromCents(totalInterest),
    total_payment: fromCents(totalPayment),
    regular_installment: installments[Math.min(grace, installments.length - 1)].total,
    maturity_date: dates[dates.length - 1],
    effective_rate_per_period: scaleToPercent(irr, 4),
    effective_rate_nominal_annual: scaleToPercent(irr * periodsPerYear, 2),
    engine_version: "mock-1.0",
    warnings,
  };
}

const IRR_SCALE = 10n ** 18n;

/** Period IRR by bisection in fixed point; the result is scaled by IRR_SCALE. */
export function internalRate(amount: bigint, payments: bigint[]): bigint {
  const npv = (r: bigint) => {
    let pv = 0n;
    let factor = IRR_SCALE;
    for (const payment of payments) {
      factor = (factor * IRR_SCALE) / (IRR_SCALE + r);
      pv += payment * factor;
    }
    return pv - amount * IRR_SCALE;
  };
  let low = 0n;
  let high = IRR_SCALE;
  for (let k = 0; k < 90; k++) {
    const mid = (low + high) / 2n;
    if (npv(mid) > 0n) low = mid;
    else high = mid;
  }
  return (low + high) / 2n;
}

function scaleToPercent(value: bigint, places: number): string {
  const unit = IRR_SCALE / (100n * 10n ** BigInt(places));
  const scaled = (value + unit / 2n) / unit;
  const text = scaled.toString().padStart(places + 1, "0");
  return `${text.slice(0, -places)}.${text.slice(-places)}`;
}

/** Settlement interest for option A (SRS §10.7, example E13). */
export function accruedInterest(balance: string, t: Terms, from: string, to: string): string {
  const annual = rdiv(ratFrom(t.annual_rate), rat(100n));
  const fraction = t.day_count === "30/360" ? rat(BigInt(Math.max(days30360(from, to), 0)), 360n) : actualFraction(t, from, to);
  return fromCents(roundHalfUp(rmul(rmul(ratFrom(balance), annual), fraction)));
}

/** Penalty interest on a base amount (SRS §10.8, example E14). */
export function penaltyInterest(base: string, dailyRatePercent: string, chargeableDays: number): string {
  if (chargeableDays <= 0) return "0.00";
  return fromCents(roundHalfUp(rmul(rmul(ratFrom(base), rdiv(ratFrom(dailyRatePercent), rat(100n))), rat(BigInt(chargeableDays)))));
}
