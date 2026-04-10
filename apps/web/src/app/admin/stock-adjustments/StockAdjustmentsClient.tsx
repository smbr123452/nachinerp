"use client";

import { useEffect, useState } from "react";

type Adjustment = {
  id: string;
  adjustmentNo: string;
  status: "PENDING_APPROVAL" | "APPROVED";
  warehouse: { nameMn: string; branch: { nameMn: string } };
  stockCount?: { countNo: string } | null;
  items: { id: string; varianceQty: string; product: { nameMn: string; sku: string } }[];
  createdAt: string;
};

export default function StockAdjustmentsClient({ canApprove }: { canApprove: boolean }) {
  const [rows, setRows] = useState<Adjustment[]>([]);
  const [error, setError] = useState("");

  async function parseResponse(res: Response): Promise<{ message?: string }> {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as { message?: string };
    }
    const text = await res.text();
    return { message: text || "Серверээс хоосон хариу ирлээ." };
  }

  async function loadData() {
    const res = await fetch("/api/admin/stock-adjustments");
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(data.message ?? "Тохируулгын мэдээлэл ачаалж чадсангүй.");
      return;
    }
    const payload = data as unknown as { adjustments?: Adjustment[] };
    setRows(payload.adjustments ?? []);
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function approve(adjustmentId: string) {
    const res = await fetch("/api/admin/stock-adjustments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjustmentId, action: "approve" }),
    });
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(data.message ?? "Тохируулга батлахад алдаа гарлаа.");
      return;
    }
    await loadData();
  }

  return (
    <div className="rounded border bg-white p-5">
      <h1 className="text-lg font-semibold">Нөөцийн тохируулга</h1>
      {error ? <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 space-y-2 text-sm">
        {rows.map((x) => (
          <div key={x.id} className="rounded border p-3">
            <p className="font-medium">
              {x.adjustmentNo} - {x.status}
            </p>
            <p className="text-xs text-neutral-600">
              {x.warehouse.branch.nameMn} / {x.warehouse.nameMn} {x.stockCount ? `| Тооллого: ${x.stockCount.countNo}` : ""}
            </p>
            <p className="mt-1 text-xs">Мөр: {x.items.map((i) => `${i.product.nameMn} (зөрүү:${i.varianceQty})`).join(", ")}</p>
            {x.status === "PENDING_APPROVAL" ? (
              <button onClick={() => void approve(x.id)} disabled={!canApprove} className="mt-2 rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                Батлах
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

