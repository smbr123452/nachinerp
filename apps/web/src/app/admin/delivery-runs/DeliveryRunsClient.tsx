"use client";

import { useEffect, useState } from "react";

type Product = { id: string; nameMn: string; sku: string };
type Route = { id: string; code: string; nameMn: string };
type Run = {
  id: string;
  runNo: string;
  status: "DRAFT" | "LOADED" | "IN_PROGRESS" | "CLOSED";
  route: { nameMn: string; sourceWarehouse: { nameMn: string }; stops: { stopOrder: number; branch: { id: string; nameMn: string } }[] };
  items: { id: string; productId: string; product: Product; loadedQty: string; deliveredQty: string; returnedQty: string; lossQty: string }[];
};

export default function DeliveryRunsClient({
  canCreate,
  canLoad,
  canDeliver,
  canReturnLoss,
  canClose,
}: {
  canCreate: boolean;
  canLoad: boolean;
  canDeliver: boolean;
  canReturnLoss: boolean;
  canClose: boolean;
}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ routeId: "", runDate: "", note: "" });

  async function loadData() {
    const res = await fetch("/api/admin/delivery-runs");
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Run мэдээлэл ачаалж чадсангүй.");
      return;
    }
    setRuns(data.runs ?? []);
    setRoutes(data.routes ?? []);
    setProducts(data.products ?? []);
    if (!form.routeId && data.routes?.length > 0) setForm((s) => ({ ...s, routeId: data.routes[0].id }));
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createRun() {
    const res = await fetch("/api/admin/delivery-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Run үүсгэхэд алдаа гарлаа.");
      return;
    }
    await loadData();
  }

  async function patch(payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/delivery-runs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Үйлдэл амжилтгүй.");
      return;
    }
    await loadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Маршрутын хүргэлтийн run</h1>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <select className="rounded border px-3 py-2 text-sm" value={form.routeId} onChange={(e) => setForm((s) => ({ ...s, routeId: e.target.value }))}>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nameMn} ({r.code})
              </option>
            ))}
          </select>
          <input className="rounded border px-3 py-2 text-sm" type="date" value={form.runDate} onChange={(e) => setForm((s) => ({ ...s, runDate: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Тэмдэглэл" value={form.note} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))} />
        </div>
        <button onClick={() => void createRun()} disabled={!canCreate} className="mt-3 rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50">
          Run үүсгэх
        </button>
      </section>

      <section className="space-y-3 rounded border bg-white p-5">
        {runs.map((run) => (
          <RunCard key={run.id} run={run} products={products} canLoad={canLoad} canDeliver={canDeliver} canReturnLoss={canReturnLoss} canClose={canClose} onPatch={patch} />
        ))}
      </section>
    </div>
  );
}

function RunCard({
  run,
  products,
  canLoad,
  canDeliver,
  canReturnLoss,
  canClose,
  onPatch,
}: {
  run: Run;
  products: Product[];
  canLoad: boolean;
  canDeliver: boolean;
  canReturnLoss: boolean;
  canClose: boolean;
  onPatch: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [loadLines, setLoadLines] = useState([{ productId: "", qty: "0" }]);
  const [deliverBranchId, setDeliverBranchId] = useState(run.route.stops[0]?.branch.id ?? "");
  const [deliverLines, setDeliverLines] = useState([{ productId: "", qty: "0" }]);
  const [rlLines, setRlLines] = useState([{ productId: "", returnedQty: "0", lossQty: "0" }]);

  return (
    <div className="rounded border p-3 text-sm">
      <p className="font-medium">
        {run.runNo} - {run.status}
      </p>
      <p className="text-xs text-neutral-600">
        Маршрут: {run.route.nameMn} | Эх склад: {run.route.sourceWarehouse.nameMn}
      </p>
      <p className="text-xs">Үлдэгдэл хяналт: мөр бүрт load = delivered + returned + loss</p>

      {run.status === "DRAFT" ? (
        <div className="mt-2 space-y-2">
          {loadLines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-2">
              <select className="rounded border px-2 py-1" value={line.productId} onChange={(e) => setLoadLines((s) => s.map((x, i) => (i === idx ? { ...x, productId: e.target.value } : x)))}>
                <option value="">Бүтээгдэхүүн</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameMn}
                  </option>
                ))}
              </select>
              <input className="rounded border px-2 py-1" type="number" min="0" step="0.001" value={line.qty} onChange={(e) => setLoadLines((s) => s.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setLoadLines((s) => [...s, { productId: "", qty: "0" }])} className="rounded border px-2 py-1 text-xs">
              Ачаалалтын мөр нэмэх
            </button>
            <button
              onClick={() =>
                void onPatch({
                  runId: run.id,
                  action: "load",
                  items: loadLines.map((x) => ({ productId: x.productId, qty: Number(x.qty) })),
                })
              }
              disabled={!canLoad}
              className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ачаалах
            </button>
          </div>
        </div>
      ) : null}

      {run.status === "LOADED" || run.status === "IN_PROGRESS" ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium">Хүргэлт баталгаажуулах</p>
          <select className="w-full rounded border px-2 py-1" value={deliverBranchId} onChange={(e) => setDeliverBranchId(e.target.value)}>
            {run.route.stops.map((s) => (
              <option key={s.branch.id} value={s.branch.id}>
                {s.stopOrder}. {s.branch.nameMn}
              </option>
            ))}
          </select>
          {deliverLines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-2">
              <select className="rounded border px-2 py-1" value={line.productId} onChange={(e) => setDeliverLines((s) => s.map((x, i) => (i === idx ? { ...x, productId: e.target.value } : x)))}>
                <option value="">Бүтээгдэхүүн</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameMn}
                  </option>
                ))}
              </select>
              <input className="rounded border px-2 py-1" type="number" min="0" step="0.001" value={line.qty} onChange={(e) => setDeliverLines((s) => s.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setDeliverLines((s) => [...s, { productId: "", qty: "0" }])} className="rounded border px-2 py-1 text-xs">
              Хүргэлтийн мөр нэмэх
            </button>
            <button
              onClick={() =>
                void onPatch({
                  runId: run.id,
                  action: "deliver",
                  branchId: deliverBranchId,
                  items: deliverLines.map((x) => ({ productId: x.productId, qty: Number(x.qty) })),
                })
              }
              disabled={!canDeliver}
              className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Хүргэлт баталгаажуулах
            </button>
          </div>

          <p className="text-xs font-medium">Буцаалт / Хорогдол</p>
          {rlLines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-3 gap-2">
              <select className="rounded border px-2 py-1" value={line.productId} onChange={(e) => setRlLines((s) => s.map((x, i) => (i === idx ? { ...x, productId: e.target.value } : x)))}>
                <option value="">Бүтээгдэхүүн</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameMn}
                  </option>
                ))}
              </select>
              <input className="rounded border px-2 py-1" type="number" min="0" step="0.001" value={line.returnedQty} onChange={(e) => setRlLines((s) => s.map((x, i) => (i === idx ? { ...x, returnedQty: e.target.value } : x)))} placeholder="Буцаалт" />
              <input className="rounded border px-2 py-1" type="number" min="0" step="0.001" value={line.lossQty} onChange={(e) => setRlLines((s) => s.map((x, i) => (i === idx ? { ...x, lossQty: e.target.value } : x)))} placeholder="Хорогдол" />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setRlLines((s) => [...s, { productId: "", returnedQty: "0", lossQty: "0" }])} className="rounded border px-2 py-1 text-xs">
              Буцаалт/хорогдол мөр нэмэх
            </button>
            <button
              onClick={() =>
                void onPatch({
                  runId: run.id,
                  action: "return_loss",
                  items: rlLines.map((x) => ({ productId: x.productId, returnedQty: Number(x.returnedQty), lossQty: Number(x.lossQty) })),
                })
              }
              disabled={!canReturnLoss}
              className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Буцаалт/хорогдол хадгалах
            </button>
            <button onClick={() => void onPatch({ runId: run.id, action: "close" })} disabled={!canClose} className="rounded bg-black px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50">
              Run хаах
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-2 text-xs text-neutral-600">
        Мөрийн хяналт:{" "}
        {run.items.map((i) => `${i.product.nameMn} [L:${i.loadedQty} D:${i.deliveredQty} R:${i.returnedQty} X:${i.lossQty}]`).join(" | ")}
      </div>
    </div>
  );
}

