"""Lists English UI strings that have no Khmer translation. Usage: python scripts/i18n-coverage.py [--list]"""
import os, re, sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "src")
SKIP = (os.path.join("components", "ui"), os.path.join("mocks", "server"), os.path.join("lib", "api"), os.path.join("app", "api"))
PATTERNS = [
    r'\bt\("((?:[^"\\]|\\.)+)"\)',
    r'\b(?:label|title|description|successMessage|submitLabel|help|placeholder|searchPlaceholder|emptyTitle|summary)[:=]\s*\{?"((?:[^"\\]|\\.)+)"',
    r'\[\s*"([A-Z][A-Za-z0-9 ()/%&,.\'-]+)"\s*,\s*(?:<|m\(|money\(|String\(|format|t\(|[a-z]+\.|`|"|\w+\[)',
    r'\["[A-Z_]+",\s*"([^"]+)"\]',
    r'"([A-Z][a-zA-Z]+(?: [A-Za-z&]+){0,5})"',
]
STATUS = r'"([A-Z]{2,}(?:_[A-Z]+)*)"'
sys.stdout.reconfigure(encoding="utf-8")
found = set()
for base, _, files in os.walk(ROOT):
    if any(s in base for s in SKIP):
        continue
    for name in files:
        if not name.endswith((".ts", ".tsx")) or name == "km.ts":
            continue
        text = open(os.path.join(base, name), encoding="utf-8").read()
        for p in PATTERNS[:4]:
            found.update(re.findall(p, text))
        for s in re.findall(r'(?:statusOptions\(\[|STATUSES = \[|StatusBadge status="|steps=\{\[)([^\]\n]*)', text):
            found.update(w.replace("_", " ").title() for w in re.findall(STATUS, s))
        if name in ("options.ts", "navigation.ts", "seed.ts"):
            found.update(re.findall(PATTERNS[4], text) if name != "seed.ts" else [])
for s in ["Draft", "Submitted", "Under Review", "Pending Documents", "Pending Credit Assessment", "Pending Approval", "Approved", "Rejected", "Withdrawn", "Expired", "Pending Acceptance", "Accepted", "Pending Disbursement", "Active", "Written Off", "Closed Paid", "Closed Early Settlement", "Cancelled", "Requested", "Authorised", "Confirmed", "Failed", "Completed", "Reversed", "Overdue", "Paid", "Partially Paid", "Due", "Scheduled", "Posted", "Open", "Closed", "Kept", "Broken", "Reconciled", "In Progress", "Assessed", "Signed", "Executed", "Pledged", "Released", "Quoted", "Settled", "Generated", "Superseded", "Declined", "Prospect", "Inactive", "Blacklisted", "Deceased", "Individual", "Business", "Pass", "Warning", "Fail", "Approve", "Reject", "Approve With Conditions", "Request Info", "Escalate", "Cash", "Bank Transfer", "Disbursement", "Repayment", "Manual", "Refund", "Asset", "Contra Asset", "Liability", "Equity", "Revenue", "Expense", "Memo", "Low", "Medium", "High", "Normal", "Delivered", "Success", "Principal", "Interest", "Fee", "Penalty", "Unapplied", "Interest Due", "Repayment Allocation", "Fee Deducted", "Fee Charged", "Penalty Charged", "Unapplied In", "Reversal", "Waiver", "Waived", "Charged", "Monthly", "Weekly", "Biweekly", "Quarterly", "At Maturity", "Reducing", "Flat", "Simple", "Equal Installment", "Equal Principal", "Interest Only", "Bullet", "Rescheduling", "Restructuring", "Personal", "Employee", "Secured", "Unsecured", "Installment", "En", "Km", "Bilingual", "In", "Transfer", "Out", "Under Verification", "Release Authorised", "Invited", "Retired", "Original", "Reschedule", "Restructure", "Disbursement Date", "Proposed", "Approval", "Amendment", "Current", "Performing", "Borrower", "Loan", "Agreement", "Collateral", "Transaction", "Application", "Processing", "Late", "Early Repayment", "On Charge", "On Collection", "Deferred", "Fixed", "Percent"]:
    found.add(s)
text = open(os.path.join(ROOT, "lib", "i18n", "km.ts"), encoding="utf-8").read()
have = set(re.findall(r'^\s*"((?:[^"\\]|\\.)+)":', text, re.M))
missing = sorted(s for s in found if s not in have and re.search(r"[A-Za-z]{2}", s) and "${" not in s and not s.startswith(("/", "@", "http")))
print(f"{len(found)} strings, {len(have)} translated, {len(missing)} missing")
if "--list" in sys.argv:
    print("\n".join(missing))
