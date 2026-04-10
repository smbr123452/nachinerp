"use client";

import { useEffect, useState } from "react";

type Warehouse = { id: string; nameMn: string; code: string; branch: { nameMn: string } };
type Product = { id: string; nameMn: string; sku: string };
type Transfer = {
  id: string;
  transferNo: string;
  status: "DRAFT" | "APPROVED" | "RECEIVED";
  fromWarehouse: Warehouse;
  toWarehouse: Warehouse;
  items: { id: string; qty: string; product: Product }[];
  requestedAt: string;
};

export default function StockTransfersClient({
  canCreate,
  canApprove,
  canReceive,
}: {
  canCreate: boolean;
  canApprove: boolean;
  canReceive: boolean;
}) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([{ productId: "", qty: "0" }]);

  async function loadData() {
    const res = await fetch("/api/admin/stock-transfers");
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Шилжүүлгийн мэдээлэл ачаалж чадсангүй.");
      return;
    }
    setTransfers(data.transfers ?? []);
    setWarehouses(data.warehouses ?? []);
    setProducts(data.products ?? []);
    if (!fromWarehouseId && data.warehouses?.length > 0) {
      setFromWarehouseId(data.warehouses[0].id);
    }
    if (!toWarehouseId && data.warehouses?.length > 1) {
      setToWarehouseId(data.warehouses[1].id);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createTransfer() {
    setError("");
    if (!fromWarehouseId || !toWarehouseId) {
      setError("Эхлэл болон очих склад сонгоно уу.");
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      setError("Эхлэл ба очих склад адил байж болохгүй.");
      return;
    }
    const items = lines
      .map((l) => ({ productId: l.productId, qty: Number(l.qty) }))
      .filter((l) => l.productId && l.qty > 0);
    if (items.length === 0) {
      setError("Дор хаяж нэг зөв мөр оруулна уу.");
      return;
    }
    const res = await fetch("/api/admin/stock-transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromWarehouseId, toWarehouseId, note, items }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Шилжүүлэг үүсгэхэд алдаа гарлаа.");
      return;
    }
    setNote("");
    setLines([{ productId: "", qty: "0" }]);
    await loadData();
  }

  async function runAction(transferId: string, action: "approve" | "receive") {
    setError("");
    const res = await fetch("/api/admin/stock-transfers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transferId, action }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Шилжүүлгийн үйлдэл амжилтгүй.");
      return;
    }
    await loadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Склад хооронд шилжүүлэг</h1>
        {error ? <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select className="rounded border px-3 py-2 text-sm" value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  Эхлэл: {w.nameMn} ({w.branch.nameMn})
                </option>
              ))}
            </select>
            <select className="rounded border px-3 py-2 text-sm" value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  Очих: {w.nameMn} ({w.branch.nameMn})
                </option>
              ))}
            </select>
          </div>
          {warehouses.length < 2 ? (
            <p className="text-xs text-amber-700">
              Шилжүүлэг хийхийн тулд дор хаяж 2 склад шаардлагатай.
            </p>
          ) : null}
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
              <input className="rounded border px-3 py-2 text-sm" type="number" min="0" step="0.001" value={line.qty} onChange={(e) => setLines((s) => s.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setLines((s) => [...s, { productId: "", qty: "0" }])} className="rounded border px-3 py-2 text-sm">
              Мөр нэмэх
            </button>
            <button onClick={() => void createTransfer()} disabled={!canCreate} className="rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
              Шилжүүлэг үүсгэх
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded border bg-white p-5">
        <h2 className="font-medium">Сүүлийн шилжүүлгүүд</h2>
        {transfers.map((t) => (
          <div key={t.id} className="rounded border p-3 text-sm">
            <p className="font-medium">
              {t.transferNo} - {t.status}
            </p>
            <p className="text-xs text-neutral-600">
              {t.fromWarehouse.nameMn} ({t.fromWarehouse.branch.nameMn}) → {t.toWarehouse.nameMn} ({t.toWarehouse.branch.nameMn})
            </p>
            <p className="text-xs text-neutral-500">{new Date(t.requestedAt).toLocaleString()}</p>
            <p className="mt-1 text-xs">Мөр: {t.items.map((i) => `${i.product.nameMn} (${i.qty})`).join(", ")}</p>
            <div className="mt-2 flex gap-2">
              {t.status === "DRAFT" ? (
                <button onClick={() => void runAction(t.id, "approve")} disabled={!canApprove} className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                  Батлах
                </button>
              ) : null}
              {t.status === "APPROVED" ? (
                <button onClick={() => void runAction(t.id, "receive")} disabled={!canReceive} className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                  Хүлээн авах
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

