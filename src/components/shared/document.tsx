"use client";
import { FileText, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/store";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 10 * 1024 * 1024;

export interface PickedFile { name: string; size: string; mime: string }

function humanSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/** Client-side checks for type and size (FR-FIL-004); the server must validate content and scan. */
export function FileUploader({ value, onChange, accept = ".pdf,.jpg,.jpeg,.png", invalid }: { value?: PickedFile | null; onChange: (file: PickedFile | null) => void; accept?: string; invalid?: boolean }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const pick = (file?: File) => {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) return setError("Only PDF, JPG and PNG files are allowed.");
    if (file.size > MAX_BYTES) return setError("Files must be 10 MB or smaller.");
    setError(null);
    onChange({ name: file.name, size: humanSize(file.size), mime: file.type });
  };
  return (
    <div>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0 text-primary" aria-hidden /><span className="truncate">{value.name}</span><span className="shrink-0 text-xs text-muted-foreground">{value.size}</span></span>
          <Button type="button" variant="ghost" size="icon" aria-label={t("Remove file")} onClick={() => onChange(null)}><X className="size-4" /></Button>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }} className={`flex w-full flex-col items-center gap-1 rounded-md border border-dashed px-4 py-5 text-sm transition-colors hover:bg-muted/50 ${dragging ? "border-primary bg-accent" : ""} ${invalid ? "border-destructive" : ""}`}>
          <Upload className="size-4 text-muted-foreground" aria-hidden />
          <span>{t("Drop a file or click to browse")}</span>
          <span className="text-xs text-muted-foreground">{t("PDF, JPG or PNG, up to 10 MB")}</span>
        </button>
      )}
      <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      {error && <p className="mt-1 text-xs text-destructive">{t(error)}</p>}
    </div>
  );
}

export function DocumentPreview({ name, meta, onDownload }: { name: string; meta?: string; onDownload?: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/30 px-6 py-12 text-center">
      <FileText className="size-10 text-muted-foreground" aria-hidden />
      <div><p className="font-medium break-all">{name}</p>{meta && <p className="text-xs text-muted-foreground">{meta}</p>}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{t("Demonstration record: no file content is stored. In production, documents open through a signed link valid for 5 minutes.")}</p>
      {onDownload && <Button variant="outline" size="sm" onClick={onDownload}>{t("Request signed link")}</Button>}
    </div>
  );
}
