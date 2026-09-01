"use client";

import { useActionState, useMemo, useState } from "react";
import type { Unit } from "@prisma/client";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Table, Td, Th } from "@/components/ui/Table";
import { IDLE, type ActionState } from "@/lib/action-state";
import { formatMoney, formatMoneyPrecise } from "@/lib/format";
import { compatibleUnits, convertQuantity, unitLabel } from "@/lib/units";
import { saveRecipeAction } from "../actions";

export type MaterialOption = {
  id: string;
  name: string;
  sku: string;
  unit: Unit;
  averageCost: number;
};

export type RecipeRow = { rawMaterialId: string; quantity: string; unit: Unit };

function lineCost(row: RecipeRow, material: MaterialOption | undefined): number {
  if (!material) return 0;
  const quantity = Number(row.quantity.replace(/\s|,/g, ""));
  if (!Number.isFinite(quantity)) return 0;
  try {
    return convertQuantity(quantity, row.unit, material.unit).toNumber() * material.averageCost;
  } catch {
    return 0;
  }
}

export function RecipeEditor({
  productId,
  materials,
  initialRows,
  sellingPrice,
}: {
  productId: string;
  materials: MaterialOption[];
  initialRows: RecipeRow[];
  sellingPrice: number;
}) {
  const [rows, setRows] = useState<RecipeRow[]>(
    initialRows.length > 0 ? initialRows : [{ rawMaterialId: "", quantity: "", unit: "KG" }],
  );
  const [state, formAction] = useActionState<ActionState, FormData>(saveRecipeAction, IDLE);

  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const totalCost = rows.reduce((acc, row) => acc + lineCost(row, byId.get(row.rawMaterialId)), 0);
  const profit = sellingPrice - totalCost;
  const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;

  const update = (index: number, patch: Partial<RecipeRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const onMaterialChange = (index: number, rawMaterialId: string) => {
    const material = byId.get(rawMaterialId);
    update(index, { rawMaterialId, unit: material?.unit ?? "KG" });
  };

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {state.status === "success" && state.message ? (
        <Alert tone="success">{state.message}</Alert>
      ) : null}

      <Table>
        <thead>
          <tr>
            <Th className="w-2/5">Материал</Th>
            <Th align="right">Хэмжээ</Th>
            <Th>Нэгж</Th>
            <Th align="right">Нэгж өртөг</Th>
            <Th align="right">Мөрийн өртөг</Th>
            <Th align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const material = byId.get(row.rawMaterialId);
            const units = material ? compatibleUnits(material.unit) : [];
            return (
              <tr key={index}>
                <Td>
                  <Select
                    name={`items[${index}][rawMaterialId]`}
                    value={row.rawMaterialId}
                    onChange={(event) => onMaterialChange(index, event.target.value)}
                  >
                    <option value="">— Сонгох —</option>
                    {materials.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name} ({option.sku})
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td align="right">
                  <input
                    name={`items[${index}][quantity]`}
                    value={row.quantity}
                    onChange={(event) => update(index, { quantity: event.target.value })}
                    inputMode="decimal"
                    placeholder="0"
                    className="tabular w-28 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </Td>
                <Td>
                  <Select
                    name={`items[${index}][unit]`}
                    value={row.unit}
                    onChange={(event) => update(index, { unit: event.target.value as Unit })}
                    disabled={!material}
                    className="w-28"
                  >
                    {(units.length > 0 ? units : [row.unit]).map((unit) => (
                      <option key={unit} value={unit}>
                        {unitLabel(unit)}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td align="right" className="text-slate-500">
                  {material ? `${formatMoneyPrecise(material.averageCost)} / ${unitLabel(material.unit)}` : "-"}
                </Td>
                <Td align="right" className="font-medium">
                  {formatMoney(lineCost(row, material))}
                </Td>
                <Td align="right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    aria-label="Мөр устгах"
                  >
                    ✕
                  </Button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="secondary"
          onClick={() => setRows((current) => [...current, { rawMaterialId: "", quantity: "", unit: "KG" }])}
        >
          + Мөр нэмэх
        </Button>

        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div>
            <span className="text-slate-500">Жорын өртөг: </span>
            <strong className="tabular">{formatMoney(totalCost)}</strong>
          </div>
          <div>
            <span className="text-slate-500">Ашиг: </span>
            <strong className={`tabular ${profit < 0 ? "text-red-600" : "text-emerald-600"}`}>
              {formatMoney(profit)}
            </strong>
          </div>
          <div>
            <span className="text-slate-500">Ашгийн %: </span>
            <strong className="tabular">{margin.toFixed(1)}%</strong>
          </div>
          <SubmitButton>Жор хадгалах</SubmitButton>
        </div>
      </div>
    </form>
  );
}
