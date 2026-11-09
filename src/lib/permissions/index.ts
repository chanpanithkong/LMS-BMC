/**
 * Default role → permission mapping, from SRS §5.2 (proposed default matrix).
 * These checks only shape the interface. Authorisation is enforced by the API (FR-AUTH-012).
 */
export const ROLES = [
  "SYSADMIN", "OWNER", "BRMGR", "LOANOFF", "CRANALYST", "CREDAPPR",
  "CASHIER", "ACCT", "COLLOFF", "CLTOFF", "AUDITOR", "READONLY",
] as const;
export type RoleCode = (typeof ROLES)[number];

export const ROLE_NAMES: Record<RoleCode, string> = {
  SYSADMIN: "System Administrator", OWNER: "Business Owner", BRMGR: "Branch Manager", LOANOFF: "Loan Officer",
  CRANALYST: "Credit Analyst", CREDAPPR: "Credit Approver", CASHIER: "Cashier", ACCT: "Accountant",
  COLLOFF: "Collection Officer", CLTOFF: "Collateral Officer", AUDITOR: "Auditor", READONLY: "Read-only User",
};

export const PERMISSION_GROUPS = {
  "Users and access": ["user.view", "user.manage", "user.approve_grant", "role.view"],
  Organisation: ["org.view", "org.manage"],
  Products: ["product.view", "product.propose", "product.approve"],
  Borrowers: ["borrower.view", "borrower.edit", "borrower.sensitive", "borrower.confirm_duplicate"],
  Applications: ["application.view", "application.create", "application.review"],
  "Credit decisions": ["credit.view", "credit.assess", "credit.approve", "credit.exception"],
  Agreements: ["agreement.view", "agreement.execute"],
  Collateral: ["collateral.view", "collateral.manage", "collateral.link", "collateral.release_approve"],
  Disbursement: ["disbursement.view", "disbursement.request", "disbursement.authorise", "disbursement.confirm_cash", "disbursement.confirm_bank"],
  Repayments: ["repayment.view", "repayment.create", "repayment.reverse_request", "repayment.reverse_approve"],
  "Fees and waivers": ["fee.view", "fee.configure", "waiver.request", "waiver.approve"],
  Loans: ["loan.view"],
  Collections: ["collection.view", "collection.manage", "collection.assign"],
  Restructuring: ["restructure.view", "restructure.request", "restructure.assess", "restructure.approve"],
  "Settlement and closure": ["settlement.view", "settlement.quote", "settlement.process", "closure.process"],
  Accounting: ["accounting.view", "accounting.configure", "journal.create", "journal.approve", "period.close", "period.reopen", "reconcile.manage"],
  Reports: ["report.portfolio", "report.collection", "report.financial", "report.risk", "report.control", "report.export"],
  Documents: ["document.view", "document.upload", "template.manage"],
  Audit: ["audit.view"],
  Notifications: ["notification.view"],
} as const;

type Groups = typeof PERMISSION_GROUPS;
export type Permission = Groups[keyof Groups][number];

const VIEW_BASE: Permission[] = ["notification.view", "document.view"];

export const ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  // BR-SEC-002: administrators hold no financial permissions by default.
  SYSADMIN: ["user.view", "user.manage", "role.view", "org.view", "org.manage", "template.manage", "audit.view", "notification.view", "document.view", "report.control"],
  OWNER: [
    ...VIEW_BASE, "user.view", "user.approve_grant", "role.view", "org.view", "org.manage", "product.view", "product.propose", "product.approve",
    "borrower.view", "borrower.edit", "borrower.sensitive", "borrower.confirm_duplicate", "application.view", "application.create", "application.review",
    "credit.view", "credit.assess", "credit.approve", "credit.exception", "agreement.view", "agreement.execute", "collateral.view", "collateral.manage",
    "collateral.release_approve", "disbursement.view", "disbursement.request", "disbursement.authorise", "repayment.view", "repayment.reverse_approve",
    "fee.view", "fee.configure", "waiver.approve", "loan.view", "collection.view", "collection.manage", "collection.assign", "restructure.view",
    "restructure.approve", "settlement.view", "settlement.quote", "settlement.process", "closure.process", "accounting.view", "journal.approve",
    "period.close", "period.reopen", "report.portfolio", "report.collection", "report.financial", "report.risk", "report.control", "report.export",
    "document.upload", "template.manage", "audit.view",
  ],
  BRMGR: [
    ...VIEW_BASE, "org.view", "product.view", "product.propose", "borrower.view", "borrower.edit", "borrower.sensitive", "borrower.confirm_duplicate",
    "application.view", "application.create", "application.review", "credit.view", "credit.assess", "credit.approve", "credit.exception", "agreement.view",
    "agreement.execute", "collateral.view", "collateral.release_approve", "disbursement.view", "disbursement.request", "disbursement.authorise", "repayment.view",
    "repayment.create", "repayment.reverse_approve", "fee.view", "waiver.approve", "loan.view", "collection.view", "collection.manage", "collection.assign",
    "restructure.view", "restructure.approve", "settlement.view", "settlement.quote", "settlement.process", "closure.process",
    "report.portfolio", "report.collection", "report.export", "document.upload", "audit.view",
  ],
  LOANOFF: [
    ...VIEW_BASE, "product.view", "borrower.view", "borrower.edit", "borrower.sensitive", "application.view", "application.create", "agreement.view", "agreement.execute",
    "collateral.view", "collateral.link", "disbursement.view", "disbursement.request", "repayment.view", "fee.view", "waiver.request", "loan.view", "collection.view",
    "collection.manage", "restructure.view", "restructure.request", "settlement.view", "settlement.quote", "report.portfolio", "report.export", "document.upload",
  ],
  CRANALYST: [
    ...VIEW_BASE, "product.view", "product.propose", "borrower.view", "application.view", "application.review", "credit.view", "credit.assess", "loan.view",
    "restructure.view", "restructure.assess", "report.risk", "report.export",
  ],
  CREDAPPR: [
    ...VIEW_BASE, "product.view", "product.approve", "borrower.view", "application.view", "credit.view", "credit.approve", "credit.exception", "disbursement.view",
    "disbursement.authorise", "loan.view", "restructure.view", "restructure.approve", "report.risk", "report.export",
  ],
  CASHIER: [
    ...VIEW_BASE, "borrower.view", "disbursement.view", "disbursement.confirm_cash", "repayment.view", "repayment.create", "loan.view", "settlement.view",
    "settlement.quote", "settlement.process", "closure.process", "report.collection", "report.export", "document.upload",
  ],
  ACCT: [
    ...VIEW_BASE, "org.view", "product.view", "product.propose", "borrower.view", "disbursement.view", "disbursement.confirm_bank", "repayment.view", "repayment.create",
    "repayment.reverse_request", "fee.view", "fee.configure", "waiver.request", "loan.view", "restructure.view", "settlement.view", "settlement.quote",
    "settlement.process", "closure.process", "accounting.view", "accounting.configure", "journal.create", "period.close", "reconcile.manage",
    "report.portfolio", "report.collection", "report.financial", "report.control", "report.export", "document.upload",
  ],
  COLLOFF: [
    ...VIEW_BASE, "borrower.view", "repayment.view", "fee.view", "waiver.request", "loan.view", "collection.view", "collection.manage", "restructure.view",
    "restructure.request", "report.collection", "report.export",
  ],
  CLTOFF: [...VIEW_BASE, "borrower.view", "collateral.view", "collateral.manage", "loan.view", "settlement.view", "report.risk", "report.export", "document.upload"],
  AUDITOR: [
    ...VIEW_BASE, "user.view", "role.view", "org.view", "product.view", "borrower.view", "application.view", "credit.view", "agreement.view", "collateral.view",
    "disbursement.view", "repayment.view", "fee.view", "loan.view", "collection.view", "restructure.view", "settlement.view", "accounting.view",
    "report.portfolio", "report.collection", "report.financial", "report.risk", "report.control", "report.export", "audit.view",
  ],
  READONLY: [...VIEW_BASE, "product.view", "borrower.view", "application.view", "loan.view", "report.portfolio"],
};

export function permissionsForRoles(roles: readonly RoleCode[]): Permission[] {
  return [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))];
}

/** Landing page per role (brief: role-based redirection; SRS §18.5 role dashboards). */
export function landingRoute(role: RoleCode): string {
  const map: Partial<Record<RoleCode, string>> = {
    SYSADMIN: "/admin/users", CASHIER: "/repayments", COLLOFF: "/collections", CRANALYST: "/assessments",
    CREDAPPR: "/approvals", ACCT: "/accounting", CLTOFF: "/collateral", AUDITOR: "/audit",
  };
  return map[role] ?? "/dashboard";
}
