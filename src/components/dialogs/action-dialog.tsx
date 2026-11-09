"use client";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormFields, useZodForm, type FieldDef, type Values } from "@/components/forms/fields";
import { SimulatedTag } from "@/components/shared/display";
import { useAction } from "@/hooks/use-action";
import { useCan } from "@/lib/auth/store";
import { useT } from "@/lib/i18n/store";
import type { Permission } from "@/lib/permissions";

export interface ActionDef {
  title: string;
  description?: string;
  fields?: FieldDef[];
  defaults?: Values;
  submitLabel?: string;
  destructive?: boolean;
  /** Restates what is about to happen, in words and figures (SRS §16.4). */
  summary?: ReactNode;
  simulated?: boolean;
  successMessage?: string;
  run: (values: Values) => Promise<unknown>;
  after?: (result: unknown) => void;
}

const EMPTY: FieldDef[] = [];

/** Generic confirmation or form dialog; the submit button stays disabled while the command runs. */
export function ActionDialog({ action, open, onOpenChange }: { action: ActionDef; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const execute = useAction();
  const fields = action.fields ?? EMPTY;
  const form = useZodForm(fields, action.defaults);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { if (open) form.reset(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const result = await execute(() => action.run(values), { success: action.successMessage ?? "Completed", simulated: action.simulated });
      onOpenChange(false);
      action.after?.(result);
    } catch {
      /* The toast reports the error; keep the dialog open for correction. */
    } finally {
      setSubmitting(false);
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{t(action.title)}{action.simulated && <SimulatedTag />}</DialogTitle>
            {action.description && <DialogDescription>{t(action.description)}</DialogDescription>}
          </DialogHeader>
          {action.summary && <div className="rounded-md bg-muted/60 p-3 text-sm">{action.summary}</div>}
          {fields.length > 0 && <FormFields form={form} fields={fields} columns={1} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>{t("Cancel")}</Button>
            <Button type="submit" variant={action.destructive ? "destructive" : "default"} disabled={submitting}>{t(submitting ? "Processing…" : (action.submitLabel ?? "Confirm"))}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const ConfirmationDialog = ActionDialog;

export function ActionButton({ label, icon: Icon, variant = "default", size = "sm", perms, action, disabled, title }: { label: string; icon?: LucideIcon; variant?: React.ComponentProps<typeof Button>["variant"]; size?: React.ComponentProps<typeof Button>["size"]; perms?: Permission[]; action: ActionDef; disabled?: boolean; title?: string }) {
  const t = useT();
  const can = useCan();
  const [open, setOpen] = useState(false);
  const memo = useMemo(() => action, [action]);
  if (perms && !can(...perms)) return null;
  return (
    <>
      <Button variant={variant} size={size} disabled={disabled} title={title && t(title)} onClick={() => setOpen(true)}>{Icon && <Icon className="size-4" aria-hidden />}{t(label)}</Button>
      {open && <ActionDialog action={memo} open={open} onOpenChange={setOpen} />}
    </>
  );
}
