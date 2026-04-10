"use client";

import { useEffect, useState } from "react";

type Warehouse = { id: string; nameMn: string; code: string; branch: { nameMn: string } };
type Product = { id: string; nameMn: string; sku: string };
type Count = {
  id: string;
  countNo: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED";
  warehouse: Warehouse;
  items: { id: string; productId: string; countedQty: string; systemQty: string; varianceQty: string; product: Product }[];
  createdAt: string;
};

export default function StockCountsClient({
  canCreate,
  canSubmit,
  canApprove,
}: {
  canCreate: boolean;
  canSubmit: boolean;
  canApprove: boolean;
}) {
  const [counts, setCounts] = useState<Count[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([{ productId: "", countedQty: "0" }]);

  async function parseResponse(res: Response): Promise<{ message?: string }> {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as { message?: string };
    }
    const text = await res.text();
    return { message: text || "Серверээс хоосон хариу ирлээ." };
  }

  async function loadData() {
    const res = await fetch("/api/admin/stock-counts");
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(data.message ?? "Тооллогын мэдээлэл ачаалж чадсангүй.");
      return;
    }
    const payload = data as unknown as { counts?: Count[]; warehouses?: Warehouse[]; products?: Product[] };
    setCounts(payload.counts ?? []);
    setWarehouses(payload.warehouses ?? []);
    setProducts(payload.products ?? []);
    if (!warehouseId && data.warehouses?.length > 0) {
      setWarehouseId(data.warehouses[0].id);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createCount() {
    setError("");
    const items = lines
      .map((l) => ({ productId: l.productId, countedQty: Number(l.countedQty) }))
      .filter((l) => l.productId && l.countedQty >= 0);
    if (!warehouseId) {
      setError("Склад сонгоно уу.");
      return;
    }
    if (items.length === 0) {
      setError("Дор хаяж нэг мөр оруулна уу.");
      return;
    }

    const res = await fetch("/api/admin/stock-counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseId, note, items }),
    });
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(data.message ?? "Тооллого үүсгэхэд алдаа гарлаа.");
      return;
    }
    setNote("");
    setLines([{ productId: "", countedQty: "0" }]);
    await loadData();
  }

  async function runAction(countId: string, action: "submit" | "approve") {
    const res = await fetch("/api/admin/stock-counts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countId, action }),
    });
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(data.message ?? "Үйлдэл амжилтгүй.");
      return;
    }
    await loadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Нөөцийн тооллого</h1>
        {error ? <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 space-y-2">
          <select className="w-full rounded border px-3 py-2 text-sm" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nameMn} ({w.code}) - {w.branch.nameMn}
              </option>
            ))}
          </select>
          <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Тэмдэглэл" value={note} onChange={(e) => setNote(e.target.value)} />
          {lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-2">
              <select className="rounded border px-3 py-2 text-sm" value={line.productId} onChange={(e) => setLines((s) => s.map((x, i) => (i === idx ? { ...x, productId: e.target.value } : x)))}>
                <option value="">Бүтээгдэхүүн сонгох</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameMn} ({p.sku})
                  </option>
                ))}
              </select>
              <input className="rounded border px-3 py-2 text-sm" type="number" min="0" step="0.001" value={line.countedQty} onChange={(e) => setLines((s) => s.map((x, i) => (i === idx ? { ...x, countedQty: e.target.value } : x)))} />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setLines((s) => [...s, { productId: "", countedQty: "0" }])} className="rounded border px-3 py-2 text-sm">
              Мөр нэмэх
            </button>
            <button onClick={() => void createCount()} disabled={!canCreate} className="rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
              Тооллого үүсгэх
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded border bg-white p-5">
        <h2 className="font-medium">Сүүлийн тооллогууд</h2>
        {counts.map((c) => (
          <div key={c.id} className="rounded border p-3 text-sm">
            <p className="font-medium">
              {c.countNo} - {c.status}
            </p>
            <p className="text-xs text-neutral-600">
              {c.warehouse.branch.nameMn} / {c.warehouse.nameMn}
            </p>
            <p className="text-xs text-neutral-500">{new Date(c.createdAt).toLocaleString()}</p>
            <p className="mt-1 text-xs">
              Мөр:{" "}
              {c.items.map((i) => `${i.product.nameMn} (тоолсон:${i.countedQty}, систем:${i.systemQty}, зөрүү:${i.varianceQty})`).join(", ")}
            </p>
            <div className="mt-2 flex gap-2">
              {c.status === "DRAFT" ? (
                <button onClick={() => void runAction(c.id, "submit")} disabled={!canSubmit} className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                  Илгээх
                </button>
              ) : null}
              {c.status === "SUBMITTED" ? (
                <button onClick={() => void runAction(c.id, "approve")} disabled={!canApprove} className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                  Батлах
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

