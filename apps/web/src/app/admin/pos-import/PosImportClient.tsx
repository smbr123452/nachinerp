"use client";

import { useState } from "react";

type PreviewRow = {
  index: number;
  branchName: string;
  saleDate: string;
  receiptNo: string;
  productCode: string;
  productName: string;
  quantity: number;
  status: "READY" | "UNMAPPED" | "SKIPPED_CANCELLED";
  productMatchedBy?: "CODE" | "NAME";
};

export default function PosImportClient({ canRun }: { canRun: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [importSummary, setImportSummary] = useState<Record<string, unknown> | null>(null);

  async function parseResponse(res: Response): Promise<Record<string, unknown>> {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as Record<string, unknown>;
    }
    const text = await res.text();
    return { message: text || "Серверээс хоосон хариу ирлээ." };
  }

  async function preview() {
    setError("");
    setImportSummary(null);
    if (!file) {
      setError("Файл сонгоно уу.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/pos-import/preview", { method: "POST", body: fd });
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(String(data.message ?? "Preview алдаа."));
      return;
    }
    setSummary((data.summary as Record<string, unknown>) ?? null);
    setRows((data.previewRows as PreviewRow[]) ?? []);
  }

  async function confirmImport() {
    setError("");
    if (!file) {
      setError("Файл сонгоно уу.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/pos-import/confirm", { method: "POST", body: fd });
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(String(data.message ?? "Import алдаа."));
      return;
    }
    setImportSummary((data.summary as Record<string, unknown>) ?? null);
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">POS Excel импорт (өдрийн хаалт)</h1>
        {error ? <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 flex items-center gap-2">
          <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button onClick={() => void preview()} disabled={!canRun} className="rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">
            Preview
          </button>
          <button onClick={() => void confirmImport()} disabled={!canRun || rows.length === 0} className="rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
            Confirm Import
          </button>
        </div>
        {summary ? <pre className="mt-3 rounded bg-neutral-100 p-3 text-xs">{JSON.stringify(summary, null, 2)}</pre> : null}
        {importSummary ? <pre className="mt-3 rounded bg-green-50 p-3 text-xs">{JSON.stringify(importSummary, null, 2)}</pre> : null}
      </section>

      <section className="rounded border bg-white p-5">
        <h2 className="font-medium">Preview мөрүүд</h2>
        <div className="mt-3 space-y-2 text-sm">
          {rows.slice(0, 300).map((r) => (
            <div key={r.index} className="rounded border p-2">
              <p className="font-medium">
                #{r.index} [{r.status}] {r.branchName} | {r.saleDate} | {r.receiptNo}
              </p>
              <p className="text-xs text-neutral-600">
                {r.productCode} - {r.productName} | qty: {r.quantity} {r.productMatchedBy ? `| map: ${r.productMatchedBy}` : ""}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

