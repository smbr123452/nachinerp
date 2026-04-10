"use client";

import { useEffect, useState } from "react";

type Warehouse = { id: string; nameMn: string; code: string; branch: { nameMn: string } };
type Product = { id: string; nameMn: string; sku: string };
type Receiving = {
  id: string;
  receiveNo: string;
  warehouse: { nameMn: string; code: string };
  items: { id: string; qty: string; product: { nameMn: string; sku: string } }[];
  receivedAt: string;
};

export default function InventoryReceivingClient({ canCreate }: { canCreate: boolean }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [receivings, setReceivings] = useState<Receiving[]>([]);
  const [error, setError] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([{ productId: "", qty: "0" }]);

  async function loadData() {
    const res = await fetch("/api/admin/inventory-receiving");
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Орлогын мэдээлэл ачаалж чадсангүй.");
      return;
    }
    setReceivings(data.receivings ?? []);
    setWarehouses(data.warehouses ?? []);
    setProducts(data.products ?? []);
    if (!warehouseId && data.warehouses?.length > 0) setWarehouseId(data.warehouses[0].id);
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function submitReceiving() {
    setError("");
    const items = lines
      .map((l) => ({ productId: l.productId, qty: Number(l.qty) }))
      .filter((l) => l.productId && l.qty > 0);
    const res = await fetch("/api/admin/inventory-receiving", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseId, note, items }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Орлого бүртгэхэд алдаа гарлаа.");
      return;
    }
    setNote("");
    setLines([{ productId: "", qty: "0" }]);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Орлого бүртгэл</h1>
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
              <select
                className="rounded border px-3 py-2 text-sm"
                value={line.productId}
                onChange={(e) => setLines((s) => s.map((x, i) => (i === idx ? { ...x, productId: e.target.value } : x)))}
              >
                <option value="">Бүтээгдэхүүн сонгох</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameMn} ({p.sku})
                  </option>
                ))}
              </select>
              <input
                className="rounded border px-3 py-2 text-sm"
                type="number"
                min="0"
                step="0.001"
                value={line.qty}
                onChange={(e) => setLines((s) => s.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setLines((s) => [...s, { productId: "", qty: "0" }])} className="rounded border px-3 py-2 text-sm">
              Мөр нэмэх
            </button>
            <button onClick={() => void submitReceiving()} disabled={!canCreate} className="rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
              Орлого бүртгэх
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded border bg-white p-5">
        <h2 className="font-medium">Сүүлийн орлогууд</h2>
        {receivings.map((r) => (
          <div key={r.id} className="rounded border p-3 text-sm">
            <p className="font-medium">
              {r.receiveNo} - {r.warehouse.nameMn}
            </p>
            <p className="text-xs text-neutral-600">{new Date(r.receivedAt).toLocaleString()}</p>
            <p className="mt-1 text-xs">Мөр: {r.items.map((i) => `${i.product.nameMn} (${i.qty})`).join(", ")}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

