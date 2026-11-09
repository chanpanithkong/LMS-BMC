"""Generates the thin App Router page files from one route table. Each page only renders a module view."""
import os

ROOT = os.path.join(os.path.dirname(__file__), "..", "src", "app")
ROUTES = {
    "(auth)": {"auth/auth-pages": {
        "login": "LoginPage", "forgot-password": "ForgotPasswordPage", "reset-password": "ResetPasswordPage", "mfa": "MfaPage", "access-denied": "AccessDeniedPage",
    }},
    "(app)": {
        "dashboard/dashboard-page": {"dashboard": "DashboardPage"},
        "borrowers/views": {"borrowers": "BorrowerListPage", "borrowers/new": "RegisterChooserPage", "borrowers/new/individual": "RegisterIndividualPage", "borrowers/new/business": "RegisterBusinessPage", "borrowers/[id]": "BorrowerDetailPage", "borrowers/[id]/edit": "EditBorrowerPage", "borrowers/[id]/documents": "BorrowerDocumentsPage", "borrowers/[id]/loans": "BorrowerLoanHistoryPage"},
        "products/views": {"products": "ProductListPage", "products/new": "ProductNewPage", "products/approvals": "ProductApprovalPage", "products/calculator": "CalculatorPage", "products/[id]": "ProductDetailPage", "products/[id]/edit": "ProductEditPage", "products/[id]/versions": "ProductVersionsPage"},
        "applications/views": {"applications": "ApplicationListPage", "applications/new": "NewApplicationPage", "applications/[id]": "ApplicationDetailPage", "applications/[id]/documents": "ApplicationDocumentsPage", "applications/[id]/review": "ApplicationReviewPage", "applications/[id]/history": "ApplicationHistoryPage"},
        "credit/views": {"assessments": "AssessmentQueuePage", "assessments/[id]": "AssessmentDetailPage", "assessments/[id]/affordability": "AffordabilityPage", "approvals": "ApprovalQueuePage", "approvals/history": "ApprovalHistoryPage", "approvals/[id]": "ApprovalDetailPage"},
        "agreements/views": {"agreements": "AgreementListPage", "agreements/generate": "GenerateAgreementPage", "agreements/[id]": "AgreementDetailPage", "agreements/[id]/preview": "AgreementPreviewPage", "agreements/[id]/history": "AgreementHistoryPage"},
        "collateral/views": {"collateral": "CollateralListPage", "collateral/new": "RegisterCollateralPage", "collateral/[id]": "CollateralDetailPage", "collateral/[id]/valuations": "ValuationHistoryPage", "collateral/[id]/custody": "CustodyRecordsPage", "collateral/[id]/release": "CollateralReleasePage", "guarantors": "GuarantorListPage", "guarantors/[id]": "GuarantorDetailPage"},
        "disbursements/views": {"disbursements": "DisbursementQueuePage", "disbursements/new": "DisbursementRequestPage", "disbursements/history": "DisbursementHistoryPage", "disbursements/[id]": "DisbursementDetailPage", "disbursements/[id]/approve": "DisbursementApprovalPage", "disbursements/[id]/confirm": "ConfirmDisbursementPage"},
        "repayments/views": {"repayments": "RepaymentDashboardPage", "repayments/new": "RecordRepaymentPage", "repayments/history": "RepaymentHistoryPage", "repayments/reversals": "ReversalQueuePage", "repayments/reversals/[id]": "ReversalDetailPage", "repayments/[id]": "RepaymentDetailPage", "repayments/[id]/receipt": "ReceiptPage", "repayments/[id]/reversal": "ReversalRequestPage"},
        "loans/views": {"loans": "LoanRegisterPage", "loans/schedules": "LoanSchedulesPage", "loans/transactions": "LoanTransactionsListPage", "loans/[id]": "LoanDetailPage", "loans/[id]/schedule": "LoanSchedulePage", "loans/[id]/transactions": "LoanTransactionsPage", "loans/[id]/balances": "LoanBalancesPage", "loans/[id]/statement": "LoanStatementPage"},
        "collections/views": {"collections": "CollectionDashboardPage", "collections/overdue": "OverdueLoansPage", "collections/overdue/[id]": "DelinquencyDetailPage", "collections/activities": "CollectionActivitiesPage", "collections/contacts": "ContactHistoryPage", "collections/promises": "PromisesPage", "collections/assignments": "CollectionAssignmentPage"},
        "modifications/views": {"rescheduling": "ReschedulingListPage", "rescheduling/new": "NewReschedulingPage", "rescheduling/[id]": "ModificationDetailPage", "restructuring": "RestructuringListPage", "restructuring/new": "NewRestructuringPage", "restructuring/approvals": "RestructuringApprovalsPage", "restructuring/history": "ModificationHistoryPage", "restructuring/[id]": "ModificationDetailPage"},
        "settlements/views": {"settlements": "SettlementListPage", "settlements/calculator": "SettlementCalculatorPage", "settlements/[id]": "SettlementDetailPage", "closures": "LoanClosurePage", "closures/history": "ClosedLoanHistoryPage"},
        "fees/views": {"fees": "FeeConfigurationPage", "fees/penalties": "PenaltyConfigurationPage", "fees/transactions": "FeeTransactionsPage", "fees/penalty-transactions": "PenaltyTransactionsPage", "fees/waivers": "WaiverRequestsPage", "fees/waivers/approval": "WaiverApprovalPage"},
        "accounting/views": {"accounting": "AccountingDashboardPage", "accounting/accounts": "ChartOfAccountsPage", "accounting/accounts/[id]": "AccountDetailPage", "accounting/journals": "JournalListPage", "accounting/journals/new": "NewJournalPage", "accounting/journals/[id]": "JournalDetailPage", "accounting/trial-balance": "TrialBalancePage", "accounting/general-ledger": "GeneralLedgerPage", "accounting/reconciliation": "ReconciliationPage", "accounting/periods": "AccountingPeriodsPage", "accounting/periods/[id]/close": "PeriodClosingPage"},
        "reports/views": {"reports": "ReportCataloguePage", "reports/category/[category]": "ReportCategoryPage", "reports/[code]": "ReportViewerPage"},
        "notifications/views": {"notifications": "NotificationCenterPage", "notifications/settings": "NotificationSettingsPage", "notifications/[id]": "NotificationDetailPage"},
        "documents/views": {"documents": "DocumentLibraryPage", "documents/upload": "UploadDocumentPage", "documents/templates": "DocumentTemplatesPage", "documents/[id]": "DocumentDetailPage"},
        "audit/views": {"audit": "AuditDashboardPage", "audit/logs": "AuditLogPage", "audit/users": "UserActivityPage", "audit/financial": "FinancialActivityPage", "audit/exceptions": "ControlExceptionsPage", "audit/logins": "LoginHistoryPage"},
        "admin/views": {"admin/users": "UserListPage", "admin/users/new": "CreateUserPage", "admin/users/[id]": "UserDetailPage", "admin/roles": "RolesPage", "admin/permissions": "PermissionsPage", "admin/branches": "BranchesPage", "admin/settings": "CompanySettingsPage", "admin/settings/currencies": "CurrencySettingsPage", "admin/settings/exchange-rates": "ExchangeRatesPage", "admin/settings/calendars": "BusinessCalendarsPage", "admin/settings/numbering": "DocumentNumberingPage", "admin/settings/system": "SystemConfigurationPage"},
    },
}
count = 0
for group, modules in ROUTES.items():
    for module, pages in modules.items():
        for route, component in pages.items():
            folder = os.path.join(ROOT, group, *route.split("/"))
            os.makedirs(folder, exist_ok=True)
            with open(os.path.join(folder, "page.tsx"), "w", encoding="utf-8", newline="\n") as f:
                f.write(f'import {{ {component} }} from "@/components/{module}";\n\nexport default function Page() {{\n  return <{component} />;\n}}\n')
            count += 1
print("generated", count, "routes")
