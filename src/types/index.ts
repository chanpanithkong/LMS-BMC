/** API contract types. Money and rates are decimal strings, never numbers (SRS §15.1). */
import type { CurrencyCode } from "@/lib/formatters/money";
import type { RoleCode } from "@/lib/permissions";

export type Row = Record<string, unknown>;

export interface SessionUser {
  id: string; username: string; name: string; name_km: string; email: string; roles: RoleCode[];
  branch_ids: string[]; branch_label: string; approval_limit_usd: string; approval_limit_khr: string; landing: string;
}
export interface LoginResponse { access_token?: string; user?: SessionUser; mfa_required?: boolean; mfa_token?: string }

export interface Address { house?: string; street?: string; village?: string; commune?: string; district?: string; province?: string }

export interface Borrower extends Row {
  id: string; customer_code: string; type: "INDIVIDUAL" | "BUSINESS"; name_en: string; name_km: string; status: string; branch_id: string; branch_name: string;
  id_type: string; id_number: string; date_of_birth?: string; phone: string; email: string; address: Address; address_text: string; occupation?: string; employer?: string;
  monthly_income: string; existing_liabilities: string; currency: CurrencyCode; legal_name?: string; trading_name?: string; registration_number?: string; business_activity?: string;
  annual_revenue?: string; annual_expenses?: string; officer_name: string; created_at: string; duplicate_flag?: boolean; duplicate_review?: string | null; preferred_language: string;
  emergency_contact?: { name: string; relationship: string; phone: string } | null;
  representatives?: { name: string; position: string; phone: string; id_number_masked?: string }[]; notes: { text: string; by: string; at: string }[];
}
export interface BorrowerDetail extends Borrower {
  can_reveal_id: boolean; loans: LoanSummary[]; applications: Application[]; documents: DocumentRecord[]; repayments: Repayment[]; activities: AuditEntry[];
}

export interface ProductConfig extends Row {
  name_en: string; name_km: string; product_type: string; currency: CurrencyCode; min_principal: string; max_principal: string; min_term: number; max_term: number;
  interest_method: string; amortisation: string; annual_rate: string; day_count: string; repayment_frequency: string; grace_type: string; grace_periods: number;
  processing_fee_percent: string; penalty_rule_id: string; eligibility_min_age: number; eligibility_max_age: number; eligibility_min_income: string; required_documents: string;
  collateral_required: boolean; min_coverage_percent: string; approval_matrix: string; early_settlement_option: string; waterfall: string;
}
export interface ProductVersion { version_no: number; status: string; effective_from: string; created_by: string; created_by_name: string; approved_by: string | null; approved_by_name: string | null; approved_at: string | null; change_note: string; config: ProductConfig }
export interface Product extends Row { id: string; code: string; name_en: string; name_km: string; product_type: string; status: string; currency: CurrencyCode; active_version: number; versions: ProductVersion[] }

export interface StatusEvent { status: string; previous_status: string | null; actor: string; at: string; reason: string }
export interface Assessment { version: number; analyst_id: string; analyst_name: string; at: string; verified_income: string; verified_expenses: string; existing_installments: string; proposed_installment: string; dsr_percent: string; net_disposable_income: string; risk_grade: string; recommendation: string; rationale: string; checklist: { item: string; result: string }[] }
export interface Decision { level: number; decision: string; actor_id: string; actor: string; at: string; reason: string; amount: string; conditions?: string }
export interface Application extends Row {
  id: string; reference: string | null; borrower_id: string; borrower_name: string; borrower_name_km: string; branch_id: string; branch_name: string; product_id: string; product_code: string; product_name: string; product_version: number;
  requested_amount: string; currency: CurrencyCode; term: number; frequency: string; purpose: string; status: string; created_by: string; created_by_name: string; submitted_at: string | null; created_at: string;
  income: { salary?: string; other?: string; verified?: boolean }; expenses: { household?: string; business?: string; other?: string }; liabilities: { lender: string; outstanding: string; installment: string }[];
  proposed_collateral: { type: string; description: string; estimated_value: string }[]; proposed_guarantor: { name: string; relationship: string; phone: string } | null;
  documents: { name: string; required: boolean; provided: boolean; waived: boolean; file_name: string | null }[]; status_history: StatusEvent[]; versions: { version_no: number; requested_amount: string; term: number; submitted_at: string; submitted_by: string }[];
  comments: { stage: string; author: string; at: string; text: string }[]; assessment: Assessment | null; decisions: Decision[]; approval_level: number; required_levels: number; conditions: { text: string; stage: string; fulfilled: boolean }[]; policy_exceptions: { type: string; approved: boolean; approver: string | null }[];
  borrower?: Borrower; loan_id?: string | null; message?: string; escalated?: boolean;
}

export interface Balances {
  as_of: string; original_principal: string; disbursed_principal: string; outstanding_principal: string; interest_due: string; interest_accrued: string; interest_paid: string; fees_due: string; penalties_due: string; unapplied: string;
  amount_overdue: string; total_due_today: string; total_outstanding: string; amount_received: string; remaining_scheduled: string; next_payment_date: string | null; next_payment_amount: string | null; days_past_due: number; bucket: string; par_classification: string;
}
export interface LoanSummary extends Row, Balances {
  id: string; account_no: string; borrower_id: string; borrower_name: string; borrower_name_km: string; branch_id: string; branch_name: string; product_id: string; product_code: string; product_name: string; product_version: number; officer_name: string; currency: CurrencyCode; status: string;
  approved_amount: string; contractual_principal: string; disbursed_on: string | null; annual_rate: string; term: number; frequency: string; purpose: string; maturity_date: string; restructure_count: number; flags: string[]; collection_officer_name: string | null; last_contact: string | null; next_follow_up: string | null; closed_on: string | null; closure_type: string | null;
  terms: { interest_method: string; amortisation: string; day_count: string; annual_rate: string; frequency: string; term: number };
  terms_versions: { version_no: number; status: string; effective_from: string; source: string; annual_rate: string; term: number; frequency: string }[];
}
export interface LoanDetail extends LoanSummary { borrower: Borrower; schedule_summary: { version_no: number; status: string; reason: string; effective_from: string; total_interest: string }[]; transaction_count: number; allowed_actions: Record<string, boolean> }
export interface Installment { no: number; due_date: string; payment_due_date: string; opening: string; principal: string; interest: string; total: string; closing: string; principal_paid: string; interest_paid: string; fee: string; fee_paid: string; penalty: string; penalty_paid: string; status: string }
export interface ScheduleVersion { version_no: number; status: string; reason: string; effective_from: string; total_principal: string; total_interest: string; installments: Installment[]; currency: CurrencyCode; versions: { version_no: number; status: string; reason: string }[] }
export interface LoanTransaction extends Row { id: string; txn_type: string; component: string; amount: string; currency: CurrencyCode; value_date: string; posting_date: string; installment_no: number | null; source_document: string; reverses_txn_id: string | null; created_by: string }

export interface SchedulePreview { installments: { no: number; due_date: string; payment_due_date: string; days: number; opening: string; principal: string; interest: string; total: string; closing: string }[]; total_principal: string; total_interest: string; total_payment: string; regular_installment: string; maturity_date: string; effective_rate_per_period: string; effective_rate_nominal_annual: string; engine_version: string; warnings: string[] }

export interface Allocation { installment_no: number | null; component: string; amount: string; sequence_no: number }
export interface Repayment extends Row {
  id: string; receipt_no: string; loan_id: string; loan_account_no: string; borrower_id: string; borrower_name: string; branch_id: string; branch_name: string; amount: string; currency: CurrencyCode; payment_date: string; value_date: string; method: string; external_reference: string | null; comment: string; status: string; unapplied_amount: string; allocations: Allocation[]; cashier_name: string; created_at: string; reversal: { at: string; by: string; reason: string } | null; print_count: number;
}
export interface Disbursement extends Row { id: string; disbursement_no: string; loan_id: string; loan_account_no: string; borrower_name: string; branch_name: string; currency: CurrencyCode; approved_principal: string; amount: string; fees_deducted: string; net_disbursement: string; method: string; cash_bank_account: string; disbursement_date: string; reference_number: string | null; status: string; requested_by: string; requested_by_name: string; authorised_by_name: string | null; confirmed_by_name: string | null; rejection_reason?: string }
export interface DocumentRecord extends Row { id: string; name: string; category: string; owner_type: string; owner_label: string; size: string; mime: string; version: number; uploaded_by: string; uploaded_at: string; classification: string; versions: { version: number; at: string; by: string }[]; access_log: { at: string; user: string; action: string }[] }
export interface AuditEntry extends Row { id: string; user_name: string; action: string; module: string; record_reference: string; at: string; ip_address: string; previous_state: string; new_state: string; reason: string }
export interface JournalLine { id: string; account_id: string; account_code: string; account_name: string; debit: string; credit: string }
export interface Journal extends Row { id: string; journal_no: string; accounting_date: string; value_date: string; period_name: string; source_type: string; source_event: string; description: string; status: string; manual: boolean; currency: CurrencyCode; lines: JournalLine[]; total_debit: string; total_credit: string; created_by: string; created_by_name: string; approved_by_name?: string; reverses_journal_id: string | null }
export interface ReportResult { report: ReportDefinition; currency: CurrencyCode; generated_at: string; data_cut_off: string; label: string; columns: { key: string; label: string; type: string }[]; rows: Row[]; note: string | null; definitions: string[] }
export interface ReportDefinition { code: string; name: string; category: string; purpose: string; parameters: string; users: string }
export interface NotificationRecord extends Row { id: string; category: string; title: string; message: string; link: string; read: boolean; priority: string; channel: string; delivery_status: string; attempts: number; created_at: string }
