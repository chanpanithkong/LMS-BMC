"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, Eye, EyeOff, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FileUploader, type PickedFile } from "@/components/shared/document";
import { cn } from "@/lib/utils";
import { formatDate, todayISO } from "@/lib/formatters/date";
import { CURRENCY_PRECISION, formatAmount, isPositiveDecimal, normaliseDecimalInput, type CurrencyCode } from "@/lib/formatters/money";
import { useT } from "@/lib/i18n/store";

export type Values = Record<string, unknown>;
export type FieldType = "text" | "textarea" | "email" | "phone" | "password" | "number" | "percent" | "money" | "date" | "select" | "checkbox" | "file";
export interface Option { value: string; label: string }
export interface FieldDef {
  name: string; label: string; type?: FieldType; required?: boolean; options?: Option[]; currency?: CurrencyCode | ((values: Values) => CurrencyCode);
  placeholder?: string; span?: 1 | 2 | 3; help?: string; disabled?: boolean; defaultValue?: unknown; maxToday?: boolean; minToday?: boolean; visible?: (values: Values) => boolean;
}

const PHONE = /^(\+?855|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{3,4}$/;

/** Input validation only: amounts remain strings and business rules are re-validated by the API. */
export function buildSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    const type = f.type ?? "text";
    const req = "This field is required";
    if (type === "checkbox") { shape[f.name] = z.boolean().optional(); continue; }
    if (type === "file") { shape[f.name] = f.required ? z.custom<PickedFile>((v) => Boolean(v), req) : z.custom<PickedFile | null>().optional(); continue; }
    let s = z.string().trim();
    if (f.required) s = s.min(1, req);
    let schema: z.ZodType = s;
    const opt = (test: (v: string) => boolean, message: string) => s.refine((v) => v === "" || test(v), message);
    if (type === "email") schema = opt((v) => z.email().safeParse(v).success, "Enter a valid email address");
    if (type === "phone") schema = opt((v) => PHONE.test(v), "Enter a valid Cambodian phone number, e.g. +855 12 345 678");
    if (type === "money") schema = opt(isPositiveDecimal, "Enter an amount greater than zero");
    if (type === "number") schema = opt((v) => /^\d+$/.test(v), "Enter a whole number");
    if (type === "percent") schema = opt((v) => /^\d{1,3}(\.\d{1,8})?$/.test(v), "Enter a valid percentage");
    if (type === "date") schema = opt((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && (!f.maxToday || v <= todayISO()) && (!f.minToday || v >= todayISO()), f.maxToday ? "Date cannot be in the future" : f.minToday ? "Date must be today or later" : "Enter a valid date");
    shape[f.name] = schema;
  }
  return z.object(shape);
}

export function defaultsFor(fields: FieldDef[], overrides: Values = {}) {
  return Object.fromEntries(fields.map((f) => [f.name, overrides[f.name] ?? f.defaultValue ?? (f.type === "checkbox" ? false : f.type === "file" ? null : "")]));
}

export function useZodForm(fields: FieldDef[], overrides?: Values) {
  const schema = useMemo(() => buildSchema(fields), [fields]);
  return useForm<Values>({ resolver: zodResolver(schema) as never, defaultValues: defaultsFor(fields, overrides), mode: "onTouched" });
}

export function CurrencyInput({ value, onChange, onBlur, currency = "USD", id, disabled, invalid }: { value: string; onChange: (v: string) => void; onBlur?: () => void; currency?: CurrencyCode; id?: string; disabled?: boolean; invalid?: boolean }) {
  const [focused, setFocused] = useState(false);
  const shown = focused || !value ? value : formatAmount(value, currency);
  return (
    <div className="relative">
      <Input id={id} inputMode={CURRENCY_PRECISION[currency] ? "decimal" : "numeric"} autoComplete="off" disabled={disabled} aria-invalid={invalid} className="pr-12 text-right tabular" value={shown}
        onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); onBlur?.(); }} onChange={(e) => onChange(normaliseDecimalInput(e.target.value, currency))} />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{currency}</span>
    </div>
  );
}

const toDate = (iso: string) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function DatePicker({ value, onChange, onBlur, id, disabled, invalid, placeholder = "DD/MM/YYYY" }: { value: string; onChange: (v: string) => void; onBlur?: () => void; id?: string; disabled?: boolean; invalid?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) onBlur?.(); }}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} aria-invalid={invalid} className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}>
          {value ? formatDate(value) : placeholder}<CalendarIcon className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" captionLayout="dropdown" startMonth={new Date(1950, 0)} endMonth={new Date(2045, 11)} selected={value ? toDate(value) : undefined} defaultMonth={value ? toDate(value) : undefined} onSelect={(d) => { onChange(d ? toIso(d) : ""); setOpen(false); }} />
      </PopoverContent>
    </Popover>
  );
}

export function DateRangePicker({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-1">
      <div className="w-32"><DatePicker value={from} onChange={(v) => onChange(v, to)} placeholder={t("From")} /></div>
      <div className="w-32"><DatePicker value={to} onChange={(v) => onChange(from, v)} placeholder={t("To")} /></div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search", delay = 300, className }: { value: string; onChange: (v: string) => void; placeholder?: string; delay?: number; className?: string }) {
  const t = useT();
  const [local, setLocal] = useState(value);
  useEffect(() => {
    if (local === value) return;
    const handle = setTimeout(() => onChange(local), delay);
    return () => clearTimeout(handle);
  }, [local, value, delay, onChange]);
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" aria-label={t(placeholder)} placeholder={t(placeholder)} className="pl-8" value={local} onChange={(e) => setLocal(e.target.value)} />
    </div>
  );
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  const t = useT();
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button type="button" className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground" aria-label={t(show ? "Hide password" : "Show password")} onClick={() => setShow(!show)}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
    </div>
  );
}

export function FieldShell({ label, htmlFor, required, error, help, children, className }: { label: string; htmlFor?: string; required?: boolean; error?: string; help?: string; children: ReactNode; className?: string }) {
  const t = useT();
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{t(label)}{required && <span className="text-destructive" aria-hidden> *</span>}</Label>
      {children}
      {help && !error && <p className="text-xs text-muted-foreground">{t(help)}</p>}
      {error && <p className="text-xs text-destructive" role="alert">{t(error)}</p>}
    </div>
  );
}

export function FormFields({ form, fields, columns = 2 }: { form: UseFormReturn<Values>; fields: FieldDef[]; columns?: 1 | 2 | 3 }) {
  const t = useT();
  const values = form.watch();
  const grid = columns === 1 ? "" : columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={cn("grid gap-4", grid)}>
      {fields.filter((f) => !f.visible || f.visible(values)).map((f) => {
        const type = f.type ?? "text";
        const id = `field-${f.name}`;
        const span = f.span === 3 ? "sm:col-span-2 lg:col-span-3" : f.span === 2 || type === "textarea" ? "sm:col-span-2" : "";
        return (
          <Controller key={f.name} control={form.control} name={f.name} render={({ field, fieldState }) => {
            const error = fieldState.error?.message;
            if (type === "checkbox") return (
              <div className={cn("flex items-center gap-2 pt-6", span)}>
                <Checkbox id={id} checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} disabled={f.disabled} />
                <Label htmlFor={id}>{t(f.label)}</Label>
              </div>
            );
            const text = String(field.value ?? "");
            const shared = { id, disabled: f.disabled, "aria-invalid": Boolean(error) };
            const currency = typeof f.currency === "function" ? f.currency(values) : (f.currency ?? "USD");
            return (
              <FieldShell label={f.label} htmlFor={id} required={f.required} error={error} help={f.help} className={span}>
                {type === "textarea" ? <Textarea {...shared} rows={3} placeholder={f.placeholder && t(f.placeholder)} value={text} onChange={field.onChange} onBlur={field.onBlur} />
                  : type === "select" ? (
                    <Select value={text} onValueChange={field.onChange} disabled={f.disabled}>
                      <SelectTrigger id={id} aria-invalid={Boolean(error)} className="w-full"><SelectValue placeholder={t(f.placeholder ?? "Select")} /></SelectTrigger>
                      <SelectContent>{(f.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : type === "money" ? <CurrencyInput id={id} value={text} onChange={field.onChange} onBlur={field.onBlur} currency={currency} disabled={f.disabled} invalid={Boolean(error)} />
                  : type === "date" ? <DatePicker id={id} value={text} onChange={field.onChange} onBlur={field.onBlur} disabled={f.disabled} invalid={Boolean(error)} />
                  : type === "file" ? <FileUploader value={(field.value as PickedFile | null) ?? null} onChange={field.onChange} invalid={Boolean(error)} />
                  : type === "password" ? <PasswordInput {...shared} value={text} onChange={field.onChange} onBlur={field.onBlur} autoComplete="current-password" />
                  : <Input {...shared} type={type === "email" ? "email" : type === "phone" ? "tel" : "text"} inputMode={type === "number" ? "numeric" : type === "percent" ? "decimal" : undefined} placeholder={f.placeholder && t(f.placeholder)} value={text} onChange={field.onChange} onBlur={field.onBlur} />}
              </FieldShell>
            );
          }} />
        );
      })}
    </div>
  );
}
