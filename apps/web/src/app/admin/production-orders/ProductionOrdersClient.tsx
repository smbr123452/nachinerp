"use client";

import { useEffect, useState } from "react";

type Warehouse = { id: string; nameMn: string; code: string; branch: { nameMn: string } };
type Recipe = {
  id: string;
  code: string;
  nameMn: string;
  finishedProduct: { nameMn: string; sku: string };
  items: { id: string; qtyPerUnit: string; materialProduct: { nameMn: string; sku: string } }[];
};
type ProductionOrder = {
  id: string;
  orderNo: string;
  status: "DRAFT" | "APPROVED" | "EXECUTED";
  plannedQty: string;
  recipe: Recipe;
  sourceWarehouse: Warehouse;
  outputWarehouse: Warehouse;
  createdAt: string;
};

export default function ProductionOrdersClient({
  canCreate,
  canApprove,
  canExecute,
}: {
  canCreate: boolean;
  canApprove: boolean;
  canExecute: boolean;
}) {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    recipeId: "",
    sourceWarehouseId: "",
    outputWarehouseId: "",
    plannedQty: "0",
    note: "",
  });

  async function parseResponse(res: Response): Promise<Record<string, unknown>> {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as Record<string, unknown>;
    }
    const text = await res.text();
    return { message: text || "Серверээс хоосон хариу ирлээ." };
  }

  async function loadData() {
    const res = await fetch("/api/admin/production-orders");
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(String(data.message ?? "Үйлдвэрлэлийн мэдээлэл ачаалж чадсангүй."));
      return;
    }
    setOrders((data.orders as ProductionOrder[]) ?? []);
    setRecipes((data.recipes as Recipe[]) ?? []);
    setWarehouses((data.warehouses as Warehouse[]) ?? []);
    if (!form.recipeId && data.recipes?.length > 0) setForm((s) => ({ ...s, recipeId: data.recipes[0].id }));
    if (!form.sourceWarehouseId && data.warehouses?.length > 0) setForm((s) => ({ ...s, sourceWarehouseId: data.warehouses[0].id }));
    if (!form.outputWarehouseId && data.warehouses?.length > 1) setForm((s) => ({ ...s, outputWarehouseId: data.warehouses[1].id }));
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createOrder() {
    const res = await fetch("/api/admin/production-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, plannedQty: Number(form.plannedQty) }),
    });
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(String(data.message ?? "Захиалга үүсгэхэд алдаа гарлаа."));
      return;
    }
    await loadData();
  }

  async function runAction(orderId: string, action: "approve" | "execute") {
    const res = await fetch("/api/admin/production-orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, action }),
    });
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(String(data.message ?? "Үйлдэл амжилтгүй."));
      return;
    }
    await loadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Үйлдвэрлэлийн захиалга</h1>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select className="rounded border px-3 py-2 text-sm" value={form.recipeId} onChange={(e) => setForm((s) => ({ ...s, recipeId: e.target.value }))}>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nameMn} ({r.code})
              </option>
            ))}
          </select>
          <input className="rounded border px-3 py-2 text-sm" type="number" min="0" step="0.001" value={form.plannedQty} onChange={(e) => setForm((s) => ({ ...s, plannedQty: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={form.sourceWarehouseId} onChange={(e) => setForm((s) => ({ ...s, sourceWarehouseId: e.target.value }))}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                Орцын склад: {w.nameMn}
              </option>
            ))}
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={form.outputWarehouseId} onChange={(e) => setForm((s) => ({ ...s, outputWarehouseId: e.target.value }))}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                Гарцын склад: {w.nameMn}
              </option>
            ))}
          </select>
          <input className="col-span-2 rounded border px-3 py-2 text-sm" placeholder="Тэмдэглэл" value={form.note} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))} />
        </div>
        <button onClick={() => void createOrder()} disabled={!canCreate} className="mt-3 rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
          Захиалга үүсгэх
        </button>
      </section>

      <section className="space-y-2 rounded border bg-white p-5">
        <h2 className="font-medium">Сүүлийн захиалгууд</h2>
        {orders.map((o) => (
          <div key={o.id} className="rounded border p-3 text-sm">
            <p className="font-medium">
              {o.orderNo} - {o.status}
            </p>
            <p className="text-xs text-neutral-600">
              Жор: {o.recipe.nameMn}, Гарц: {o.recipe.finishedProduct.nameMn}, Төлөвлөсөн: {o.plannedQty}
            </p>
            <p className="text-xs text-neutral-600">
              Орц склад: {o.sourceWarehouse.nameMn}, Гарц склад: {o.outputWarehouse.nameMn}
            </p>
            <p className="text-xs">Орц: {o.recipe.items.map((i) => `${i.materialProduct.nameMn} (${i.qtyPerUnit})`).join(", ")}</p>
            <div className="mt-2 flex gap-2">
              {o.status === "DRAFT" ? (
                <button onClick={() => void runAction(o.id, "approve")} disabled={!canApprove} className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                  Батлах
                </button>
              ) : null}
              {o.status === "APPROVED" ? (
                <button onClick={() => void runAction(o.id, "execute")} disabled={!canExecute} className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                  Гүйцэтгэх
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

