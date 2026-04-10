"use client";

import { useEffect, useState } from "react";

type Branch = { id: string; nameMn: string; code: string };
type Warehouse = { id: string; nameMn: string; code: string; branch: Branch };
type Route = {
  id: string;
  code: string;
  nameMn: string;
  isActive: boolean;
  sourceWarehouse: Warehouse;
  stops: { id: string; stopOrder: number; branch: Branch }[];
};

export default function RoutesClient({ canManage }: { canManage: boolean }) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ code: "", nameMn: "", sourceWarehouseId: "" });
  const [stops, setStops] = useState([{ branchId: "", stopOrder: 1 }]);

  async function loadData() {
    const res = await fetch("/api/admin/routes");
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Маршрутын мэдээлэл ачаалж чадсангүй.");
      return;
    }
    setRoutes(data.routes ?? []);
    setBranches(data.branches ?? []);
    setWarehouses(data.warehouses ?? []);
    if (!form.sourceWarehouseId && data.warehouses?.length > 0) setForm((s) => ({ ...s, sourceWarehouseId: data.warehouses[0].id }));
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createRoute() {
    const cleanStops = stops.filter((s) => s.branchId).map((s, idx) => ({ branchId: s.branchId, stopOrder: idx + 1 }));
    const res = await fetch("/api/admin/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, stops: cleanStops }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Маршрут үүсгэхэд алдаа гарлаа.");
      return;
    }
    setForm((s) => ({ ...s, code: "", nameMn: "" }));
    setStops([{ branchId: "", stopOrder: 1 }]);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Түгээлтийн маршрут</h1>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <input className="rounded border px-3 py-2 text-sm" placeholder="Маршрут код" value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Маршрут нэр" value={form.nameMn} onChange={(e) => setForm((s) => ({ ...s, nameMn: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={form.sourceWarehouseId} onChange={(e) => setForm((s) => ({ ...s, sourceWarehouseId: e.target.value }))}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nameMn} ({w.branch.nameMn})
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 space-y-2">
          {stops.map((s, idx) => (
            <select key={idx} className="w-full rounded border px-3 py-2 text-sm" value={s.branchId} onChange={(e) => setStops((prev) => prev.map((x, i) => (i === idx ? { ...x, branchId: e.target.value } : x)))}>
              <option value="">Зогсоол branch сонгох</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameMn} ({b.code})
                </option>
              ))}
            </select>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setStops((s) => [...s, { branchId: "", stopOrder: s.length + 1 }])} className="rounded border px-3 py-2 text-sm">
              Зогсоол нэмэх
            </button>
            <button onClick={() => void createRoute()} disabled={!canManage} className="rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
              Маршрут үүсгэх
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded border bg-white p-5">
        <h2 className="font-medium">Маршрутын жагсаалт</h2>
        {routes.map((r) => (
          <div key={r.id} className="rounded border p-3 text-sm">
            <p className="font-medium">
              {r.code} - {r.nameMn} {r.isActive ? "" : "(идэвхгүй)"}
            </p>
            <p className="text-xs text-neutral-600">Эх склад: {r.sourceWarehouse.nameMn}</p>
            <p className="text-xs">Зогсоол: {r.stops.map((s) => `${s.stopOrder}. ${s.branch.nameMn}`).join(" -> ")}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

