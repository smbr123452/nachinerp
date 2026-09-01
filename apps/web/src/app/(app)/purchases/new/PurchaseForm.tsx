"use client";

import { useActionState, useMemo, useState } from "react";
import type { Unit } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Field, FieldGrid, Input, NumberInput, Select } from "@/components/ui/Field";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { SummaryPanel } from "@/components/ui/SummaryPanel";
import { Table, Td, Th, TotalRow, Tr } from "@/components/ui/Table";
import { IDLE, type ActionState } from "@/lib/action-state";
import { formatMoney, formatQty } from "@/lib/format";
import { cn } from "@/lib/cn";
import { compatibleUnits, unitLabel } from "@/lib/units";
import type { SupplierSuggestion } from "@/server/services/supplier-history";
import { fetchSupplierSuggestionsAction } from "./suggestions-action";
import { createPurchaseAction } from "../actions";

/**
 * Худалдан авах боломжтой зүйл: түүхий эд эсвэл бэлэн
 * бүтээгдэхүүн. key нь "rm:<id>" / "pr:<id>" — сонголтыг нэг талбараар
 * илэрхийлж, серверт зөв талбар руу задална.
 */
export type ItemOption = {
  key: string;
  kind: "rawMaterial" | "product";
  id: string;
  name: string;
  sku: string;
  unit: Unit;
  lastPurchasePrice: string | null;
};

type Row = { itemKey: string; quantity: string; unit: Unit; unitPrice: string };

const EMPTY_ROW: Row = { itemKey: "", quantity: "", unit: "KG", unitPrice: "" };

function toNumber(value: string): number {
  const parsed = Number(value.replace(/\s|,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PurchaseForm({
  items,
  suppliers,
  today,
}: {
  items: ItemOption[];
  suppliers: { id: string; name: string }[];
  today: string;
}) {
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [supplierId, setSupplierId] = useState("");
  const [suggestions, setSuggestions] = useState<SupplierSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(createPurchaseAction, IDLE);
  const byKey = useMemo(() => new Map(items.map((m) => [m.key, m])), [items]);

  const materials = useMemo(() => items.filter((i) => i.kind === "rawMaterial"), [items]);
  const products = useMemo(() => items.filter((i) => i.kind === "product"), [items]);

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const onItemChange = (index: number, itemKey: string) => {
    const option = byKey.get(itemKey);
    update(index, {
      itemKey,
      unit: option?.unit ?? "KG",
      unitPrice: option?.lastPurchasePrice ?? "",
    });
  };

  // Нийлүүлэгч солиход түүний түүхээс санал татна. Мөр АВТОМАТААР
  // нэмэгдэхгүй — доорх самбараас хэрэглэгч сонгож нэмнэ.
  const onSupplierChange = (value: string) => {
    setSupplierId(value);
    setSuggestions([]);
    if (!value) return;
    setLoadingSuggestions(true);
    fetchSupplierSuggestionsAction(value)
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
      .finally(() => setLoadingSuggestions(false));
  };

  /** Саналыг мөр болгон нэмнэ. Аль хэдийн байвал давхардуулахгүй. */
  const addSuggestion = (suggestion: SupplierSuggestion) => {
    if (!byKey.has(suggestion.key)) return;
    setRows((current) => {
      const existing = current.findIndex((row) => row.itemKey === suggestion.key);
      if (existing >= 0) return current;
      const row: Row = {
        itemKey: suggestion.key,
        quantity: "",
        unit: suggestion.lastUnit as Unit,
        unitPrice: suggestion.lastUnitPrice,
      };
      // Эхний мөр хоосон бол түүнийг ашиглана.
      const blank = current.findIndex((r) => !r.itemKey);
      if (blank >= 0) return current.map((r, i) => (i === blank ? row : r));
      return [...current, row];
    });
  };

  const usedKeys = new Set(rows.map((row) => row.itemKey).filter(Boolean));

  const total = rows.reduce((acc, row) => acc + toNumber(row.quantity) * toNumber(row.unitPrice), 0);
  const filledRows = rows.filter((row) => row.itemKey && toNumber(row.quantity) > 0).length;
  const totalQuantity = rows.reduce((acc, row) => acc + toNumber(row.quantity), 0);

  return (
    <form action={formAction} className="space-y-6">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <Card>
        <CardHeader title="Баримтын мэдээлэл" />
        <CardBody>
          <FieldGrid columns={4}>
            <Field label="Огноо" htmlFor="date" required error={state.fieldErrors?.date}>
              <Input id="date" name="date" type="date" defaultValue={today} required />
            </Field>
            <Field
              label="Нийлүүлэгч"
              htmlFor="supplierId"
              hint="Сонгоход өмнө нь авч байсан бараа санал болгоно."
            >
              <Select
                id="supplierId"
                name="supplierId"
                value={supplierId}
                onChange={(event) => onSupplierChange(event.target.value)}
              >
                <option value="">— Сонгоогүй —</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Төлбөрийн хэлбэр" htmlFor="paymentMethod" required>
              <Select id="paymentMethod" name="paymentMethod" defaultValue="CASH">
                <option value="CASH">Бэлэн (кассаас)</option>
                <option value="BANK">Банк</option>
                <option value="CREDIT">Зээлээр (төлбөр хийгдээгүй)</option>
              </Select>
            </Field>
            <Field label="Тайлбар" htmlFor="note">
              <Input id="note" name="note" placeholder="Сонголтоор" />
            </Field>
          </FieldGrid>
        </CardBody>
      </Card>

      {supplierId ? (
        <Card>
          <CardHeader
            title="Энэ нийлүүлэгчээс өмнө авсан бараа"
            description="Батлагдсан худалдан авалтын түүхээс. Дарж мөр болгон нэмнэ — автоматаар нэмэгдэхгүй."
          />
          <CardBody>
            {loadingSuggestions ? (
              <p className="text-[13px] text-ink-500">Ачаалж байна...</p>
            ) : suggestions.length === 0 ? (
              <p className="text-[13px] text-ink-500">
                Энэ нийлүүлэгчээс өмнө авсан бүртгэл алга байна.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => {
                  const added = usedKeys.has(suggestion.key);
                  return (
                    <button
                      key={suggestion.key}
                      type="button"
                      disabled={added}
                      onClick={() => addSuggestion(suggestion)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                        added
                          ? "cursor-not-allowed border-ink-200 bg-ink-50 text-ink-400"
                          : "border-ink-300 bg-white text-ink-700 hover:border-brand-400 hover:bg-brand-50",
                      )}
                    >
                      <span className="block font-medium">{suggestion.name}</span>
                      <span className="block text-ink-500">
                        Сүүлд {formatMoney(Number(suggestion.lastUnitPrice))} /{" "}
                        {unitLabel(suggestion.lastUnit as Unit)} ·{" "}
                        {suggestion.timesPurchased} удаа
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Худалдан авсан бараа" description="Нэгжийг үндсэн нэгж рүү автоматаар хөрвүүлнэ." />
        <Table>
          <thead>
            <tr>
              <Th className="w-2/5">Бараа материал</Th>
              <Th align="right">Тоо хэмжээ</Th>
              <Th>Нэгж</Th>
              <Th align="right">Нэгж үнэ</Th>
              <Th align="right">Дүн</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const option = byKey.get(row.itemKey);
              const units = option ? compatibleUnits(option.unit) : [];
              const subtotal = toNumber(row.quantity) * toNumber(row.unitPrice);
              return (
                <Tr key={index}>
                  <Td>
                    <Select
                      name={`items[${index}][itemKey]`}
                      value={row.itemKey}
                      onChange={(event) => onItemChange(index, event.target.value)}
                    >
                      <option value="">— Сонгох —</option>
                      {materials.length > 0 ? (
                        <optgroup label="Түүхий эд">
                          {materials.map((item) => (
                            <option key={item.key} value={item.key}>
                              {item.name} ({item.sku})
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {products.length > 0 ? (
                        <optgroup label="Бэлэн бүтээгдэхүүн">
                          {products.map((item) => (
                            <option key={item.key} value={item.key}>
                              {item.name} ({item.sku})
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </Select>
                  </Td>
                  <Td align="right">
                    <NumberInput
                      name={`items[${index}][quantity]`}
                      value={row.quantity}
                      onChange={(event) => update(index, { quantity: event.target.value })}
                      placeholder="0"
                      aria-label="Тоо хэмжээ"
                      className="w-28"
                    />
                  </Td>
                  <Td>
                    <Select
                      name={`items[${index}][unit]`}
                      value={row.unit}
                      onChange={(event) => update(index, { unit: event.target.value as Unit })}
                      disabled={!option}
                      className="w-28"
                    >
                      {(units.length > 0 ? units : [row.unit]).map((unit) => (
                        <option key={unit} value={unit}>
                          {unitLabel(unit)}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td align="right">
                    <NumberInput
                      name={`items[${index}][unitPrice]`}
                      value={row.unitPrice}
                      onChange={(event) => update(index, { unitPrice: event.target.value })}
                      placeholder="0"
                      aria-label="Нэгж үнэ"
                      className="w-32"
                    />
                  </Td>
                  <Td align="right" className="font-medium">
                    {formatMoney(subtotal)}
                  </Td>
                  <Td align="right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                      aria-label="Мөр устгах"
                      disabled={rows.length === 1}
                      className="text-ink-400 hover:text-red-600"
                    >
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </Button>
                  </Td>
                </Tr>
              );
            })}
            <TotalRow>
              <Td colSpan={4}>Нийт дүн</Td>
              <Td align="right" className="text-[15px]">
                {formatMoney(total)}
              </Td>
              <Td />
            </TotalRow>
          </tbody>
        </Table>
        <CardFooter>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}
          >
            Мөр нэмэх
          </Button>
        </CardFooter>
      </Card>

      <SummaryPanel
        lines={[
          { label: "Мөрийн тоо", value: filledRows },
          { label: "Нийт тоо хэмжээ", value: formatQty(totalQuantity) },
        ]}
        totalLabel="Нийт төлөх дүн"
        total={formatMoney(total)}
        note="Батлагдмагц нөөц нэмэгдэж, жигнэсэн дундаж өртөг шинэчлэгдэнэ."
        action={
          <SubmitButton size="lg" pendingText="Бүртгэж байна..." disabled={filledRows === 0}>
            Худалдан авалт бүртгэх
          </SubmitButton>
        }
      />
    </form>
  );
}
