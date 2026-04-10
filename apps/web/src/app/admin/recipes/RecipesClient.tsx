"use client";

import { useEffect, useState } from "react";

type Product = { id: string; nameMn: string; sku: string; type: "RAW_MATERIAL" | "FINISHED_PRODUCT" };
type Recipe = {
  id: string;
  code: string;
  nameMn: string;
  isActive: boolean;
  finishedProduct: Product;
  items: { id: string; qtyPerUnit: string; materialProduct: Product }[];
};

export default function RecipesClient({ canWrite }: { canWrite: boolean }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ code: "", nameMn: "", finishedProductId: "" });
  const [lines, setLines] = useState([{ materialProductId: "", qtyPerUnit: "0" }]);

  async function parseResponse(res: Response): Promise<Record<string, unknown>> {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as Record<string, unknown>;
    }
    const text = await res.text();
    return { message: text || "Серверээс хоосон хариу ирлээ." };
  }

  async function loadData() {
    const res = await fetch("/api/admin/recipes");
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(String(data.message ?? "Жорын мэдээлэл ачаалж чадсангүй."));
      return;
    }
    setRecipes((data.recipes as Recipe[]) ?? []);
    setProducts((data.products as Product[]) ?? []);
    if (!form.finishedProductId) {
      const fp = ((data.products as Product[]) ?? []).find((p) => p.type === "FINISHED_PRODUCT");
      if (fp) setForm((s) => ({ ...s, finishedProductId: fp.id }));
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createRecipe() {
    const items = lines.map((x) => ({ materialProductId: x.materialProductId, qtyPerUnit: Number(x.qtyPerUnit) })).filter((x) => x.materialProductId && x.qtyPerUnit > 0);
    const res = await fetch("/api/admin/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, items }),
    });
    const data = await parseResponse(res);
    if (!res.ok) {
      setError(String(data.message ?? "Жор үүсгэхэд алдаа гарлаа."));
      return;
    }
    setForm({ code: "", nameMn: "", finishedProductId: form.finishedProductId });
    setLines([{ materialProductId: "", qtyPerUnit: "0" }]);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Жор (BOM)</h1>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <input className="rounded border px-3 py-2 text-sm" placeholder="Жор код" value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Жор нэр" value={form.nameMn} onChange={(e) => setForm((s) => ({ ...s, nameMn: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={form.finishedProductId} onChange={(e) => setForm((s) => ({ ...s, finishedProductId: e.target.value }))}>
            <option value="">Бэлэн бүтээгдэхүүн сонгох</option>
            {products.filter((p) => p.type === "FINISHED_PRODUCT").map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameMn} ({p.sku})
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 space-y-2">
          {lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-2">
              <select className="rounded border px-3 py-2 text-sm" value={line.materialProductId} onChange={(e) => setLines((s) => s.map((x, i) => (i === idx ? { ...x, materialProductId: e.target.value } : x)))}>
                <option value="">Түүхий эд сонгох</option>
                {products.filter((p) => p.type === "RAW_MATERIAL").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameMn} ({p.sku})
                  </option>
                ))}
              </select>
              <input className="rounded border px-3 py-2 text-sm" type="number" min="0" step="0.001" value={line.qtyPerUnit} onChange={(e) => setLines((s) => s.map((x, i) => (i === idx ? { ...x, qtyPerUnit: e.target.value } : x)))} />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setLines((s) => [...s, { materialProductId: "", qtyPerUnit: "0" }])} className="rounded border px-3 py-2 text-sm">
              Мөр нэмэх
            </button>
            <button onClick={() => void createRecipe()} disabled={!canWrite} className="rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
              Жор үүсгэх
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded border bg-white p-5">
        <h2 className="font-medium">Жорын жагсаалт</h2>
        {recipes.map((r) => (
          <div key={r.id} className="rounded border p-3 text-sm">
            <p className="font-medium">
              {r.code} - {r.nameMn} {r.isActive ? "" : "(идэвхгүй)"}
            </p>
            <p className="text-xs text-neutral-600">Гарц: {r.finishedProduct.nameMn}</p>
            <p className="text-xs">Орц: {r.items.map((i) => `${i.materialProduct.nameMn} (${i.qtyPerUnit})`).join(", ")}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

