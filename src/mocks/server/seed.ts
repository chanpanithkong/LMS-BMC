/**
 * MOCK BACKEND ONLY — fictional demonstration data. Names, IDs, phones and amounts are invented; rates and limits are illustrative.
 */
import { add, fromCents, isPositive, rdiv, rmul, rat, ratFrom, roundHalfUp, sub, toCents } from "./decimal";
import { addDays, addMonthsAnchored, penaltyInterest, type Terms } from "./engine";
import {
  activeSchedule, applyRepayment, asInstallments, audit, buildSchedule, ctxFor, dpdOf, holidays, nextSeq, notify, nowIso, outstandingPrincipal, pad, postJournal, postTxn,
  refreshInstallments, resetState, state, table, today, type Installment, type Row,
} from "./store";

const iso = (daysAgo: number) => addDays(today(), -daysAgo);
const stamp = (daysAgo: number, hour = 9) => `${iso(daysAgo)}T${String(hour).padStart(2, "0")}:15:00+07:00`;

export const BRANCHES = [
  { id: "br-pp1", code: "PP1", name: "Phnom Penh Main", name_km: "ភ្នំពេញ សាខាធំ", province: "Phnom Penh", phone: "+855 23 900 101", manager: "Meas Rithy", status: "ACTIVE", cash_points: 3, calendar: "Cambodia Default" },
  { id: "br-srp", code: "SRP", name: "Siem Reap", name_km: "សៀមរាប", province: "Siem Reap", phone: "+855 63 900 102", manager: "Chhim Sokha", status: "ACTIVE", cash_points: 2, calendar: "Cambodia Default" },
  { id: "br-btb", code: "BTB", name: "Battambang", name_km: "បាត់ដំបង", province: "Battambang", phone: "+855 53 900 103", manager: "Ros Vichea", status: "ACTIVE", cash_points: 2, calendar: "Cambodia Default" },
  { id: "br-kcm", code: "KCM", name: "Kampong Cham", name_km: "កំពង់ចាម", province: "Kampong Cham", phone: "+855 42 900 104", manager: "Touch Sambath", status: "ACTIVE", cash_points: 1, calendar: "Cambodia Default" },
];

const branch = (id: string) => BRANCHES.find((b) => b.id === id)!;
export const DEMO_PASSWORD = "Demo@Lms2026!";
export const DEMO_MFA = "123456";

const USERS: [string, string, string, string, string[], string[], string][] = [
  ["sysadmin", "Chan Vuthy", "ចាន់ វុទ្ធី", "sysadmin@demo.lms.test", ["SYSADMIN"], ["*"], "0"],
  ["owner", "Keo Sophea", "កែវ សុភា", "owner@demo.lms.test", ["OWNER"], ["*"], "250000"],
  ["brmgr", "Meas Rithy", "មាស រិទ្ធី", "brmgr@demo.lms.test", ["BRMGR"], ["br-pp1"], "10000"],
  ["loanoff", "Sok Pisey", "សុខ ពិសី", "loanoff@demo.lms.test", ["LOANOFF"], ["br-pp1"], "0"],
  ["cranalyst", "Lim Sreymom", "លឹម ស្រីមុំ", "cranalyst@demo.lms.test", ["CRANALYST"], ["*"], "0"],
  ["credappr", "Ouk Bunthoeun", "អ៊ុក ប៊ុនធឿន", "credappr@demo.lms.test", ["CREDAPPR"], ["*"], "5000"],
  ["cashier", "Nhem Channary", "ញឹម ចាន់ណារី", "cashier@demo.lms.test", ["CASHIER"], ["br-pp1"], "0"],
  ["acct", "Tep Sothea", "ទេព សុធា", "acct@demo.lms.test", ["ACCT"], ["*"], "0"],
  ["colloff", "Prak Samnang", "ប្រាក់ សំណាង", "colloff@demo.lms.test", ["COLLOFF"], ["br-pp1"], "0"],
  ["cltoff", "Yim Kosal", "យឹម កុសល", "cltoff@demo.lms.test", ["CLTOFF"], ["br-pp1"], "0"],
  ["auditor", "Seng Malis", "សេង ម៉ាលីស", "auditor@demo.lms.test", ["AUDITOR"], ["*"], "0"],
  ["readonly", "Pov Dalin", "ពៅ ដាលីន", "readonly@demo.lms.test", ["READONLY"], ["br-pp1"], "0"],
];

const PEOPLE: [string, string, string][] = [
  ["Sok Dara", "សុខ តារា", "Market vendor"], ["Chea Sreyneang", "ជា ស្រីនាង", "Garment worker"], ["Vong Kimheng", "វង្ស គីមហេង", "Motor repair owner"],
  ["Heng Sophal", "ហេង សុផល", "Teacher"], ["Kong Rachana", "គង់ រចនា", "Nurse"], ["Phan Vannak", "ផាន់ វណ្ណៈ", "Tuk-tuk driver"],
  ["Mao Bopha", "ម៉ៅ បុប្ផា", "Tailor"], ["Nuon Sarath", "នួន សារ៉ាត់", "Rice farmer"], ["Ly Sokunthea", "លី សុគន្ធា", "Civil servant"],
  ["Tan Chanthou", "តាន់ ច័ន្ទធូ", "Grocery owner"], ["Eng Monyroth", "អេង មុនីរ័ត្ន", "Accountant"], ["Roeun Sophea", "រឿន សុភា", "Hairdresser"],
  ["Khim Vibol", "ឃីម វិបុល", "Construction foreman"], ["Sar Sreymao", "សា ស្រីម៉ៅ", "Food stall owner"], ["Dy Pheakdey", "ឌី ភក្តី", "Delivery rider"],
  ["Prum Sovann", "ព្រំ សុវណ្ណ", "Pig farmer"], ["Oum Kanika", "អ៊ុំ កនិកា", "Bank teller"], ["Chhay Rotha", "ឆាយ រដ្ឋា", "Mechanic"],
  ["Sam Nary", "សំ ណារី", "Pharmacist"], ["Bun Thavy", "ប៊ុន ថាវី", "Souvenir seller"], ["Keat Vuthea", "កៀត វុទ្ធា", "Electrician"],
  ["Hour Lina", "ហួរ លីណា", "Beautician"], ["Seng Rithy", "សេង រិទ្ធី", "Fisherman"], ["Yin Sopheap", "យិន សុភាព", "Hotel staff"],
];
const COMPANIES: [string, string, string, string][] = [
  ["Angkor Fresh Produce Co., Ltd.", "អង្គរ ហ្រ្វេស ប្រូឌូស", "Angkor Fresh", "Fresh produce wholesale"],
  ["Mekong Build Materials Co., Ltd.", "មេគង្គ សម្ភារៈសំណង់", "Mekong Build", "Construction materials"],
  ["Tonle Sap Fisheries Trading", "ទន្លេសាប ផលនេសាទ", "Tonle Sap Fish", "Fish processing and trade"],
  ["Battambang Rice Mill Enterprise", "រោងម៉ាស៊ីនកិនស្រូវបាត់ដំបង", "BTB Rice Mill", "Rice milling"],
];
const PLACES = [
  { district: "Khan Chamkar Mon", commune: "Sangkat Tonle Bassac", village: "Phum 3", province: "Phnom Penh", branch: "br-pp1" },
  { district: "Khan Toul Kork", commune: "Sangkat Boeung Kak 1", village: "Phum 5", province: "Phnom Penh", branch: "br-pp1" },
  { district: "Khan Sen Sok", commune: "Sangkat Phnom Penh Thmey", village: "Phum Tuek Thla", province: "Phnom Penh", branch: "br-pp1" },
  { district: "Krong Siem Reap", commune: "Sangkat Sala Kamreuk", village: "Phum Wat Bo", province: "Siem Reap", branch: "br-srp" },
  { district: "Krong Battambang", commune: "Sangkat Svay Por", village: "Phum Prek Moha Tep", province: "Battambang", branch: "br-btb" },
  { district: "Krong Kampong Cham", commune: "Sangkat Veal Vong", village: "Phum 1", province: "Kampong Cham", branch: "br-kcm" },
];

const REQUIRED_DOCS = ["National ID", "Proof of residence", "Income evidence"];

function product(id: string, code: string, name: string, km: string, type: string, currency: "USD" | "KHR", method: string, amort: string, rate: string, min: string, max: string, minT: number, maxT: number, freq: string, fee: string) {
  return {
    id, code, name_en: name, name_km: km, product_type: type, status: "ACTIVE", currency,
    active_version: 1, created_at: stamp(300), created_by: "owner",
    versions: [{
      version_no: 1, status: "ACTIVE", effective_from: iso(300), created_by: "owner", created_by_name: "Keo Sophea", approved_by: "credappr", approved_by_name: "Ouk Bunthoeun", approved_at: stamp(298),
      change_note: "Initial version (illustrative demonstration values).",
      config: {
        name_en: name, name_km: km, product_type: type, currency, min_principal: min, max_principal: max, min_term: minT, max_term: maxT, interest_method: method, amortisation: amort, annual_rate: rate, day_count: "30/360", repayment_frequency: freq,
        grace_type: "NONE", grace_periods: 0, processing_fee_percent: fee, penalty_rule_id: "pen-1", eligibility_min_age: 18, eligibility_max_age: 65, eligibility_min_income: currency === "USD" ? "200.00" : "800000.00", required_documents: REQUIRED_DOCS.join(", "),
        collateral_required: type === "SECURED", min_coverage_percent: type === "SECURED" ? "120" : "0", approval_matrix: "Level 1: Credit Approver up to limit; Level 2: Branch Manager up to limit; Level 3: Business Owner",
        early_settlement_option: "A — Accrued to date", waterfall: "Penalties → Fees → Interest → Principal (oldest first)",
      },
    }],
  };
}

const money = (n: number) => `${n}.00`;

function makeLoan(i: number, b: Row, p: Row, officer: string, amount: string, rateOverride: string | undefined, term: number, status: string, disbursedOn: string) {
  const cfg = p.versions[0].config;
  const terms: Terms = { principal: amount, currency: p.currency, annual_rate: rateOverride ?? cfg.annual_rate, interest_method: cfg.interest_method, amortisation: cfg.amortisation, day_count: cfg.day_count, frequency: cfg.repayment_frequency, term, disbursement_date: disbursedOn };
  const schedule = buildSchedule(terms);
  const br = branch(b.branch_id);
  const accountBody = `${br.code}${p.code}${pad(nextSeq(`loan:${br.code}${p.code}`))}`;
  return {
    id: `ln-${i}`, account_no: `${accountBody}-${(i * 7) % 10}`, borrower_id: b.id, borrower_name: b.name_en, borrower_name_km: b.name_km, branch_id: b.branch_id, branch_name: br.name, branch_code: br.code,
    product_id: p.id, product_code: p.code, product_name: p.name_en, product_version: 1, application_id: `app-l${i}`, officer_id: officer, officer_name: table("users").find((u) => u.id === officer)?.name,
    currency: p.currency, status, approved_amount: amount, contractual_principal: amount, disbursed_principal: "0.00", disbursed_on: null as string | null, approved_on: addDays(disbursedOn, -3), terms, annual_rate: terms.annual_rate, term,
    frequency: terms.frequency, purpose: ["Working capital", "Home improvement", "Education", "Agriculture inputs", "Vehicle purchase"][i % 5], sector: ["Trade", "Services", "Agriculture", "Construction", "Household"][i % 5],
    maturity_date: schedule.maturity_date, restructure_count: 0, flags: [] as string[], collection_officer_id: null as string | null, collection_officer_name: null as string | null, last_contact: null as string | null, next_follow_up: null as string | null, closed_on: null as string | null, closure_type: null as string | null,
    schedule_versions: [{ version_no: 1, status: status === "ACTIVE" || status.startsWith("CLOSED") || status === "WRITTEN_OFF" ? "ACTIVE" : "PROPOSED", reason: "ORIGINAL", effective_from: disbursedOn, engine_version: schedule.engine_version, total_principal: schedule.total_principal, total_interest: schedule.total_interest, installments: asInstallments(schedule.installments) }],
    terms_versions: [{ version_no: 1, status: "EXECUTED", effective_from: disbursedOn, source: "APPROVAL", annual_rate: terms.annual_rate, term, frequency: terms.frequency, interest_method: terms.interest_method, amortisation: terms.amortisation, day_count: terms.day_count }],
    transactions: [] as Row[], created_at: stamp(0),
  };
}

function disburse(loan: Row, date: string, feePercent: string, ctx: Row | null) {
  const fee = fromCents(roundHalfUp(rdiv(rmul(ratFrom(loan.contractual_principal), ratFrom(feePercent)), rat(100n))));
  const net = sub(loan.contractual_principal, fee);
  const method = Number(loan.id.slice(3)) % 3 === 0 ? "BANK_TRANSFER" : "CASH";
  loan.disbursed_principal = loan.contractual_principal;
  loan.disbursed_on = date;
  const no = `${loan.branch_code}-D-${date.slice(0, 4)}-${pad(nextSeq(`disb:${loan.branch_code}`))}`;
  postTxn(loan, "DISBURSEMENT", "PRINCIPAL", loan.contractual_principal, date, no, null);
  if (isPositive(fee)) postTxn(loan, "FEE_DEDUCTED", "FEE", fee, date, no, null);
  postJournal({ description: `Disbursement ${no} — ${loan.account_no}`, date, source_type: "DISBURSEMENT", source_id: no, source_event: "DISBURSEMENT", currency: loan.currency, branch_id: loan.branch_id, loan_id: loan.id, lines: [{ code: "1100", debit: loan.contractual_principal }, { code: method === "CASH" ? "1000" : "1010", credit: net }, { code: "4100", credit: fee }] }, null);
  table("disbursements").push({
    id: `dis-${loan.id}`, disbursement_no: no, loan_id: loan.id, loan_account_no: loan.account_no, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, branch_id: loan.branch_id, branch_name: loan.branch_name, product_id: loan.product_id, currency: loan.currency,
    approved_principal: loan.contractual_principal, amount: loan.contractual_principal, fees_deducted: fee, net_disbursement: net, method, cash_bank_account: method === "CASH" ? "Teller cash — main vault" : "ABA Bank ••••4471", disbursement_date: date, reference_number: method === "CASH" ? no : `TT${date.replace(/-/g, "")}${pad(Number(loan.id.slice(3)), 4)}`,
    status: "CONFIRMED", requested_by: loan.officer_id, requested_by_name: loan.officer_name, authorised_by: "brmgr", authorised_by_name: "Meas Rithy", confirmed_by: method === "CASH" ? "cashier" : "acct", confirmed_by_name: method === "CASH" ? "Nhem Channary" : "Tep Sothea", created_at: `${date}T09:00:00+07:00`,
  });
  void ctx;
}

const LOAN_PROFILES: [string, number, number, number][] = [
  // behaviour, target DPD, months on book, term
  ["good", 0, 5, 12], ["good", 0, 8, 18], ["late", 6, 4, 12], ["late", 18, 6, 12], ["good", 0, 3, 12], ["late", 41, 7, 18], ["good", 0, 10, 24], ["late", 73, 6, 12], ["late", 112, 9, 12], ["good", 0, 2, 12],
  ["good", 0, 6, 12], ["late", 25, 5, 12], ["good", 0, 11, 24], ["late", 55, 8, 18], ["good", 0, 4, 12], ["closed", 0, 13, 12], ["closed", 0, 8, 6], ["writeoff", 200, 15, 12], ["good", 0, 7, 12], ["late", 3, 3, 12],
];

export function seed() {
  resetState();
  state.holidays = new Set<string>();
  holidays();
  table("branches").push(...BRANCHES);
  table("users").push(...USERS.map(([id, name, km, email, roles, branch_ids, limit]) => ({
    id, username: id, name, name_km: km, email, roles, role_label: roles.join(", "), branch_ids, branch_label: branch_ids[0] === "*" ? "All branches" : branch_ids.map((x) => branch(x).name).join(", "), status: "ACTIVE",
    approval_limit_usd: limit === "0" ? "0.00" : `${limit}.00`, approval_limit_khr: limit === "0" ? "0" : `${limit}000.00`.replace(/^(\d+)\.00$/, "$1.00"), mfa_enabled: ["SYSADMIN", "OWNER", "BRMGR", "CREDAPPR", "CASHIER", "ACCT"].includes(roles[0]), last_login: stamp(1), failed_attempts: 0, created_at: stamp(400), pending_grant: null,
  })));

  table("accounts").push(...[
    ["1000", "Cash on hand", "ASSET"], ["1010", "Bank accounts", "ASSET"], ["1100", "Loans receivable – principal", "ASSET"], ["1110", "Interest receivable (accrued and due)", "ASSET"], ["1120", "Fees and penalties receivable", "ASSET"], ["1190", "Allowance for loan losses", "CONTRA_ASSET"], ["1200", "Collateral held for sale", "ASSET"],
    ["2000", "Accounts payable", "LIABILITY"], ["2100", "Unapplied borrower payments", "LIABILITY"], ["2110", "Deferred fee income", "LIABILITY"], ["2200", "Taxes payable (subject to verification V-12)", "LIABILITY"], ["3000", "Owner capital", "EQUITY"],
    ["4000", "Interest income", "REVENUE"], ["4100", "Fee income", "REVENUE"], ["4200", "Penalty income", "REVENUE"], ["4300", "Recoveries of written-off loans", "REVENUE"], ["5000", "Impairment / provision expense", "EXPENSE"], ["5100", "Write-off expense", "EXPENSE"], ["5900", "Exchange and rounding differences", "EXPENSE"], ["9000", "Memo: written-off loans", "MEMO"],
  ].map(([code, name, type]) => ({ id: `acc-${code}`, code, name, account_type: type, currency: "ALL", postable: true, status: "ACTIVE", parent: `${code[0]}000` === code ? "" : `${code[0]}000`, mapping: "" })));

  const y = +today().slice(0, 4), mo = +today().slice(5, 7);
  for (let k = 11; k >= 0; k--) {
    const total = y * 12 + mo - 1 - k;
    const yy = Math.floor(total / 12), mm = total % 12;
    const start = `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
    const end = addDays(addMonthsAnchored(start, 1, 1), -1);
    table("periods").push({ id: `per-${yy}-${mm + 1}`, name: `${yy}-${String(mm + 1).padStart(2, "0")}`, start_date: start, end_date: end, status: k === 0 || k === 1 ? "OPEN" : "CLOSED", closed_by: k > 1 ? "Tep Sothea" : null, closed_at: k > 1 ? `${end}T18:00:00+07:00` : null, checklist: [
      { key: "eod", label: "End-of-day completed for all days", done: k !== 0 }, { key: "subledger", label: "Subledger reconciliations show zero differences", done: k !== 0 }, { key: "bank", label: "Bank reconciliations completed", done: k > 1 }, { key: "manual", label: "Manual journals approved", done: k > 0 },
    ] });
  }

  table("fee_rules").push(
    { id: "fee-1", code: "PROC-2", name: "Processing fee", fee_type: "PROCESSING", calculation: "PERCENT", value: "2.00", currency: "ALL", timing: "Deducted at disbursement", recognition: "ON_CHARGE", version: 1, status: "ACTIVE", effective_from: iso(300) },
    { id: "fee-2", code: "APP-5", name: "Application fee", fee_type: "APPLICATION", calculation: "FIXED", value: "5.00", currency: "USD", timing: "On submission", recognition: "ON_COLLECTION", version: 1, status: "ACTIVE", effective_from: iso(300) },
    { id: "fee-3", code: "LATE-5", name: "Late-payment fee", fee_type: "LATE", calculation: "FIXED", value: "5.00", currency: "USD", timing: "Once per overdue installment after grace", recognition: "ON_CHARGE", version: 1, status: "ACTIVE", effective_from: iso(300) },
    { id: "fee-4", code: "ESF-1", name: "Early repayment fee", fee_type: "EARLY_REPAYMENT", calculation: "PERCENT", value: "1.00", currency: "ALL", timing: "On settlement if contracted", recognition: "ON_CHARGE", version: 2, status: "PENDING_APPROVAL", effective_from: iso(-10) },
  );
  table("penalty_rules").push(
    { id: "pen-1", code: "PEN-STD", name: "Standard penalty interest", base: "Overdue installment amount", daily_rate_percent: "0.10", grace_days: 3, cap_per_installment: "25.00", cap_percent_principal: "5.00", version: 1, status: "ACTIVE", effective_from: iso(300) },
    { id: "pen-2", code: "PEN-PRN", name: "Penalty on overdue principal", base: "Overdue principal", daily_rate_percent: "0.08", grace_days: 5, cap_per_installment: "20.00", cap_percent_principal: "4.00", version: 1, status: "DRAFT", effective_from: iso(-30) },
  );

  table("products").push(
    product("prd-psl", "PSL", "Personal Installment Loan", "ប្រាក់កម្ចីផ្ទាល់ខ្លួន", "PERSONAL", "USD", "REDUCING", "EQUAL_INSTALLMENT", "18", "100.00", "5000.00", 3, 36, "MONTHLY", "2.00"),
    product("prd-sme", "SME", "SME Working Capital", "ដើមទុនសហគ្រាស", "BUSINESS", "USD", "REDUCING", "EQUAL_PRINCIPAL", "16", "1000.00", "50000.00", 6, 48, "MONTHLY", "1.50"),
    product("prd-emp", "EMP", "Employee Flat Loan", "ប្រាក់កម្ចីបុគ្គលិក", "EMPLOYEE", "USD", "FLAT", "EQUAL_INSTALLMENT", "24", "100.00", "2000.00", 3, 18, "MONTHLY", "1.00"),
    product("prd-sec", "SEC", "Secured Trade Loan", "ប្រាក់កម្ចីមានទ្រព្យធានា", "SECURED", "USD", "REDUCING", "INTEREST_ONLY", "12", "2000.00", "100000.00", 6, 24, "MONTHLY", "1.00"),
    product("prd-khr", "KHR", "Riel Micro Loan", "ប្រាក់កម្ចីខ្នាតតូចជារៀល", "PERSONAL", "KHR", "REDUCING", "EQUAL_INSTALLMENT", "24", "400000.00", "20000000.00", 3, 24, "MONTHLY", "2.00"),
    product("prd-blt", "BLT", "Short-Term Bullet Loan", "ប្រាក់កម្ចីរយៈពេលខ្លី", "BULLET", "USD", "SIMPLE", "BULLET", "15", "200.00", "10000.00", 1, 12, "AT_MATURITY", "0.00"),
  );
  // A draft and a pending version to exercise the approval workflow.
  const psl = table("products")[0];
  psl.versions.push({ ...psl.versions[0], version_no: 2, status: "PENDING_APPROVAL", approved_by: null, approved_by_name: null, approved_at: null, created_by: "brmgr", created_by_name: "Meas Rithy", effective_from: iso(-30), change_note: "Proposed maximum principal increase.", config: { ...psl.versions[0].config, max_principal: "7500.00" } });
  const draft = product("prd-agr", "AGR", "Agriculture Seasonal Loan", "ប្រាក់កម្ចីកសិកម្ម", "BUSINESS", "USD", "REDUCING", "EQUAL_PRINCIPAL", "20", "300.00", "8000.00", 3, 12, "MONTHLY", "1.00");
  draft.status = "DRAFT"; draft.active_version = 0; draft.versions[0].status = "DRAFT"; draft.versions[0].approved_by = null as unknown as string; draft.versions[0].approved_by_name = null as unknown as string; draft.versions[0].approved_at = null as unknown as string;
  table("products").push(draft);

  // Borrowers
  PEOPLE.forEach(([name, km, occupation], k) => {
    const place = PLACES[k % PLACES.length];
    const income = 300 + (k * 137) % 1100;
    const house = `${12 + k * 3}`, street = `St. ${70 + k * 11}`;
    table("borrowers").push({
      id: `bor-${k + 1}`, customer_code: `C-${pad(k + 45, 5)}`, type: "INDIVIDUAL", name_en: name, name_km: km, status: k === 22 ? "INACTIVE" : k === 23 ? "PROSPECT" : "ACTIVE", branch_id: place.branch, branch_name: branch(place.branch).name,
      id_type: k % 5 === 4 ? "Passport" : "National ID", id_number_full: `${1000 + k}${5000 + k * 7}${90 + k}`, date_of_birth: `${1972 + (k * 3) % 30}-${String((k % 12) + 1).padStart(2, "0")}-${String((k % 27) + 1).padStart(2, "0")}`, phone: `+855 ${[12, 77, 96, 89][k % 4]} ${String(345678 + k * 913).slice(0, 3)} ${String(345678 + k * 913).slice(3, 6)}`, email: k % 3 === 0 ? `${name.toLowerCase().replace(/ /g, ".")}@example.test` : "",
      address: { house, street, ...place }, address_text: `No. ${house}, ${street}, ${place.village}, ${place.commune}, ${place.district}, ${place.province}`, occupation, employer: k % 3 === 1 ? "Self-employed" : `${place.province} Trading`, monthly_income: money(income), existing_liabilities: money((k * 41) % 280), currency: "USD", emergency_contact: { name: PEOPLE[(k + 5) % PEOPLE.length][0], relationship: "Sibling", phone: `+855 12 ${String(600100 + k * 131)}` },
      preferred_language: k % 2 ? "km" : "en", officer_id: "loanoff", officer_name: "Sok Pisey", notes: [], complaints: [], created_at: stamp(380 - k * 9), created_by: "loanoff", duplicate_flag: k === 7,
    });
  });
  COMPANIES.forEach(([legal, km, trading, activity], k) => {
    const place = PLACES[(k * 2 + 3) % PLACES.length];
    table("borrowers").push({
      id: `bor-b${k + 1}`, customer_code: `B-${pad(k + 11, 5)}`, type: "BUSINESS", name_en: legal, name_km: km, legal_name: legal, trading_name: trading, status: "ACTIVE", branch_id: place.branch, branch_name: branch(place.branch).name, id_type: "Business registration", id_number_full: `000${3200 + k * 77}`, registration_number: `000${3200 + k * 77}`, business_activity: activity, phone: `+855 23 88${k}${k + 1} ${100 + k}`, email: `finance@company${k + 1}.example.test`,
      address: { house: `${8 + k}`, street: `St. ${200 + k}`, ...place }, address_text: `No. ${8 + k}, St. ${200 + k}, ${place.village}, ${place.commune}, ${place.district}, ${place.province}`, annual_revenue: money(180000 + k * 45000), annual_expenses: money(140000 + k * 31000), monthly_income: money(3200 + k * 700), existing_liabilities: money(450 + k * 80), currency: "USD",
      representatives: [{ name: PEOPLE[k + 2][0], position: "Director", phone: `+855 12 700 ${100 + k}`, id_number_masked: `••••${4400 + k}` }], preferred_language: "en", officer_id: "loanoff", officer_name: "Sok Pisey", notes: [], complaints: [], created_at: stamp(300 - k * 12), created_by: "loanoff",
    });
  });

  const borrowers = table("borrowers");
  const products = table("products");
  const productFor = (k: number) => products[[0, 1, 2, 0, 4, 3][k % 6]];

  // Opening capital: one journal per currency so the ledger is funded.
  const firstPeriod = table("periods")[0];
  postJournal({ description: "Opening capital contribution (demonstration)", date: firstPeriod.start_date, source_type: "MANUAL", source_id: "OPEN-USD", source_event: "OPENING", currency: "USD", lines: [{ code: "1010", debit: "600000.00" }, { code: "3000", credit: "600000.00" }], manual: true, created_by: "acct" }, null);
  postJournal({ description: "Opening capital contribution (demonstration)", date: firstPeriod.start_date, source_type: "MANUAL", source_id: "OPEN-KHR", source_event: "OPENING", currency: "KHR", lines: [{ code: "1010", debit: "900000000.00" }, { code: "3000", credit: "900000000.00" }], manual: true, created_by: "acct" }, null);

  // Loans in every lifecycle state
  const systemCtx = ctxFor(table("users")[6], "10.0.0.5", "seed");
  LOAN_PROFILES.forEach(([kind, dpd, months, term], index) => {
    const n = index + 1;
    const b = borrowers[index % borrowers.length];
    const p = productFor(index);
    const cfg = p.versions[0].config;
    const baseAmount = p.currency === "KHR" ? 2000000 + index * 400000 : p.code === "SME" ? 6000 + index * 700 : p.code === "SEC" ? 9000 + index * 900 : 600 + index * 130;
    const amount = money(Math.min(baseAmount, Number(cfg.max_principal)));
    const disbursedOn = addMonthsAnchored(addDays(today(), -dpd), -months, +addDays(today(), -dpd).slice(8, 10));
    const finalTerm = Math.max(term, months + (kind === "closed" ? 0 : 3));
    const loan = makeLoan(n, b, p, "loanoff", amount, undefined, kind === "closed" ? term : finalTerm, "ACTIVE", disbursedOn);
    disburse(loan, disbursedOn, cfg.processing_fee_percent, null);
    table("loans").push(loan);
    const schedule = activeSchedule(loan);
    const installments = schedule.installments as Installment[];
    const cutoff = kind === "closed" ? "9999-12-31" : kind === "good" ? today() : addDays(today(), -dpd - 1);
    for (const ins of installments) {
      if (ins.due_date > cutoff || ins.payment_due_date > today()) break;
      const payDate = ins.payment_due_date;
      const r = applyRepayment(loan, { amount: ins.total, value_date: payDate, method: ins.no % 3 ? "CASH" : "BANK_TRANSFER", external_reference: ins.no % 3 ? null : `BT${payDate.replace(/-/g, "")}${n}` }, systemCtx);
      r.cashier_id = "cashier"; r.cashier_name = "Nhem Channary"; r.created_at = `${payDate}T10:${String(10 + (ins.no % 40)).padStart(2, "0")}:00+07:00`;
      table("repayments").push(r);
    }
    if (kind === "closed") {
      loan.status = n % 2 ? "CLOSED_PAID" : "CLOSED_EARLY_SETTLEMENT"; loan.closed_on = iso(25 + n); loan.closure_type = n % 2 ? "Paid in full" : "Early settlement";
    } else if (kind === "writeoff") {
      loan.status = "WRITTEN_OFF"; loan.flags.push("Written off");
    }
    // Partial payment on the oldest unpaid installment of one late loan (SRS §11.6 example).
    if (kind === "late" && n === 6) {
      const oldest = installments.find((i) => isPositive(sub(i.principal, i.principal_paid)))!;
      const partial = fromCents(toCents(oldest.total) / 2n);
      const r = applyRepayment(loan, { amount: partial, value_date: addDays(oldest.due_date, 8), method: "CASH", external_reference: null }, systemCtx);
      table("repayments").push(r);
    }
    if (kind === "late") {
      for (const ins of installments) {
        if (ins.due_date >= today()) break;
        const late = Math.floor((Date.parse(today()) - Date.parse(ins.due_date)) / 86_400_000) - 3;
        const base = sub(ins.total, add(ins.principal_paid, ins.interest_paid));
        if (late > 0 && isPositive(base)) {
          const raw = penaltyInterest(base, "0.10", late);
          ins.penalty = toCents(raw) > 2500n ? "25.00" : raw;
          ins.fee = p.currency === "USD" ? "5.00" : "20000.00";
          table("fee_transactions").push({ id: `ft-${n}-${ins.no}`, kind: "PENALTY", loan_id: loan.id, loan_account_no: loan.account_no, borrower_name: loan.borrower_name, branch_id: loan.branch_id, currency: loan.currency, installment_no: ins.no, amount: ins.penalty, rule: "PEN-STD v1", status: "CHARGED", value_date: today() });
          table("fee_transactions").push({ id: `fl-${n}-${ins.no}`, kind: "FEE", loan_id: loan.id, loan_account_no: loan.account_no, borrower_name: loan.borrower_name, branch_id: loan.branch_id, currency: loan.currency, installment_no: ins.no, amount: ins.fee, rule: "LATE-5 v1", status: "CHARGED", value_date: addDays(ins.due_date, 4) });
          postTxn(loan, "PENALTY_CHARGED", "PENALTY", ins.penalty, today(), `EOD-${today()}`, null, ins.no);
          postTxn(loan, "FEE_CHARGED", "FEE", ins.fee, addDays(ins.due_date, 4), `EOD-${ins.due_date}`, null, ins.no);
        }
      }
      if (dpdOf(loan, today()) > 0) {
        loan.collection_officer_id = "colloff"; loan.collection_officer_name = "Prak Samnang"; loan.last_contact = iso(2 + (n % 5)); loan.next_follow_up = iso(-1 - (n % 3));
      }
    }
    refreshInstallments(loan);
  });

  // Loans awaiting acceptance / disbursement
  [["PENDING_ACCEPTANCE", 3], ["ACCEPTED", 2], ["PENDING_DISBURSEMENT", 1], ["ACCEPTED", 4]].forEach(([status, ago], k) => {
    const n = 21 + k;
    const b = borrowers[(n + 2) % borrowers.length];
    const loan = makeLoan(n, b, products[k % 2], "loanoff", money(k % 2 ? 8000 : 1200), undefined, 12, status as string, iso(-(ago as number)));
    table("loans").push(loan);
  });
  const e1Loan = table("loans")[20];
  e1Loan.terms = { ...e1Loan.terms };

  // Applications across the workflow
  const statuses = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "PENDING_DOCUMENTS", "PENDING_CREDIT_ASSESSMENT", "PENDING_CREDIT_ASSESSMENT", "PENDING_APPROVAL", "PENDING_APPROVAL", "PENDING_APPROVAL", "APPROVED", "REJECTED", "WITHDRAWN", "EXPIRED", "SUBMITTED", "PENDING_APPROVAL", "DRAFT"];
  statuses.forEach((status, k) => {
    const b = borrowers[(k + 4) % borrowers.length];
    const p = products[k % 3];
    const amount = money(p.code === "SME" ? 3000 + k * 400 : 800 + k * 150);
    const reached = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "PENDING_DOCUMENTS", "PENDING_CREDIT_ASSESSMENT", "PENDING_APPROVAL"].indexOf(status);
    const path = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", ...(status === "PENDING_DOCUMENTS" ? ["PENDING_DOCUMENTS"] : []), "PENDING_CREDIT_ASSESSMENT", "PENDING_APPROVAL"];
    const history = (reached >= 0 ? path.slice(0, reached + 1) : [...path, status]).map((s, i, all) => ({ status: s, previous_status: i ? all[i - 1] : null, actor: i < 2 ? "Sok Pisey" : i < 4 ? "Meas Rithy" : "Lim Sreymom", at: stamp(20 - k - i + 12), reason: s === "REJECTED" ? "Debt-service ratio above internal policy" : s === "WITHDRAWN" ? "Borrower request" : "" }));
    const complete = !["DRAFT", "PENDING_DOCUMENTS"].includes(status);
    const app: Row = {
      id: `app-${k + 1}`, reference: status === "DRAFT" ? null : `APP-${today().slice(0, 4)}-${pad(k + 301)}`, borrower_id: b.id, borrower_name: b.name_en, borrower_name_km: b.name_km, branch_id: b.branch_id, branch_name: b.branch_name,
      product_id: p.id, product_code: p.code, product_name: p.name_en, product_version: 1, requested_amount: amount, currency: p.currency, term: 12, frequency: p.versions[0].config.repayment_frequency, purpose: ["Working capital", "School fees", "Home repair", "Stock purchase"][k % 4], status,
      created_by: "loanoff", created_by_name: "Sok Pisey", submitted_at: status === "DRAFT" ? null : stamp(18 - k + 12), created_at: stamp(24 - k + 12),
      income: { salary: b.monthly_income, other: "50.00", verified: k % 2 === 0 }, expenses: { household: money(120 + k * 8), business: money(40 + k * 5), other: "20.00" }, liabilities: [{ lender: "Sathapana Demo MFI", outstanding: money(400 + k * 30), installment: money(35 + k * 4) }],
      proposed_collateral: k % 3 === 0 ? [{ type: "Motorcycle", description: "Honda Dream 2021", estimated_value: "1100.00" }] : [], proposed_guarantor: k % 2 ? { name: PEOPLE[(k + 9) % PEOPLE.length][0], relationship: "Spouse", phone: "+855 12 500 300" } : null,
      documents: REQUIRED_DOCS.map((name, d) => ({ name, required: true, provided: complete || d === 0, waived: false, file_name: complete || d === 0 ? `${name.toLowerCase().replace(/ /g, "-")}.pdf` : null })),
      status_history: history, versions: status === "DRAFT" ? [] : [{ version_no: 1, requested_amount: amount, term: 12, submitted_at: stamp(18 - k + 12), submitted_by: "Sok Pisey" }], comments: [{ stage: "Submission", author: "Sok Pisey", at: stamp(18 - k + 12), text: "Borrower has stable income for over two years." }],
      assessment: null, decisions: [], approval_level: 1, required_levels: Number(amount.split(".")[0]) > 5000 ? 2 : 1, conditions: [], policy_exceptions: k === 8 ? [{ type: "DSR above threshold", approved: false, approver: null }] : [],
    };
    if (["PENDING_APPROVAL", "APPROVED", "REJECTED"].includes(status)) {
      app.assessment = { version: 1, analyst_id: "cranalyst", analyst_name: "Lim Sreymom", at: stamp(6), verified_income: b.monthly_income, verified_expenses: money(180 + k * 9), existing_installments: money(35 + k * 4), proposed_installment: money(90 + k * 7), risk_grade: ["A", "B", "B", "C"][k % 4], recommendation: k === 10 ? "REJECT" : k % 4 === 3 ? "APPROVE_WITH_CONDITIONS" : "APPROVE", rationale: "Income verified from payslips and bank statements; repayment history satisfactory.", checklist: [{ item: "Identity verified", result: "PASS" }, { item: "Income evidence on file", result: "PASS" }, { item: "DSR within internal policy", result: k === 8 ? "FAIL" : "PASS" }, { item: "No active blacklist", result: "PASS" }] };
      const inc = toCents(b.monthly_income), debts = toCents(app.assessment.existing_installments) + toCents(app.assessment.proposed_installment);
      app.assessment.dsr_percent = fromCents(inc === 0n ? 0n : (debts * 10000n) / inc);
      app.assessment.net_disposable_income = fromCents(inc - toCents(app.assessment.verified_expenses) - toCents(app.assessment.existing_installments));
    }
    if (status === "APPROVED") app.decisions.push({ level: 1, decision: "APPROVE", actor_id: "credappr", actor: "Ouk Bunthoeun", at: stamp(3), reason: "Within policy", amount });
    if (status === "REJECTED") app.decisions.push({ level: 1, decision: "REJECT", actor_id: "credappr", actor: "Ouk Bunthoeun", at: stamp(4), reason: "Debt-service ratio above internal policy", amount });
    table("applications").push(app);
  });

  // Collateral and guarantors
  ["Motorcycle", "Land title", "Vehicle", "Gold jewellery", "Equipment", "Land title", "Vehicle", "Motorcycle"].forEach((type, k) => {
    const loan = table("loans")[k];
    const released = loan.status.startsWith("CLOSED");
    const accepted = 900 + k * 1200;
    table("collateral").push({
      id: `col-${k + 1}`, reference: `COL-${pad(k + 77)}`, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, loan_id: loan.id, loan_account_no: loan.account_no, branch_id: loan.branch_id, branch_name: loan.branch_name, collateral_type: type, description: `${type} — demonstration asset ${k + 1}`, identifier: type === "Land title" ? `T-${555 + k}` : `2AB-${1200 + k}`, currency: "USD", estimated_value: money(accepted + 300), accepted_value: money(accepted), pledged_value: money(accepted), valuation_date: iso(30 + k * 80), ownership: loan.borrower_name, custody_status: ["Motorcycle", "Vehicle", "Gold jewellery"].includes(type) ? "In vault" : "Title held", location: "PP1 vault — shelf A", status: released ? "RELEASED" : k === 7 ? "UNDER_VERIFICATION" : "PLEDGED", needs_revaluation: k * 80 + 30 > 365,
      valuations: [{ id: `v-${k}-1`, date: iso(30 + k * 80), method: "Market comparison", valuer: "Yim Kosal", value: money(accepted), currency: "USD" }],
      movements: [{ id: `m-${k}-1`, date: iso(29 + k * 80), movement: "IN", location: "PP1 vault", person: "Yim Kosal" }], documents: [`${type.toLowerCase().replace(/ /g, "-")}-evidence.pdf`], release: released ? { at: stamp(20), by: "Yim Kosal", receipt: `REL-${pad(k + 1)}` } : null, created_at: stamp(100),
    });
    table("guarantors").push({ id: `gua-${k + 1}`, name: PEOPLE[(k + 12) % PEOPLE.length][0], name_km: PEOPLE[(k + 12) % PEOPLE.length][1], relationship: ["Spouse", "Parent", "Sibling", "Business partner"][k % 4], phone: `+855 12 900 ${200 + k}`, id_masked: `••••${3300 + k}`, loan_id: loan.id, loan_account_no: loan.account_no, borrower_name: loan.borrower_name, branch_id: loan.branch_id, guarantee_amount: money(800 + k * 200), currency: "USD", status: released ? "RELEASED" : "ACTIVE", created_at: stamp(90) });
  });

  // Agreements
  table("loans").slice(0, 24).forEach((loan, k) => {
    const pending = loan.status === "PENDING_ACCEPTANCE";
    table("agreements").push({ id: `agr-${k + 1}`, agreement_no: `AGR-${today().slice(0, 4)}-${pad(k + 121)}`, loan_id: loan.id, loan_account_no: loan.account_no, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, branch_id: loan.branch_id, branch_name: loan.branch_name, currency: loan.currency, principal: loan.contractual_principal, language: ["BILINGUAL", "KM", "EN"][k % 3], status: pending ? "GENERATED" : "EXECUTED", version: 1, template_version: "LA-2026.1", generated_at: stamp(40 - (k % 20)), generated_by: "Sok Pisey", signed_at: pending ? null : iso(35 - (k % 20)), signing_method: pending ? null : "Wet-ink signature (scanned)", sha256: pending ? null : `${(k + 11).toString(16).padStart(2, "0")}a9f3c7e1b2d4…${(k * 97 + 4096).toString(16)}`, history: [{ version: 1, action: "Generated", at: stamp(40 - (k % 20)), by: "Sok Pisey" }, ...(pending ? [] : [{ version: 1, action: "Executed copy uploaded", at: stamp(35 - (k % 20)), by: "Sok Pisey" }])] });
  });

  // Pending disbursement requests
  const queued = table("loans").find((l) => l.status === "PENDING_DISBURSEMENT")!;
  const fee = fromCents(roundHalfUp(rdiv(rmul(ratFrom(queued.contractual_principal), rat(2n)), rat(100n))));
  table("disbursements").push({ id: "dis-q1", disbursement_no: "PP1-D-Q-0001", loan_id: queued.id, loan_account_no: queued.account_no, borrower_id: queued.borrower_id, borrower_name: queued.borrower_name, branch_id: queued.branch_id, branch_name: queued.branch_name, product_id: queued.product_id, currency: queued.currency, approved_principal: queued.contractual_principal, amount: queued.contractual_principal, fees_deducted: fee, net_disbursement: sub(queued.contractual_principal, fee), method: "CASH", cash_bank_account: "Teller cash — main vault", disbursement_date: today(), reference_number: null, status: "REQUESTED", requested_by: "loanoff", requested_by_name: "Sok Pisey", authorised_by: null, authorised_by_name: null, confirmed_by: null, confirmed_by_name: null, created_at: stamp(0) });

  // Cashier session
  table("cashier_sessions").push({ id: "cs-1", cashier_id: "cashier", cashier_name: "Nhem Channary", branch_id: "br-pp1", opened_at: stamp(0, 7), status: "OPEN", opening_float_usd: "2000.00", opening_float_khr: "4000000.00" });

  // Collections
  const overdue = table("loans").filter((l) => l.status === "ACTIVE" && dpdOf(l, today()) > 0);
  overdue.forEach((loan, k) => {
    table("collection_activities").push({ id: `act-${k + 1}`, loan_id: loan.id, loan_account_no: loan.account_no, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, branch_id: loan.branch_id, officer_id: "colloff", officer_name: "Prak Samnang", channel: ["Phone", "Field visit", "SMS"][k % 3], contact_time: stamp(2 + k, 10), person_reached: "Borrower", outcome: ["Promised to pay", "No answer", "Partial payment arranged"][k % 3], notes: "Discussed the overdue installment and the next steps.", follow_up_date: iso(-2 - k) });
    if (k % 2 === 0) table("promises").push({ id: `pro-${k + 1}`, loan_id: loan.id, loan_account_no: loan.account_no, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, branch_id: loan.branch_id, currency: loan.currency, promised_amount: activeSchedule(loan).installments[0].total, promise_date: iso(k % 4 === 0 ? 3 : -3 - k), status: k % 4 === 0 ? "BROKEN" : "OPEN", officer_name: "Prak Samnang", created_at: stamp(4 + k) });
  });

  // Modifications
  const mod = (i: number, kind: string, loan: Row, status: string) => {
    const proposedTerm = loan.term + 6;
    const proposed = buildSchedule({ ...loan.terms, principal: outstandingPrincipal(loan), term: proposedTerm, disbursement_date: today(), first_due_date: undefined });
    table("modifications").push({ id: `mod-${i}`, reference: `MOD-${today().slice(0, 4)}-${pad(i + 40)}`, kind, loan_id: loan.id, loan_account_no: loan.account_no, borrower_id: loan.borrower_id, borrower_name: loan.borrower_name, branch_id: loan.branch_id, branch_name: loan.branch_name, currency: loan.currency, reason: "Reduced household income after seasonal slowdown.", status, requested_by: "loanoff", requested_by_name: "Sok Pisey", approved_by: status === "EXECUTED" ? "credappr" : null, effective_date: iso(-7), overdue_treatment: "Keep due", created_at: stamp(5 + i), existing: { annual_rate: loan.annual_rate, term: loan.term, frequency: loan.frequency, maturity_date: loan.maturity_date, installment: activeSchedule(loan).installments[0].total, total_interest: activeSchedule(loan).total_interest }, proposed: { annual_rate: loan.annual_rate, term: proposedTerm, frequency: loan.frequency, maturity_date: proposed.maturity_date, installment: proposed.regular_installment, total_interest: proposed.total_interest }, proposed_installments: proposed.installments, history: [{ status: "REQUESTED", at: stamp(5 + i), by: "Sok Pisey", reason: "" }] });
  };
  mod(1, "RESCHEDULING", overdue[1], "REQUESTED"); mod(2, "RESCHEDULING", overdue[2], "ASSESSED"); mod(3, "RESTRUCTURING", overdue[3], "REQUESTED"); mod(4, "RESTRUCTURING", overdue[4], "APPROVED");

  // Waivers, reversals, refunds
  table("waivers").push(
    { id: "wvr-1", reference: "WVR-0001", loan_id: overdue[0].id, loan_account_no: overdue[0].account_no, borrower_name: overdue[0].borrower_name, branch_id: overdue[0].branch_id, currency: overdue[0].currency, component: "PENALTY", amount: "2.00", reason: "Hardship: hospitalisation of family member", status: "PENDING", requested_by: "loanoff", requested_by_name: "Sok Pisey", created_at: stamp(1), history: [] },
    { id: "wvr-2", reference: "WVR-0002", loan_id: overdue[1].id, loan_account_no: overdue[1].account_no, borrower_name: overdue[1].borrower_name, branch_id: overdue[1].branch_id, currency: overdue[1].currency, component: "FEE", amount: "5.00", reason: "Bank transfer delay confirmed", status: "APPROVED", requested_by: "colloff", requested_by_name: "Prak Samnang", approved_by_name: "Meas Rithy", created_at: stamp(12), history: [] },
  );
  const someRepayment = table("repayments").find((r) => r.branch_id === "br-pp1")!;
  table("reversal_requests").push({ id: "rev-1", repayment_id: someRepayment.id, receipt_no: someRepayment.receipt_no, loan_id: someRepayment.loan_id, loan_account_no: someRepayment.loan_account_no, borrower_name: someRepayment.borrower_name, branch_id: someRepayment.branch_id, amount: someRepayment.amount, currency: someRepayment.currency, reason_code: "WRONG_LOAN", reason: "Payment was posted to the wrong loan account.", status: "PENDING", requested_by: "acct", requested_by_name: "Tep Sothea", original_cashier: someRepayment.cashier_id, created_at: stamp(1) });

  // Manual journals awaiting approval, and reconciliation
  postJournal({ description: "Accrued branch rent — month end", date: iso(1), source_type: "MANUAL", source_id: "MJ-1", source_event: "MANUAL", currency: "USD", lines: [{ code: "5900", debit: "850.00" }, { code: "2000", credit: "850.00" }], status: "PENDING_APPROVAL", manual: true, created_by: "acct" }, ctxFor(table("users")[7], "10.0.0.8", "seed"));
  ["ABA Bank ••••4471", "ACLEDA Demo ••••1190", "Teller cash PP1"].forEach((account, k) => {
    table("reconciliations").push({ id: `rec-${k + 1}`, account, type: k === 2 ? "CASH" : "BANK", period: today().slice(0, 7), statement_balance: money(148200 + k * 19000), ledger_balance: k === 1 ? money(148200 + k * 19000 - 120) : money(148200 + k * 19000), difference: k === 1 ? "120.00" : "0.00", matched_items: 34 - k * 3, outstanding_items: k === 1 ? 2 : 0, status: k === 1 ? "IN_PROGRESS" : "RECONCILED", prepared_by: "Tep Sothea", reviewed_by: k === 1 ? null : "Keo Sophea", currency: "USD" });
  });

  // Documents, templates, settings
  table("documents").push(...borrowers.slice(0, 14).flatMap((b, k) => [
    { id: `doc-${k}-a`, name: `${b.customer_code}-national-id.pdf`, category: "Identification", owner_type: "BORROWER", owner_id: b.id, owner_label: b.name_en, branch_id: b.branch_id, size: "412 KB", mime: "application/pdf", version: 1, uploaded_by: "Sok Pisey", uploaded_at: stamp(90 - k), classification: "Restricted", versions: [{ version: 1, at: stamp(90 - k), by: "Sok Pisey" }], access_log: [] },
    { id: `doc-${k}-b`, name: `${b.customer_code}-income-evidence.pdf`, category: "Income evidence", owner_type: "BORROWER", owner_id: b.id, owner_label: b.name_en, branch_id: b.branch_id, size: "228 KB", mime: "application/pdf", version: 1, uploaded_by: "Sok Pisey", uploaded_at: stamp(88 - k), classification: "Confidential", versions: [{ version: 1, at: stamp(88 - k), by: "Sok Pisey" }], access_log: [] },
  ]));
  table("templates").push(...[
    ["Loan agreement", "BILINGUAL", "LA-2026.1", "ACTIVE"], ["Repayment schedule annex", "BILINGUAL", "RS-2026.1", "ACTIVE"], ["Disbursement authorisation", "EN", "DA-2026.1", "ACTIVE"], ["Payment receipt", "BILINGUAL", "PR-2026.2", "ACTIVE"], ["Guarantor agreement", "KM", "GA-2026.1", "ACTIVE"], ["Closure confirmation", "BILINGUAL", "CC-2026.1", "ACTIVE"], ["Restructuring agreement", "BILINGUAL", "RA-2026.1", "DRAFT"],
  ].map(([name, language, version, status], k) => ({ id: `tpl-${k + 1}`, name, language, version, status, approved_by: status === "ACTIVE" ? "Keo Sophea" : null, updated_at: stamp(60 + k) })));
  table("currencies").push({ id: "USD", code: "USD", name: "United States Dollar", precision: 2, rounding_increment: "0.01", status: "ACTIVE", base: true }, { id: "KHR", code: "KHR", name: "Cambodian Riel", precision: 0, rounding_increment: "1", status: "ACTIVE", base: false });
  table("exchange_rates").push(...[0, 7, 14].map((d, k) => ({ id: `fx-${k + 1}`, from_currency: "USD", to_currency: "KHR", rate: `${4100 - k * 5}.00`, source: "Manual entry (illustrative)", effective_date: iso(d), entered_by: "Tep Sothea" })));
  table("holidays").push({ id: "hol-1", calendar: "Cambodia Default", date: iso(-40), name: "Sample holiday (enter from official announcement)", status: "ACTIVE" });
  table("sequences").push(...[["Customer code", "C-{seq:5}", 69], ["Application reference", "APP-{year}-{seq:6}", 317], ["Loan account number", "{branch}{product}{seq:6}-{check}", 25], ["Receipt", "{branch}-R-{year}-{seq:6}", 180], ["Disbursement", "{branch}-D-{year}-{seq:6}", 25], ["Journal", "JV-{year}-{seq:6}", 240]].map(([name, pattern, next], k) => ({ id: `seq-${k + 1}`, name, pattern, next_value: next, scope: "Company / Branch / Year", version: 1 })));
  table("system_settings").push(...[
    ["Default language", "en", "Localisation"], ["Date format", "DD/MM/YYYY", "Localisation"], ["Time zone", "Asia/Phnom_Penh", "Localisation"], ["Backdating window (days)", "3", "Repayments (D-05 default, illustrative)"], ["DPD tolerance", "0.00", "Collections (D-09)"], ["Contact hours", "07:00–20:00", "Collections (V-08 to verify)"], ["Idle session timeout (min)", "30", "Security (FR-AUTH-009)"], ["Absolute session timeout (h)", "12", "Security (FR-AUTH-009)"], ["Maximum upload size (MB)", "10", "Documents (FR-FIL)"],
  ].map(([name, value, group], k) => ({ id: `set-${k + 1}`, name, value, group })));
  table("feature_flags").push(...[["Collateral", true], ["Guarantors", true], ["Built-in accounting", true], ["Pawn-backed loans", false], ["Credit bureau", false]].map(([name, enabled], k) => ({ id: `ff-${k + 1}`, name, enabled })));
  table("company").push({ id: "co-1", legal_name_en: "Demonstration Lending Plc.", legal_name_km: "ក្រុមហ៊ុនសាកល្បងឥណទាន", trading_name: "Demo Lending", registration_reference: "DEMO-REG-0001", licence_reference: "(enter as issued)", address: "No. 1, Preah Norodom Blvd, Phnom Penh", base_currency: "USD", functional_currency: "USD", phone: "+855 23 900 100", email: "info@demo.lms.test" });
  table("notification_settings").push(...["Loan Applications", "Pending Approvals", "Disbursements", "Repayments", "Overdue Payments", "Collection Reminders", "System Notifications"].map((category, k) => ({ id: `ns-${k + 1}`, category, in_app: true, email: k < 4, sms: false })));

  // Notifications, audit samples, login history
  notify("Pending Approvals", "Application awaiting decision", "APP-0307 needs a level 1 credit decision.", "/approvals", "br-pp1", "HIGH");
  notify("Overdue Payments", "New loans over 30 days past due", `${overdue.filter((l) => dpdOf(l, today()) > 30).length} loans have crossed 30 DPD.`, "/collections/overdue", undefined, "HIGH");
  notify("Disbursements", "Disbursement awaiting authorisation", "PP1-D-Q-0001 was requested by Sok Pisey.", "/disbursements", "br-pp1");
  notify("Repayments", "Reversal request pending", "A repayment reversal needs approval.", "/repayments/reversals", "br-pp1");
  notify("Loan Applications", "Application missing documents", "Income evidence is outstanding on a pending application.", "/applications", "br-pp1");
  notify("Collection Reminders", "Promises due today", "Review promises to pay due today.", "/collections/promises", "br-pp1");
  notify("System Notifications", "End-of-day simulation", "Demonstration data is regenerated when the server restarts.", "/notifications");
  USERS.forEach(([id, name], k) => {
    table("login_history").push({ id: `lg-${k + 1}`, user_id: id, user_name: name, at: stamp(k % 4, 8), result: k === 5 ? "FAILED" : "SUCCESS", ip_address: `10.0.1.${20 + k}`, device: k % 2 ? "Chrome / Windows" : "Edge / Windows" });
  });
  audit(ctxFor(table("users")[1], "10.0.1.21", "seed"), "PRODUCT_VERSION_APPROVED", "Products", "PSL v1", "PENDING_APPROVAL", "ACTIVE", "Initial activation", false);
  audit(ctxFor(table("users")[2], "10.0.1.22", "seed"), "DISBURSEMENT_AUTHORISED", "Disbursements", "PP1-D-2026-000002", "REQUESTED", "AUTHORISED", "", true);
  audit(ctxFor(table("users")[6], "10.0.1.26", "seed"), "REPAYMENT_RECORDED", "Repayments", someRepayment.receipt_no, "", `${someRepayment.currency} ${someRepayment.amount}`, "", true);
  audit(ctxFor(table("users")[3], "10.0.1.23", "seed"), "BORROWER_UPDATED", "Borrowers", "C-00045", "Phone ••••678", "Phone ••••701", "Customer update form", false);
  audit(ctxFor(table("users")[7], "10.0.1.27", "seed"), "JOURNAL_PREPARED", "Accounting", "Manual journal", "", "PENDING_APPROVAL", "Month-end accrual", true);
  table("control_exceptions").push(
    { id: "ce-1", type: "Backdated payment", reference: someRepayment.receipt_no, user: "Nhem Channary", at: stamp(6), detail: "Value date 2 days before entry (inside the configured window).", severity: "LOW", status: "OPEN", branch_id: "br-pp1" },
    { id: "ce-2", type: "Reversal", reference: "Pending reversal", user: "Tep Sothea", at: stamp(1), detail: "Repayment reversal requested: wrong loan.", severity: "MEDIUM", status: "OPEN", branch_id: "br-pp1" },
    { id: "ce-3", type: "After-hours action", reference: "JV", user: "Tep Sothea", at: stamp(9, 21), detail: "Manual journal prepared outside business hours.", severity: "MEDIUM", status: "REVIEWED", branch_id: "br-pp1" },
    { id: "ce-4", type: "Waiver", reference: "WVR-0002", user: "Meas Rithy", at: stamp(12), detail: "Fee waiver approved within limit.", severity: "LOW", status: "OPEN", branch_id: "br-pp1" },
  );
  void nowIso;
  state.seeded = true;
}

export function ensureSeeded() {
  if (!state.seeded) seed();
}
