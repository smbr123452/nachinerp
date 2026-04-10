"use client";

import { useEffect, useState } from "react";

type Branch = { id: string; code: string; nameMn: string };
type Warehouse = {
  id: string;
  branchId: string;
  code: string;
  nameMn: string;
  isActive: boolean;
  branch: Branch;
};

export default function WarehousesClient({ canWrite }: { canWrite: boolean }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ branchId: "", code: "", nameMn: "" });

  async function loadData() {
    const res = await fetch("/api/admin/warehouses");
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Складын мэдээлэл ачаалж чадсангүй.");
      return;
    }
    setWarehouses(data.warehouses ?? []);
    setBranches(data.branches ?? []);
    if (!form.branchId && data.branches?.length > 0) {
      setForm((s) => ({ ...s, branchId: data.branches[0].id }));
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createWarehouse() {
    setError("");
    const res = await fetch("/api/admin/warehouses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Склад үүсгэхэд алдаа гарлаа.");
      return;
    }
    setForm((s) => ({ ...s, code: "", nameMn: "" }));
    await loadData();
  }

  async function updateWarehouse(warehouseId: string, payload: Partial<Warehouse>) {
    const res = await fetch("/api/admin/warehouses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseId, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Склад шинэчлэхэд алдаа гарлаа.");
      return;
    }
    await loadData();
  }

  async function deactivateWarehouse(warehouseId: string) {
    const res = await fetch("/api/admin/warehouses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Склад идэвхгүй болгоход алдаа гарлаа.");
      return;
    }
    await loadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Складууд</h1>
        {error ? <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <select className="rounded border px-3 py-2 text-sm" value={form.branchId} onChange={(e) => setForm((s) => ({ ...s, branchId: e.target.value }))}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameMn} ({b.code})
              </option>
            ))}
          </select>
          <input className="rounded border px-3 py-2 text-sm" placeholder="Код" value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Нэр (Монгол)" value={form.nameMn} onChange={(e) => setForm((s) => ({ ...s, nameMn: e.target.value }))} />
          <button onClick={() => void createWarehouse()} disabled={!canWrite} className="rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
            Склад нэмэх
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded border bg-white p-5">
        {warehouses.map((w) => (
          <WarehouseRow
            key={w.id}
            warehouse={w}
            branches={branches}
            canWrite={canWrite}
            onUpdate={(payload) => void updateWarehouse(w.id, payload)}
            onDeactivate={() => void deactivateWarehouse(w.id)}
          />
        ))}
      </section>
    </div>
  );
}

function WarehouseRow({
  warehouse,
  branches,
  canWrite,
  onUpdate,
  onDeactivate,
}: {
  warehouse: Warehouse;
  branches: Branch[];
  canWrite: boolean;
  onUpdate: (payload: Partial<Warehouse>) => void;
  onDeactivate: () => void;
}) {
  const [branchId, setBranchId] = useState(warehouse.branchId);
  const [code, setCode] = useState(warehouse.code);
  const [nameMn, setNameMn] = useState(warehouse.nameMn);
  const [isActive, setIsActive] = useState(warehouse.isActive);

  useEffect(() => {
    setBranchId(warehouse.branchId);
    setCode(warehouse.code);
    setNameMn(warehouse.nameMn);
    setIsActive(warehouse.isActive);
  }, [warehouse]);

  return (
    <div className="rounded border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded border px-2 py-1 text-sm" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nameMn}
            </option>
          ))}
        </select>
        <input className="rounded border px-2 py-1 text-sm" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="rounded border px-2 py-1 text-sm" value={nameMn} onChange={(e) => setNameMn(e.target.value)} />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Идэвхтэй
        </label>
        <button onClick={() => onUpdate({ branchId, code, nameMn, isActive })} disabled={!canWrite} className="rounded border px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50">
          Шинэчлэх
        </button>
        <button onClick={onDeactivate} disabled={!canWrite} className="rounded border border-red-300 px-2 py-1 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-50">
          Идэвхгүй болгох
        </button>
      </div>
    </div>
  );
}

