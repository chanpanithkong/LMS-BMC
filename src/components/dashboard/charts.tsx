"use client";
import { Table2, BarChart3 } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/shared/display";
import { formatAmount, type CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";

export interface Point { [key: string]: string | number }

// Chart geometry is the only place amounts become numbers: for pixel positions, never for figures shown or stored.
const num = (v: unknown) => Number(v ?? 0);
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const AXIS = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, tickLine: false, axisLine: false } as const;
const GRID = <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />;

function Tip({ active, payload, label, currency, percent }: { active?: boolean; payload?: { name: string; color: string; payload: Point; dataKey: string }[]; label?: string; currency?: CurrencyCode; percent?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p) => <p key={p.dataKey} className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: p.color }} /><span className="text-muted-foreground">{p.name}</span><span className="ml-auto pl-3 font-medium tabular">{percent ? `${p.payload[p.dataKey]} %` : formatAmount(String(p.payload[p.dataKey]), currency)}</span></p>)}
    </div>
  );
}

function ChartCard({ title, description, data, columns, children }: { title: string; description?: string; data: Point[]; columns: [string, string, "money" | "percent" | "text", CurrencyCode?][]; children: React.ReactNode }) {
  const t = useT();
  const [table, setTable] = useState(false);
  return (
    <Section title={title} description={description} actions={<Button variant="ghost" size="icon" aria-label={t(table ? "Show chart" : "Show data table")} onClick={() => setTable(!table)}>{table ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}</Button>}>
      {table ? (
        <div className="max-h-56 overflow-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left text-muted-foreground">{columns.map(([, label]) => <th key={label} className="py-1 pr-2 font-medium">{t(label)}</th>)}</tr></thead><tbody>{data.map((row, i) => <tr key={i} className="border-b last:border-0">{columns.map(([key, , type, cur]) => <td key={key} className="py-1 pr-2 tabular">{type === "money" ? formatAmount(String(row[key]), cur) : type === "percent" ? `${row[key]} %` : String(row[key])}</td>)}</tr>)}</tbody></table></div>
      ) : <div className="h-56">{children}</div>}
    </Section>
  );
}

export function TrendArea({ title, description, data, dataKey, seriesName, currency }: { title: string; description?: string; data: Point[]; dataKey: string; seriesName: string; currency: CurrencyCode }) {
  const t = useT();
  return (
    <ChartCard title={title} description={description} data={data} columns={[["month", "Month", "text"], [dataKey, seriesName, "money", currency]]}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.map((d) => ({ ...d, y: num(d[dataKey]) }))} margin={{ left: 0, right: 8, top: 8 }}>
          {GRID}<XAxis dataKey="month" {...AXIS} interval="preserveStartEnd" /><YAxis {...AXIS} width={48} tickFormatter={(v) => compact.format(v)} />
          <Tooltip content={<Tip currency={currency} />} cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} />
          <Area type="monotone" dataKey="y" name={t(seriesName)} stroke="var(--chart-1)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.12} isAnimationActive={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function TipBar({ active, payload, label, currency, seriesName, valueKey }: { active?: boolean; payload?: { payload: Point }[]; label?: string; currency?: CurrencyCode; seriesName: string; valueKey: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md"><p className="font-medium">{label}</p><p className="tabular"><span className="text-muted-foreground">{seriesName}: </span>{formatAmount(String(point[valueKey]), currency)}</p></div>;
}

export function TrendBars({ title, description, data, dataKey, seriesName, currency }: { title: string; description?: string; data: Point[]; dataKey: string; seriesName: string; currency: CurrencyCode }) {
  const t = useT();
  return (
    <ChartCard title={title} description={description} data={data} columns={[["month", "Month", "text"], [dataKey, seriesName, "money", currency]]}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.map((d) => ({ ...d, y: num(d[dataKey]) }))} margin={{ left: 0, right: 8, top: 8 }} barCategoryGap="28%">
          {GRID}<XAxis dataKey="month" {...AXIS} interval="preserveStartEnd" /><YAxis {...AXIS} width={48} tickFormatter={(v) => compact.format(v)} />
          <Tooltip content={<TipBar currency={currency} seriesName={t(seriesName)} valueKey={dataKey} />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
          <Bar dataKey="y" fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ParTrend({ data }: { data: Point[] }) {
  const t = useT();
  return (
    <ChartCard title="Portfolio at Risk (PAR) Trends" description="Outstanding principal with DPD above the threshold ÷ all active outstanding principal" data={data} columns={[["month", "Month", "text"], ["par30", "PAR30", "percent"], ["par90", "PAR90", "percent"]]}>
      <div className="flex h-full flex-col">
        <div className="mb-1 flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: "var(--chart-1)" }} />PAR30</span><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: "var(--chart-2)" }} />PAR90</span></div>
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.map((d) => ({ ...d, a: num(d.par30), b: num(d.par90) }))} margin={{ left: 0, right: 8, top: 8 }}>
              {GRID}<XAxis dataKey="month" {...AXIS} interval="preserveStartEnd" /><YAxis {...AXIS} width={40} unit="%" />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md"><p className="mb-1 font-medium">{label}</p><p className="tabular">PAR30: {String((payload[0].payload as Point).par30)} %</p><p className="tabular">PAR90: {String((payload[0].payload as Point).par90)} %</p></div> : null} cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} />
              <Line type="monotone" dataKey="a" name={t("PAR30")} stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="b" name={t("PAR90")} stroke="var(--chart-2)" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}

/** Ranked horizontal bars: compositions read more accurately as lengths than as pie slices. */
export function RankedBars({ title, description, data, currency, count }: { title: string; description?: string; data: { name: string; value: string; count: number }[]; currency?: CurrencyCode; count?: boolean }) {
  const t = useT();
  const rows: Point[] = data.map((d) => ({ name: t(d.name), value: d.value, count: d.count }));
  const max = Math.max(1, ...data.map((d) => num(count ? d.count : d.value)));
  return (
    <ChartCard title={title} description={description} data={rows} columns={[["name", "Category", "text"], ...(count ? [] : [["value", "Outstanding Principal", "money", currency] as [string, string, "money", CurrencyCode?]]), ["count", "Loans", "text"]]}>
      <ul className="flex h-full flex-col justify-center gap-3 overflow-y-auto">
        {data.map((d) => (
          <li key={d.name} className="group text-xs" title={`${t(d.name)}: ${count ? d.count : `${formatAmount(d.value, currency)} ${currency}`}`}>
            <div className="mb-1 flex justify-between gap-2"><span className="truncate">{t(d.name)}</span><span className="shrink-0 tabular text-muted-foreground">{count ? d.count : formatAmount(d.value, currency)}</span></div>
            <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-chart-1 transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(1.5, (num(count ? d.count : d.value) / max) * 100)}%` }} /></div>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}
