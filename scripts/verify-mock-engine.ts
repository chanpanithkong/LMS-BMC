/**
 * Checks the demonstration engine against the verified examples in SRS §10.9.
 * Run: npm run verify:engine
 */
import { accruedInterest, generateSchedule, penaltyInterest, revisePrepayment, type PrepaymentOption, type Terms } from "../src/mocks/server/engine";

const base: Terms = {
  principal: "1200.00", currency: "USD", annual_rate: "18", interest_method: "REDUCING", amortisation: "EQUAL_INSTALLMENT",
  day_count: "30/360", frequency: "MONTHLY", term: 12, disbursement_date: "2027-01-05",
};
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`}`);
}
const totals = (t: Terms) => generateSchedule(t).installments.map((r) => r.total);
const interests = (t: Terms) => generateSchedule(t).installments.map((r) => r.interest);

const e1 = generateSchedule(base);
check("E1 first", [e1.installments[0].total, e1.installments[0].principal, e1.installments[0].interest], ["110.02", "92.02", "18.00"]);
check("E1 last", [e1.installments[11].total, e1.installments[11].principal, e1.installments[11].interest], ["109.98", "108.35", "1.63"]);
check("E1 totals", [e1.total_interest, e1.total_principal, e1.total_payment], ["120.20", "1200.00", "1320.20"]);
check("E1 balance after 3", e1.installments[2].closing, "919.78");

check("E2 equal principal", totals({ ...base, amortisation: "EQUAL_PRINCIPAL", term: 6 }), ["218.00", "215.00", "212.00", "209.00", "206.00", "203.00"]);

const e3 = generateSchedule({ ...base, principal: "1000.00", annual_rate: "24", interest_method: "FLAT", term: 6 });
check("E3 flat", e3.installments.map((r) => r.total), ["186.67", "186.67", "186.67", "186.67", "186.67", "186.65"]);
check("E3 IRR", [e3.total_interest, e3.effective_rate_per_period, e3.effective_rate_nominal_annual], ["120.00", "3.3374", "40.05"]);

const e4 = totals({ ...base, principal: "5000.00", annual_rate: "12", amortisation: "INTEREST_ONLY", term: 6 });
check("E4 interest-only", e4, ["50.00", "50.00", "50.00", "50.00", "50.00", "5050.00"]);

const e5 = generateSchedule({ ...base, principal: "2000.00", annual_rate: "15", interest_method: "SIMPLE", amortisation: "BULLET", day_count: "ACT/365", term: 1, disbursement_date: "2027-01-01", first_due_date: "2027-04-01" });
check("E5 bullet", [e5.total_interest, e5.total_payment], ["73.97", "2073.97"]);

const khr: Terms = { ...base, principal: "4000000.00", currency: "KHR", annual_rate: "24", rounding_increment: undefined };
const e6 = generateSchedule(khr);
check("E6 KHR", [e6.installments[0].total, e6.installments[0].interest, e6.installments[0].principal, e6.installments[11].total, e6.total_interest], ["378238.00", "80000.00", "298238.00", "378244.00", "538862.00"]);
const e6b = generateSchedule({ ...khr, rounding_increment: "100" });
check("E6b KHR 100 riel", [e6b.installments[0].total, e6b.installments[11].total, e6b.total_interest], ["378300.00", "377475.00", "538775.00"]);

const e7terms: Terms = { ...base, principal: "1000.00", amortisation: "EQUAL_PRINCIPAL", day_count: "ACT/365", term: 3, disbursement_date: "2027-01-15", first_due_date: "2027-02-28" };
const e7Dates = generateSchedule(e7terms);
check("E7 first due anchored to month end", e7Dates.installments.map((r) => r.due_date), ["2027-02-28", "2027-03-28", "2027-04-28"]);

// E7/E8 use month-end anchoring from a 31st anchor.
const e7Month = generateSchedule({ ...e7terms, first_due_date: "2027-01-31", disbursement_date: "2026-12-15" });
check("Month-end anchor", e7Month.installments.map((r) => r.due_date), ["2027-01-31", "2027-02-28", "2027-03-31"]);
const e8 = { ...e7terms, disbursement_date: "2028-01-31", first_due_date: "2028-02-29" };
check("Feb leap anchor keeps 29 from anchor", generateSchedule({ ...e8, first_due_date: "2028-01-31", disbursement_date: "2027-12-31" }).installments[1].due_date, "2028-02-29");
check("Business-day payment date (28 Feb 2027 is Sunday)", generateSchedule(e7terms).installments[0].payment_due_date, "2027-03-01");
check("E7 day counts", e7Dates.installments[0].days, 44);
check("E7 interest 1", e7Dates.installments[0].interest, "21.70");

const e9 = generateSchedule({ ...base, term: 8, grace_type: "PRINCIPAL", grace_periods: 2 });
check("E9 principal grace", [e9.installments[0].total, e9.installments[2].total, e9.installments[7].principal, e9.installments[7].interest, e9.total_interest], ["18.00", "210.63", "207.52", "3.11", "99.78"]);

const e10 = generateSchedule({ ...base, disbursement_date: "2027-01-20", first_due_date: "2027-03-05" });
check("E10 odd days", e10.installments[0].total, "119.02");

const e11 = generateSchedule({ ...base, principal: "520.00", annual_rate: "26", frequency: "WEEKLY", term: 10 });
check("E11 weekly", [e11.installments[0].total, e11.installments[9].total, e11.total_interest], ["53.44", "53.46", "14.42"]);

const e12 = generateSchedule({ ...base, principal: "1000.00", annual_rate: "12", term: 6, grace_type: "FULL_CAPITALISED", grace_periods: 2 });
check("E12 capitalised", [e12.installments[1].closing, e12.installments[2].total, e12.installments[5].total, e12.total_interest], ["1020.10", "261.43", "261.44", "45.73"]);

check("E13 settlement interest", accruedInterest("919.78", base, "2027-04-05", "2027-04-20"), "6.90");
check("E14 penalty on installment", penaltyInterest("110.02", "0.1", 7), "0.77");
check("E14 penalty on principal", penaltyInterest("92.02", "0.1", 7), "0.64");
check("Flat + equal principal rejected", (() => { try { generateSchedule({ ...base, interest_method: "FLAT", amortisation: "EQUAL_PRINCIPAL" }); return ""; } catch (e) { return (e as { code: string }).code; } })(), "UNSUPPORTED_METHOD_COMBINATION");
void interests;

// Partial prepayment of 200.00 on E1 after installment 3. Expected values come from an independent Decimal calculation.
const after3 = e1.installments.slice(3);
const prepay = (option: PrepaymentOption, date: string) => revisePrepayment({ terms: base, balance: "919.78", amount: "200.00", date, periodStart: "2027-04-05", dueDates: after3.map((r) => r.due_date), regular: { total: after3[0].total, principal: after3[0].principal }, option });
const shape = (rows: ReturnType<typeof prepay>) => [rows.length, rows[0].total, rows[0].interest, rows[rows.length - 1].total, rows[rows.length - 1].principal, rows.reduce((s, r) => s + BigInt(r.interest.replace(".", "")), BigInt(0)).toString(), rows[rows.length - 1].closing];
check("Prepayment on due date, reduce term", shape(prepay("REDUCE_TERM", "2027-04-05")), [7, "110.02", "10.80", "103.20", "101.67", "4354", "0.00"]);
check("Prepayment on due date, reduce installment", shape(prepay("REDUCE_INSTALLMENT", "2027-04-05")), [9, "86.09", "10.80", "86.13", "84.86", "5507", "0.00"]);
check("Prepayment 15 days in, reduce term", shape(prepay("REDUCE_TERM", "2027-04-20")), [7, "110.02", "12.30", "104.83", "103.28", "4517", "0.00"]);
check("Prepayment 15 days in, reduce installment", shape(prepay("REDUCE_INSTALLMENT", "2027-04-20")), [9, "86.09", "12.30", "87.81", "86.51", "5675", "0.00"]);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll engine checks passed");
process.exit(failed ? 1 : 0);
