"use client";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/formatters/date";
import { formatAmount, type CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";
import { StatusBadge } from "./display";

export interface ScheduleRow { no: number; due_date: string; payment_due_date?: string; opening: string; principal: string; interest: string; total: string; closing: string; amount_paid?: string; status?: string }

/** Displays figures exactly as the API returned them; totals come from the API as well. */
export function ScheduleTable({ rows, currency, totals }: { rows: ScheduleRow[]; currency: CurrencyCode; totals?: { principal?: string; interest?: string; total?: string } }) {
  const t = useT();
  const showPaid = rows.some((r) => r.amount_paid !== undefined);
  const money = "text-right tabular";
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Installment Number")}</TableHead><TableHead>{t("Due Date")}</TableHead><TableHead className="text-right">{t("Opening Principal")}</TableHead><TableHead className="text-right">{t("Principal")}</TableHead><TableHead className="text-right">{t("Interest")}</TableHead><TableHead className="text-right">{t("Total Installment")}</TableHead>
            {showPaid && <TableHead className="text-right">{t("Amount Paid")}</TableHead>}
            <TableHead className="text-right">{t("Closing Principal")}</TableHead>
            {showPaid && <TableHead>{t("Payment Status")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.no}>
              <TableCell>{r.no}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(r.due_date)}{r.payment_due_date && r.payment_due_date !== r.due_date && <span className="block text-xs text-muted-foreground">{t("Pay by")} {formatDate(r.payment_due_date)}</span>}</TableCell>
              <TableCell className={money}>{formatAmount(r.opening, currency)}</TableCell>
              <TableCell className={money}>{formatAmount(r.principal, currency)}</TableCell>
              <TableCell className={money}>{formatAmount(r.interest, currency)}</TableCell>
              <TableCell className={`${money} font-medium`}>{formatAmount(r.total, currency)}</TableCell>
              {showPaid && <TableCell className={money}>{formatAmount(r.amount_paid, currency)}</TableCell>}
              <TableCell className={money}>{formatAmount(r.closing, currency)}</TableCell>
              {showPaid && <TableCell><StatusBadge status={r.status ?? ""} /></TableCell>}
            </TableRow>
          ))}
        </TableBody>
        {totals && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-semibold">{t("Total")}</TableCell>
              <TableCell className={`${money} font-semibold`}>{formatAmount(totals.principal, currency)}</TableCell>
              <TableCell className={`${money} font-semibold`}>{formatAmount(totals.interest, currency)}</TableCell>
              <TableCell className={`${money} font-semibold`}>{formatAmount(totals.total, currency)}</TableCell>
              <TableCell colSpan={showPaid ? 3 : 1} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
