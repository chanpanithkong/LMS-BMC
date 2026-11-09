"use client";
import Link from "next/link";
import { formatDate } from "@/lib/formatters/date";
import { useT } from "@/lib/i18n/store";
import type { LoanSummary } from "@/types";
import { DetailGrid, MoneyDisplay, Section, StatusBadge } from "./display";

export function dpdTone(dpd: number) {
  return dpd > 90 ? "bg-danger text-white" : dpd > 30 ? "bg-danger-soft text-danger" : dpd > 0 ? "bg-warning-soft text-warning" : "bg-success-soft text-success";
}

export function DpdBadge({ dpd }: { dpd: number }) {
  return <span className={`inline-flex min-w-10 justify-center rounded px-1.5 py-0.5 text-xs font-semibold tabular ${dpdTone(dpd)}`}>{dpd}</span>;
}

export function LoanSummaryCard({ loan, title = "Loan summary" }: { loan: LoanSummary; title?: string }) {
  const t = useT();
  const m = (v: string | null) => <MoneyDisplay value={v} currency={loan.currency} />;
  return (
    <Section title={title} actions={<StatusBadge status={loan.status} />}>
      <DetailGrid columns={4} items={[
        ["Loan Account", <Link key="a" className="text-primary underline-offset-2 hover:underline" href={`/loans/${loan.id}`}>{loan.account_no}</Link>],
        ["Borrower", <Link key="b" className="text-primary underline-offset-2 hover:underline" href={`/borrowers/${loan.borrower_id}`}>{loan.borrower_name}</Link>],
        ["Original Principal", m(loan.original_principal)],
        ["Outstanding Principal", m(loan.outstanding_principal)],
        ["Interest Due", m(loan.interest_due)],
        ["Interest Accrued", m(loan.interest_accrued)],
        ["Fees Due", m(loan.fees_due)],
        ["Penalties Due", m(loan.penalties_due)],
        ["Total Outstanding", m(loan.total_outstanding)],
        ["Next Payment Date", formatDate(loan.next_payment_date)],
        ["Days Past Due", <DpdBadge key="d" dpd={loan.days_past_due} />],
        ["Delinquency Bucket", t(loan.bucket)],
      ]} />
    </Section>
  );
}
