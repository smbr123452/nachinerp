"use client";

import { useEffect, useState } from "react";

type LedgerItem = {
  id: string;
  txnType: string;
  qtyIn: string;
  qtyOut: string;
  refType: string;
  occurredAt: string;
  warehouse: { nameMn: string; branch: { nameMn: string } };
  product: { nameMn: string; sku: string };
};

export default function StockLedgerClient() {
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [error, setError] = useState("");

  async function loadData() {
    const res = await fetch("/api/admin/stock-ledger");
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Хөдөлгөөний түүх ачаалж чадсангүй.");
      return;
    }
    setItems(data.ledger ?? []);
  }

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <div className="rounded border bg-white p-5">
      <h1 className="text-lg font-semibold">Нөөцийн хөдөлгөөний түүх</h1>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 space-y-2 text-sm">
        {items.map((x) => (
          <div key={x.id} className="rounded border p-2">
            <p className="font-medium">
              {x.product.nameMn} ({x.product.sku}) - {x.txnType}
            </p>
            <p className="text-xs text-neutral-600">
              {x.warehouse.branch.nameMn} / {x.warehouse.nameMn} | Орсон: {x.qtyIn} | Гарсан: {x.qtyOut}
            </p>
            <p className="text-xs text-neutral-500">{new Date(x.occurredAt).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

