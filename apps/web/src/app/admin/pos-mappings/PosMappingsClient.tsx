"use client";

import { useEffect, useState } from "react";

type Branch = { id: string; nameMn: string; code: string };
type Warehouse = { id: string; nameMn: string; code: string; branch: Branch };
type Product = { id: string; nameMn: string; sku: string };
type BranchMapping = { id: string; posBranchName: string; branchId: string; warehouseId: string; isActive: boolean; branch: Branch; warehouse: Warehouse };
type CodeMapping = { id: string; productCode: string; productId: string; isActive: boolean; product: Product };
type NameMapping = { id: string; productName: string; productId: string; isActive: boolean; product: Product };

export default function PosMappingsClient({ canWrite }: { canWrite: boolean }) {
  const [error, setError] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branchMappings, setBranchMappings] = useState<BranchMapping[]>([]);
  const [codeMappings, setCodeMappings] = useState<CodeMapping[]>([]);
  const [nameMappings, setNameMappings] = useState<NameMapping[]>([]);
  const [unmapped, setUnmapped] = useState<{ totalRows?: number; unmappedBranches?: string[]; unmappedProductCodes?: string[]; unmappedProductNames?: string[] } | null>(null);

  const [branchForm, setBranchForm] = useState({ posBranchName: "", branchId: "", warehouseId: "" });
  const [codeForm, setCodeForm] = useState({ productCode: "", productId: "" });
  const [nameForm, setNameForm] = useState({ productName: "", productId: "" });
  const [file, setFile] = useState<File | null>(null);

  async function parseResponse(res: Response): Promise<Record<string, unknown>> {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) return (await res.json()) as Record<string, unknown>;
    return { message: (await res.text()) || "Серверийн хариу буруу байна." };
  }

  async function loadData() {
    setError("");
    const [bRes, pRes] = await Promise.all([fetch("/api/admin/pos-mappings/branches"), fetch("/api/admin/pos-mappings/products")]);
    const bData = await parseResponse(bRes);
    const pData = await parseResponse(pRes);
    if (!bRes.ok) return setError(String(bData.message ?? "Branch mapping ачаалж чадсангүй."));
    if (!pRes.ok) return setError(String(pData.message ?? "Product mapping ачаалж чадсангүй."));

    setBranchMappings((bData.mappings as BranchMapping[]) ?? []);
    setBranches((bData.branches as Branch[]) ?? []);
    setWarehouses((bData.warehouses as Warehouse[]) ?? []);
    setCodeMappings((pData.codeMappings as CodeMapping[]) ?? []);
    setNameMappings((pData.nameMappings as NameMapping[]) ?? []);
    setProducts((pData.products as Product[]) ?? []);

    if (!branchForm.branchId && (bData.branches as Branch[])?.length) setBranchForm((s) => ({ ...s, branchId: (bData.branches as Branch[])[0].id }));
    if (!branchForm.warehouseId && (bData.warehouses as Warehouse[])?.length) setBranchForm((s) => ({ ...s, warehouseId: (bData.warehouses as Warehouse[])[0].id }));
    if (!codeForm.productId && (pData.products as Product[])?.length) setCodeForm((s) => ({ ...s, productId: (pData.products as Product[])[0].id }));
    if (!nameForm.productId && (pData.products as Product[])?.length) setNameForm((s) => ({ ...s, productId: (pData.products as Product[])[0].id }));
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createBranchMapping() {
    const res = await fetch("/api/admin/pos-mappings/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(branchForm),
    });
    const data = await parseResponse(res);
    if (!res.ok) return setError(String(data.message ?? "Branch mapping үүсгэхэд алдаа."));
    setBranchForm((s) => ({ ...s, posBranchName: "" }));
    await loadData();
  }

  async function deleteBranchMapping(mappingId: string) {
    const res = await fetch("/api/admin/pos-mappings/branches", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mappingId }) });
    const data = await parseResponse(res);
    if (!res.ok) return setError(String(data.message ?? "Branch mapping устгахад алдаа."));
    await loadData();
  }

  async function createCodeMapping() {
    const res = await fetch("/api/admin/pos-mappings/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappingType: "CODE", ...codeForm }),
    });
    const data = await parseResponse(res);
    if (!res.ok) return setError(String(data.message ?? "Code mapping үүсгэхэд алдаа."));
    setCodeForm((s) => ({ ...s, productCode: "" }));
    await loadData();
  }

  async function createNameMapping() {
    const res = await fetch("/api/admin/pos-mappings/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappingType: "NAME", ...nameForm }),
    });
    const data = await parseResponse(res);
    if (!res.ok) return setError(String(data.message ?? "Name mapping үүсгэхэд алдаа."));
    setNameForm((s) => ({ ...s, productName: "" }));
    await loadData();
  }

  async function deleteProductMapping(mappingType: "CODE" | "NAME", mappingId: string) {
    const res = await fetch("/api/admin/pos-mappings/products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappingType, mappingId }),
    });
    const data = await parseResponse(res);
    if (!res.ok) return setError(String(data.message ?? "Product mapping устгахад алдаа."));
    await loadData();
  }

  async function loadUnmappedPreview() {
    if (!file) return setError("Excel файл сонгоно уу.");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/pos-mappings/unmapped-preview", { method: "POST", body: fd });
    const data = await parseResponse(res);
    if (!res.ok) return setError(String(data.message ?? "Unmapped preview алдаа."));
    setUnmapped(data as typeof unmapped);
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">POS Mapping удирдлага</h1>
        {error ? <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="rounded border bg-white p-5 space-y-3">
        <h2 className="font-medium">Unmapped preview</h2>
        <div className="flex items-center gap-2">
          <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button onClick={() => void loadUnmappedPreview()} className="rounded border px-3 py-2 text-sm">Unmapped шалгах</button>
        </div>
        {unmapped ? <pre className="rounded bg-neutral-100 p-3 text-xs">{JSON.stringify(unmapped, null, 2)}</pre> : null}
      </section>

      <section className="rounded border bg-white p-5 space-y-3">
        <h2 className="font-medium">1) POS branch mapping</h2>
        <div className="grid grid-cols-3 gap-2">
          <input className="rounded border px-3 py-2 text-sm" placeholder="POS branch name (Пос)" value={branchForm.posBranchName} onChange={(e) => setBranchForm((s) => ({ ...s, posBranchName: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={branchForm.branchId} onChange={(e) => setBranchForm((s) => ({ ...s, branchId: e.target.value }))}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.nameMn}</option>)}
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={branchForm.warehouseId} onChange={(e) => setBranchForm((s) => ({ ...s, warehouseId: e.target.value }))}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.nameMn} ({w.branch.nameMn})</option>)}
          </select>
        </div>
        <button onClick={() => void createBranchMapping()} disabled={!canWrite} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">Branch mapping нэмэх</button>
        <div className="space-y-2">
          {branchMappings.map((m) => (
            <div key={m.id} className="rounded border p-2 text-sm flex items-center justify-between">
              <span>{m.posBranchName} -> {m.branch.nameMn} / {m.warehouse.nameMn}</span>
              <button onClick={() => void deleteBranchMapping(m.id)} disabled={!canWrite} className="rounded border px-2 py-1 text-xs disabled:opacity-50">Устгах</button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border bg-white p-5 space-y-3">
        <h2 className="font-medium">2) POS product code mapping</h2>
        <div className="grid grid-cols-2 gap-2">
          <input className="rounded border px-3 py-2 text-sm" placeholder="productCode (Бараа код)" value={codeForm.productCode} onChange={(e) => setCodeForm((s) => ({ ...s, productCode: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={codeForm.productId} onChange={(e) => setCodeForm((s) => ({ ...s, productId: e.target.value }))}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.nameMn} ({p.sku})</option>)}
          </select>
        </div>
        <button onClick={() => void createCodeMapping()} disabled={!canWrite} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">Code mapping нэмэх</button>
        <div className="space-y-2">
          {codeMappings.map((m) => (
            <div key={m.id} className="rounded border p-2 text-sm flex items-center justify-between">
              <span>{m.productCode} -> {m.product.nameMn}</span>
              <button onClick={() => void deleteProductMapping("CODE", m.id)} disabled={!canWrite} className="rounded border px-2 py-1 text-xs disabled:opacity-50">Устгах</button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border bg-white p-5 space-y-3">
        <h2 className="font-medium">3) POS product name fallback mapping</h2>
        <div className="grid grid-cols-2 gap-2">
          <input className="rounded border px-3 py-2 text-sm" placeholder="productName (Бараа нэр)" value={nameForm.productName} onChange={(e) => setNameForm((s) => ({ ...s, productName: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={nameForm.productId} onChange={(e) => setNameForm((s) => ({ ...s, productId: e.target.value }))}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.nameMn} ({p.sku})</option>)}
          </select>
        </div>
        <button onClick={() => void createNameMapping()} disabled={!canWrite} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">Name mapping нэмэх</button>
        <div className="space-y-2">
          {nameMappings.map((m) => (
            <div key={m.id} className="rounded border p-2 text-sm flex items-center justify-between">
              <span>{m.productName} -> {m.product.nameMn}</span>
              <button onClick={() => void deleteProductMapping("NAME", m.id)} disabled={!canWrite} className="rounded border px-2 py-1 text-xs disabled:opacity-50">Устгах</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

