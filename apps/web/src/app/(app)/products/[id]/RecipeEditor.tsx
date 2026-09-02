"use client";

import { useActionState, useMemo, useState } from "react";
import type { Unit } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { NumberInput, Select } from "@/components/ui/Field";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/SearchableCombobox";
import { Table, Td, Th, Tr } from "@/components/ui/Table";
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

  // Сонгох боломжтой түүхий эдийн хүрээ ХЭВЭЭР — `materials` prop өөрчлөгдөөгүй.
  const materialOptions: ComboboxOption[] = useMemo(
    () =>
      materials.map((option) => ({
        value: option.id,
        label: option.name,
        secondary: option.sku,
      })),
    [materials],
  );

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
              <Tr key={index}>
                <Td>
                  <SearchableCombobox
                    name={`items[${index}][rawMaterialId]`}
                    value={row.rawMaterialId}
                    onChange={(next) => onMaterialChange(index, next)}
                    options={materialOptions}
                    placeholder="Түүхий эд хайх эсвэл сонгох..."
                    searchPlaceholder="Нэр эсвэл код..."
                    emptyMessage="Түүхий эд олдсонгүй."
                  />
                </Td>
                <Td align="right">
                  <NumberInput
                    name={`items[${index}][quantity]`}
                    value={row.quantity}
                    onChange={(event) => update(index, { quantity: event.target.value })}
                    placeholder="0"
                    aria-label="Шаардагдах хэмжээ"
                    className="w-28"
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
                <Td align="right" className="text-ink-500">
                  {material ? `${formatMoneyPrecise(material.averageCost)} / ${unitLabel(material.unit)}` : "-"}
                </Td>
                <Td align="right" className="font-medium">
                  {formatMoney(lineCost(row, material))}
                </Td>
                <Td align="right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    aria-label="Мөр устгах"
                    className="text-ink-400 hover:text-red-600"
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </Button>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus />}
          onClick={() => setRows((current) => [...current, { rawMaterialId: "", quantity: "", unit: "KG" }])}
        >
          Мөр нэмэх
        </Button>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
            <div>
              <dt className="text-ink-500">Жорын өртөг</dt>
              <dd className="tabular font-semibold text-ink-900">{formatMoney(totalCost)}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Нэгжийн ашиг</dt>
              <dd
                className={`tabular font-semibold ${profit < 0 ? "text-red-700" : "text-emerald-700"}`}
              >
                {formatMoney(profit)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Ашгийн хувь</dt>
              <dd className="tabular font-semibold text-ink-900">{margin.toFixed(1)}%</dd>
            </div>
          </dl>
          <SubmitButton pendingText="Хадгалж байна...">Жор хадгалах</SubmitButton>
        </div>
      </div>
    </form>
  );
}
