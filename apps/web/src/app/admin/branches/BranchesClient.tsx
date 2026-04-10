"use client";

import { useEffect, useState } from "react";

type Branch = {
  id: string;
  code: string;
  nameMn: string;
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
};

export default function BranchesClient({ canWrite }: { canWrite: boolean }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ code: "", nameMn: "", address: "", phone: "" });

  async function loadData() {
    const res = await fetch("/api/admin/branches");
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Салбарын мэдээлэл ачаалж чадсангүй.");
      return;
    }
    setBranches(data.branches ?? []);
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createBranch() {
    setError("");
    const res = await fetch("/api/admin/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Салбар үүсгэхэд алдаа гарлаа.");
      return;
    }
    setForm({ code: "", nameMn: "", address: "", phone: "" });
    await loadData();
  }

  async function updateBranch(branchId: string, payload: Partial<Branch>) {
    const res = await fetch("/api/admin/branches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Салбар шинэчлэхэд алдаа гарлаа.");
      return;
    }
    await loadData();
  }

  async function deactivateBranch(branchId: string) {
    const res = await fetch("/api/admin/branches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Салбар идэвхгүй болгоход алдаа гарлаа.");
      return;
    }
    await loadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Салбарууд</h1>
        {error ? <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <input className="rounded border px-3 py-2 text-sm" placeholder="Код" value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Нэр (Монгол)" value={form.nameMn} onChange={(e) => setForm((s) => ({ ...s, nameMn: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Хаяг" value={form.address} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Утас" value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
          <button onClick={() => void createBranch()} disabled={!canWrite} className="rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
            Салбар нэмэх
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded border bg-white p-5">
        {branches.map((b) => (
          <BranchRow key={b.id} branch={b} canWrite={canWrite} onUpdate={(payload) => void updateBranch(b.id, payload)} onDeactivate={() => void deactivateBranch(b.id)} />
        ))}
      </section>
    </div>
  );
}

function BranchRow({
  branch,
  canWrite,
  onUpdate,
  onDeactivate,
}: {
  branch: Branch;
  canWrite: boolean;
  onUpdate: (payload: Partial<Branch>) => void;
  onDeactivate: () => void;
}) {
  const [nameMn, setNameMn] = useState(branch.nameMn);
  const [address, setAddress] = useState(branch.address ?? "");
  const [phone, setPhone] = useState(branch.phone ?? "");
  const [isActive, setIsActive] = useState(branch.isActive);

  useEffect(() => {
    setNameMn(branch.nameMn);
    setAddress(branch.address ?? "");
    setPhone(branch.phone ?? "");
    setIsActive(branch.isActive);
  }, [branch]);

  return (
    <div className="rounded border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-28 text-sm font-medium">{branch.code}</span>
        <input className="rounded border px-2 py-1 text-sm" value={nameMn} onChange={(e) => setNameMn(e.target.value)} />
        <input className="rounded border px-2 py-1 text-sm" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Хаяг" />
        <input className="rounded border px-2 py-1 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Утас" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Идэвхтэй
        </label>
        <button onClick={() => onUpdate({ nameMn, address, phone, isActive })} disabled={!canWrite} className="rounded border px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50">
          Шинэчлэх
        </button>
        <button onClick={onDeactivate} disabled={!canWrite} className="rounded border border-red-300 px-2 py-1 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-50">
          Идэвхгүй болгох
        </button>
      </div>
    </div>
  );
}

