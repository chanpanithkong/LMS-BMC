"use client";
/** Client-side file generation for table data that the API has already returned. */

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type Sheet = { headers: string[]; rows: string[][]; title: string; footer: string[] };

/** CSV with a UTF-8 BOM so Excel reads Khmer correctly (FR-RPT-006). */
export function exportCsv({ headers, rows, footer }: Sheet, filename: string) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const body = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const notes = footer.map((f) => esc(f)).join("\r\n");
  download(new Blob(["﻿", body, "\r\n\r\n", notes], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

const encoder = new TextEncoder();
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (const b of data) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Minimal store-only ZIP, which is all an XLSX container needs. */
function zip(files: [string, string][]) {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => [v & 255, (v >> 8) & 255];
  const u32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  for (const [name, text] of files) {
    const data = encoder.encode(text);
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)];
    const local = new Uint8Array([0x50, 0x4b, 3, 4, ...common, ...nameBytes]);
    chunks.push(local, data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes]));
    offset += local.length + data.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)]);
  return new Blob([...chunks, ...central, end].map((c) => c.slice().buffer as ArrayBuffer), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const xml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function exportXlsx({ headers, rows, footer, title }: Sheet, filename: string) {
  const col = (i: number) => {
    let s = "";
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };
  const row = (cells: string[], r: number) => `<row r="${r}">${cells.map((v, i) => `<c r="${col(i)}${r}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join("")}</row>`;
  const all = [[title], [], headers, ...rows, [], ...footer.map((f) => [f])];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${all.map((c, i) => row(c, i + 1)).join("")}</sheetData></worksheet>`;
  download(zip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Export" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheet],
  ]), `${filename}.xlsx`);
}

/** Opens a print view; the browser's "Save as PDF" keeps correct Khmer shaping. */
export function printTable({ headers, rows, footer, title }: Sheet) {
  const win = window.open("", "_blank", "noopener=false,width=1000,height=700");
  if (!win) return false;
  const cell = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${cell(title)}</title>${[...document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")].map((l) => `<link rel="stylesheet" href="${l.href}">`).join("")}<style>body{font-family:"Noto Sans Khmer Variable",Arial,sans-serif;font-size:11px;margin:24px;color:#111}h1{font-size:16px;margin:0 0 12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f1f4f9}p{color:#555;margin:2px 0}</style></head><body><h1>${cell(title)}</h1><table><thead><tr>${headers.map((h) => `<th>${cell(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join("")}</tr>`).join("")}</tbody></table><div style="margin-top:12px">${footer.map((f) => `<p>${cell(f)}</p>`).join("")}</div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  win.document.close();
  return true;
}
