"use client";

import { useEffect, useState } from "react";

type Balance = {
  id: string;
  qty: string;
  branch: { nameMn: string };
  warehouse: { nameMn: string; code: string };
  product: { nameMn: string; sku: string };
};

export default function StockBalancesClient() {
  const [rows, setRows] = useState<Balance[]>([]);
  const [error, setError] = useState("");

  async function loadData() {
    const res = await fetch("/api/admin/stock-balances");
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Үлдэгдлийн мэдээлэл ачаалж чадсангүй.");
      return;
    }
    setRows(data.balances ?? []);
  }

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <div className="rounded border bg-white p-5">
      <h1 className="text-lg font-semibold">Склад/салбарын үлдэгдэл</h1>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 space-y-2 text-sm">
        {rows.map((x) => (
          <div key={x.id} className="rounded border p-2">
            <p className="font-medium">
              {x.product.nameMn} ({x.product.sku})
            </p>
            <p className="text-xs text-neutral-600">
              {x.branch.nameMn} / {x.warehouse.nameMn} ({x.warehouse.code}) - Үлдэгдэл: {x.qty}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

