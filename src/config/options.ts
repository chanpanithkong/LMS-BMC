const opts = (...labels: [string, string][]) => labels.map(([value, label]) => ({ value, label }));

export const APPLICATION_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "PENDING_DOCUMENTS", "PENDING_CREDIT_ASSESSMENT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "WITHDRAWN", "EXPIRED"];
export const LOAN_STATUSES = ["PENDING_ACCEPTANCE", "ACCEPTED", "PENDING_DISBURSEMENT", "ACTIVE", "WRITTEN_OFF", "CLOSED_PAID", "CLOSED_EARLY_SETTLEMENT", "CANCELLED"];
const title = (s: string) => s.toLowerCase().split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
export const statusOptions = (list: string[]) => list.map((value) => ({ value, label: title(value) }));

export const INTEREST_METHODS = opts(["REDUCING", "Reducing Balance"], ["FLAT", "Flat Rate"], ["SIMPLE", "Simple Interest"]);
export const AMORTISATIONS = opts(["EQUAL_INSTALLMENT", "Equal Installment"], ["EQUAL_PRINCIPAL", "Equal Principal"], ["INTEREST_ONLY", "Interest Only"], ["BULLET", "Bullet Repayment"]);
export const DAY_COUNTS = opts(["30/360", "30/360 periodic"], ["ACT/365", "Actual/365"], ["ACT/366", "Actual/366"], ["ACT/ACT", "Actual/Actual"]);
export const FREQUENCIES = opts(["WEEKLY", "Weekly"], ["BIWEEKLY", "Biweekly"], ["MONTHLY", "Monthly"], ["QUARTERLY", "Quarterly"], ["AT_MATURITY", "At Maturity"]);
export const GRACE_TYPES = opts(["NONE", "None"], ["PRINCIPAL", "Principal grace (interest paid)"], ["FULL_CAPITALISED", "Full grace (capitalised)"]);
export const PRODUCT_TYPES = opts(["PERSONAL", "Personal"], ["BUSINESS", "Business"], ["EMPLOYEE", "Employee"], ["SECURED", "Secured"], ["UNSECURED", "Unsecured"], ["INSTALLMENT", "Installment"], ["BULLET", "Bullet"]);
export const CURRENCIES = opts(["USD", "USD"], ["KHR", "KHR"]);
export const ID_TYPES = opts(["National ID", "National ID"], ["Passport", "Passport"], ["Family Book", "Family Book"], ["Other", "Other accepted document"]);
export const PAYMENT_METHODS = opts(["CASH", "Cash"], ["BANK_TRANSFER", "Bank Transfer"]);
export const PROVINCES = ["Phnom Penh", "Siem Reap", "Battambang", "Kampong Cham", "Kandal", "Takeo", "Kampot", "Preah Sihanouk", "Banteay Meanchey", "Kampong Speu", "Kampong Thom", "Prey Veng", "Svay Rieng", "Pursat", "Kratie", "Tboung Khmum"].map((p) => ({ value: p, label: p }));
export const LANGUAGES = opts(["km", "Khmer"], ["en", "English"]);
export const COLLATERAL_TYPES = opts(["Land title", "Land title"], ["Vehicle", "Vehicle"], ["Motorcycle", "Motorcycle"], ["Gold jewellery", "Gold jewellery"], ["Equipment", "Equipment"], ["Other", "Other"]);
export const DOC_CATEGORIES = ["Identification", "Photos", "Income evidence", "Business documents", "Agreements", "Collateral", "Guarantor", "Payment evidence", "Restructuring", "Closure"].map((c) => ({ value: c, label: c }));
