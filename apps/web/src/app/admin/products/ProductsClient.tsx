"use client";

import { useEffect, useState } from "react";

type Product = {
  id: string;
  sku: string;
  barcode?: string | null;
  nameMn: string;
  type: "RAW_MATERIAL" | "FINISHED_PRODUCT";
  isActive: boolean;
};

export default function ProductsClient({ canWrite }: { canWrite: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    sku: "",
    barcode: "",
    nameMn: "",
    type: "RAW_MATERIAL" as "RAW_MATERIAL" | "FINISHED_PRODUCT",
  });

  async function loadData() {
    const res = await fetch("/api/admin/products");
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Бүтээгдэхүүний мэдээлэл ачаалж чадсангүй.");
      return;
    }
    setProducts(data.products ?? []);
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createProduct() {
    setError("");
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Бүтээгдэхүүн үүсгэхэд алдаа гарлаа.");
      return;
    }
    setForm({ sku: "", barcode: "", nameMn: "", type: "RAW_MATERIAL" });
    await loadData();
  }

  async function updateProduct(productId: string, payload: Partial<Product>) {
    const res = await fetch("/api/admin/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Бүтээгдэхүүн шинэчлэхэд алдаа гарлаа.");
      return;
    }
    await loadData();
  }

  async function deactivateProduct(productId: string) {
    const res = await fetch("/api/admin/products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Бүтээгдэхүүн идэвхгүй болгоход алдаа гарлаа.");
      return;
    }
    await loadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Бүтээгдэхүүн (мастер дата)</h1>
        {error ? <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <input className="rounded border px-3 py-2 text-sm" placeholder="SKU" value={form.sku} onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Barcode" value={form.barcode} onChange={(e) => setForm((s) => ({ ...s, barcode: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Нэр (Монгол)" value={form.nameMn} onChange={(e) => setForm((s) => ({ ...s, nameMn: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm((s) => ({ ...s, type: e.target.value as "RAW_MATERIAL" | "FINISHED_PRODUCT" }))}>
            <option value="RAW_MATERIAL">Түүхий эд</option>
            <option value="FINISHED_PRODUCT">Бэлэн бүтээгдэхүүн</option>
          </select>
          <button onClick={() => void createProduct()} disabled={!canWrite} className="rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
            Бүтээгдэхүүн нэмэх
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded border bg-white p-5">
        {products.map((p) => (
          <ProductRow key={p.id} product={p} canWrite={canWrite} onUpdate={(payload) => void updateProduct(p.id, payload)} onDeactivate={() => void deactivateProduct(p.id)} />
        ))}
      </section>
    </div>
  );
}

function ProductRow({
  product,
  canWrite,
  onUpdate,
  onDeactivate,
}: {
  product: Product;
  canWrite: boolean;
  onUpdate: (payload: Partial<Product>) => void;
  onDeactivate: () => void;
}) {
  const [sku, setSku] = useState(product.sku);
  const [barcode, setBarcode] = useState(product.barcode ?? "");
  const [nameMn, setNameMn] = useState(product.nameMn);
  const [type, setType] = useState(product.type);
  const [isActive, setIsActive] = useState(product.isActive);

  useEffect(() => {
    setSku(product.sku);
    setBarcode(product.barcode ?? "");
    setNameMn(product.nameMn);
    setType(product.type);
    setIsActive(product.isActive);
  }, [product]);

  return (
    <div className="rounded border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="rounded border px-2 py-1 text-sm" value={sku} onChange={(e) => setSku(e.target.value)} />
        <input className="rounded border px-2 py-1 text-sm" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barcode" />
        <input className="rounded border px-2 py-1 text-sm" value={nameMn} onChange={(e) => setNameMn(e.target.value)} />
        <select className="rounded border px-2 py-1 text-sm" value={type} onChange={(e) => setType(e.target.value as "RAW_MATERIAL" | "FINISHED_PRODUCT")}>
          <option value="RAW_MATERIAL">Түүхий эд</option>
          <option value="FINISHED_PRODUCT">Бэлэн бүтээгдэхүүн</option>
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Идэвхтэй
        </label>
        <button onClick={() => onUpdate({ sku, barcode, nameMn, type, isActive })} disabled={!canWrite} className="rounded border px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50">
          Шинэчлэх
        </button>
        <button onClick={onDeactivate} disabled={!canWrite} className="rounded border border-red-300 px-2 py-1 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-50">
          Идэвхгүй болгох
        </button>
      </div>
    </div>
  );
}

