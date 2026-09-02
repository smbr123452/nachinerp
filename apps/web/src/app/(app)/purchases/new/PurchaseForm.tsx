"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
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
import { Modal } from "@/components/ui/Modal";
import { SupplierForm } from "../suppliers/SupplierForm";
import { createSupplierAction } from "../suppliers/actions";
import {
  fetchSupplierSuggestionsAction,
  type AssociatedSuggestion,
  type SupplierSuggestionBundle,
} from "./suggestions-action";
import { PURCHASE_PAYMENT_LABEL } from "@/lib/purchases";
import { ConfirmPurchaseModal, type ConfirmLine } from "./ConfirmPurchaseModal";
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

/** Модал формын гадна байрлах тул товч, файлын талбар `form` атрибутаар холбогдоно. */
const FORM_ID = "purchase-form";

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
  // Нийлүүлэгчийн жагсаалтыг клиент талд барина: формын дотроос шинэ
  // нийлүүлэгч үүсгэхэд хуудсыг дахин ачаалахгүйгээр нэмж, шууд сонгоно.
  const [supplierList, setSupplierList] = useState(suppliers);
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SupplierSuggestionBundle>({
    associated: [],
    history: [],
  });
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createPurchaseAction,
    IDLE,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [purchaseDate, setPurchaseDate] = useState(today);
  /**
   * Формын энэ хуулбарын давхардлаас хамгаалах түлхүүр. Хоёр дахин дарах,
   * сүлжээ давтан илгээхэд сервер тал ижил түлхүүрийг таньж, ШИНЭ баримт
   * үүсгэхгүй.
   */
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
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
  const loadSuggestions = (value: string) => {
    setSuggestions({ associated: [], history: [] });
    if (!value) return;
    setLoadingSuggestions(true);
    fetchSupplierSuggestionsAction(value)
      .then(setSuggestions)
      .catch(() => setSuggestions({ associated: [], history: [] }))
      .finally(() => setLoadingSuggestions(false));
  };

  const onSupplierChange = (value: string) => {
    setSupplierId(value);
    loadSuggestions(value);
  };

  /**
   * Формын дотроос шинэ нийлүүлэгч үүсгэсний дараа.
   *
   * ЧУХАЛ: энд хуудас руу шилжихгүй, дахин ачаалахгүй. Оруулсан мөр, тоо
   * хэмжээ, үнэ, төлбөр, тайлбар бүгд React төлөвт хэвээр үлдэнэ.
   */
  const onSupplierCreated = (data: unknown) => {
    const created = data as { id?: string; name?: string } | undefined;
    if (!created?.id || !created.name) return;
    setSupplierList((current) =>
      [...current, { id: created.id!, name: created.name! }].sort((a, b) =>
        a.name.localeCompare(b.name, "mn"),
      ),
    );
    setSupplierId(created.id);
    loadSuggestions(created.id);
  };

  /** Саналыг мөр болгон нэмнэ. Аль хэдийн байвал давхардуулахгүй. */
  const addSuggestion = (suggestion: {
    key: string;
    lastUnit: string | null;
    lastUnitPrice: string | null;
  }) => {
    const option = byKey.get(suggestion.key);
    if (!option) return;
    setRows((current) => {
      const existing = current.findIndex((row) => row.itemKey === suggestion.key);
      if (existing >= 0) return current;
      const row: Row = {
        itemKey: suggestion.key,
        quantity: "",
        // Түүх байхгүй бол барааны үндсэн нэгжийг ашиглаж, үнийг хоосон
        // үлдээнэ — үнэ зохиохгүй.
        unit: (suggestion.lastUnit as Unit | null) ?? option.unit,
        unitPrice: suggestion.lastUnitPrice ?? "",
      };
      // Эхний мөр хоосон бол түүнийг ашиглана.
      const blank = current.findIndex((r) => !r.itemKey);
      if (blank >= 0) return current.map((r, i) => (i === blank ? row : r));
      return [...current, row];
    });
  };

  const addBlankRow = () => setRows((current) => [...current, { ...EMPTY_ROW }]);

  const usedKeys = new Set(rows.map((row) => row.itemKey).filter(Boolean));

  const total = rows.reduce((acc, row) => acc + toNumber(row.quantity) * toNumber(row.unitPrice), 0);
  const filledRows = rows.filter((row) => row.itemKey && toNumber(row.quantity) > 0).length;
  const totalQuantity = rows.reduce((acc, row) => acc + toNumber(row.quantity), 0);

  // Алдаа гарвал модалыг хааж, формын дээрх мессежийг харуулна. Оруулсан
  // өгөгдөл бүрэн хэвээр — хэрэглэгч засаад дахин баталгаажуулж болно.
  useEffect(() => {
    if (state.status === "error") setConfirmOpen(false);
  }, [state]);

  /** Баталгаажуулах модалд харуулах мөрүүд. */
  const confirmLines: ConfirmLine[] = rows
    .filter((row) => row.itemKey && toNumber(row.quantity) > 0)
    .map((row) => {
      const option = byKey.get(row.itemKey);
      const quantity = toNumber(row.quantity);
      const unitPrice = toNumber(row.unitPrice);
      return {
        key: row.itemKey,
        name: option ? `${option.name} (${option.sku})` : row.itemKey,
        quantity,
        unit: row.unit,
        unitPrice,
        subtotal: quantity * unitPrice,
      };
    });

  const supplierName =
    supplierList.find((supplier) => supplier.id === supplierId)?.name ?? "Нийлүүлэгчгүй";

  return (
    <>
    <form id={FORM_ID} action={formAction} className="space-y-6">
      {/* Давхардлаас хамгаалах түлхүүр — сервер тал ижил түлхүүрээр хоёр
          дахь баримт үүсгэхгүй. */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <Card>
        <CardHeader title="Баримтын мэдээлэл" />
        <CardBody>
          <FieldGrid columns={4}>
            <Field label="Огноо" htmlFor="date" required error={state.fieldErrors?.date}>
              <Input
                id="date"
                name="date"
                type="date"
                value={purchaseDate}
                onChange={(event) => setPurchaseDate(event.target.value)}
                required
              />
            </Field>
            <Field
              label="Нийлүүлэгч"
              htmlFor="supplierId"
              hint="Сонгоход эндээс авдаг бараа санал болгоно."
            >
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  id="supplierId"
                  name="supplierId"
                  value={supplierId}
                  onChange={(event) => onSupplierChange(event.target.value)}
                  className="min-w-0 flex-1"
                >
                  <option value="">— Сонгоогүй —</option>
                  {supplierList.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Select>
                {/* Шинэ нийлүүлэгчийг ЭНД, хуудсаа орхилгүй үүсгэнэ —
                    оруулсан мөр, үнэ, төлбөр бүгд хэвээр үлдэнэ. */}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Plus />}
                  onClick={() => setNewSupplierOpen(true)}
                >
                  Шинэ
                </Button>
              </div>
            </Field>
            <Field label="Төлбөрийн хэлбэр" htmlFor="paymentMethod" required>
              <Select
                id="paymentMethod"
                name="paymentMethod"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
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
            title="Энэ нийлүүлэгчийн бараа"
            description="Дарж мөр болгон нэмнэ — автоматаар нэмэгдэхгүй. Холбогдоогүй барааг ч худалдан авч болно."
          />
          <CardBody className="space-y-4">
            {loadingSuggestions ? (
              <p className="text-[13px] text-ink-500">Ачаалж байна...</p>
            ) : (
              <>
                {/* Гараар холбосон бараа — "эндээс авдаг" гэсэн хэвшил. */}
                <SuggestionGroup
                  label="Энэ нийлүүлэгчээс авдаг бараа"
                  emptyText="Холбогдсон бараа алга байна."
                  chips={suggestions.associated.map((item) => ({
                    key: item.key,
                    name: item.name,
                    detail: item.lastUnitPrice
                      ? `Сүүлд ${formatMoney(Number(item.lastUnitPrice))} / ${unitLabel(item.lastUnit as Unit)}`
                      : "Хараахан аваагүй",
                    lastUnit: item.lastUnit,
                    lastUnitPrice: item.lastUnitPrice,
                  }))}
                  usedKeys={usedKeys}
                  onAdd={addSuggestion}
                />

                {/* Бодит худалдан авалтын түүх — холбоосоос тусдаа ойлголт. */}
                {suggestions.history.length > 0 ? (
                  <SuggestionGroup
                    label="Өмнө нь авч байсан (түүхээс)"
                    emptyText=""
                    chips={suggestions.history.map((item) => ({
                      key: item.key,
                      name: item.name,
                      detail: `Сүүлд ${formatMoney(Number(item.lastUnitPrice))} / ${unitLabel(item.lastUnit as Unit)} · ${item.timesPurchased} удаа`,
                      lastUnit: item.lastUnit,
                      lastUnitPrice: item.lastUnitPrice,
                    }))}
                    usedKeys={usedKeys}
                    onAdd={addSuggestion}
                  />
                ) : null}

                <div className="pt-1">
                  <Button variant="secondary" size="sm" icon={<Plus />} onClick={addBlankRow}>
                    Өөр бараа нэмэх
                  </Button>
                </div>
              </>
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
            onClick={addBlankRow}
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
        note="Баталгаажуулсны дараа нөөц нэмэгдэж, жигнэсэн дундаж өртөг шинэчлэгдэнэ."
        // Энэ товч формыг илгээхгүй — эцсийн баталгаажуулах модалыг нээнэ.
        // Бодит илгээлт нь модал доторх "Баталгаажуулах" дээр хийгдэнэ.
        action={
          <Button
            size="lg"
            onClick={() => setConfirmOpen(true)}
            disabled={filledRows === 0 || isPending}
          >
            Худалдан авалт бүртгэх
          </Button>
        }
      />
    </form>

    {/* Эцсийн баталгаажуулах модал. Формын ГАДНА — форм дотор форм байж
        болохгүй. "Цуцлах" нь зөвхөн модалыг хаана: оруулсан өгөгдөл бүрэн
        хэвээр, өгөгдлийн санд юу ч үүсээгүй. */}
    <ConfirmPurchaseModal
      open={confirmOpen}
      onClose={() => setConfirmOpen(false)}
      formId={FORM_ID}
      lines={confirmLines}
      total={total}
      supplierName={supplierName}
      paymentLabel={PURCHASE_PAYMENT_LABEL[paymentMethod as keyof typeof PURCHASE_PAYMENT_LABEL]}
      dateLabel={purchaseDate}
      pending={isPending}
    />

    {/* Модал нь худалдан авалтын формын ГАДНА байрлана: HTML-д форм дотор
        форм байж болохгүй бөгөөд тэгвэл дотоод форм илгээгдэхгүй. Ингэснээр
        нийлүүлэгч үүсгэх нь гадаад формын төлөвт огт нөлөөлөхгүй. */}
    <Modal
      open={newSupplierOpen}
      onClose={() => setNewSupplierOpen(false)}
      title="Шинэ нийлүүлэгч"
      description="Хадгалсны дараа шууд сонгогдоно. Оруулсан мөрүүд хэвээр үлдэнэ."
      size="lg"
    >
      <SupplierForm
        action={createSupplierAction}
        onDone={() => setNewSupplierOpen(false)}
        onSuccess={onSupplierCreated}
      />
    </Modal>
    </>
  );
}

type Chip = {
  key: string;
  name: string;
  detail: string;
  lastUnit: string | null;
  lastUnitPrice: string | null;
};

/**
 * Саналын нэг бүлэг. Дарахад л мөр нэмэгдэнэ — автоматаар хэзээ ч нэмэгдэхгүй.
 * Аль хэдийн формд орсон барааны товч идэвхгүй болно.
 */
function SuggestionGroup({
  label,
  emptyText,
  chips,
  usedKeys,
  onAdd,
}: {
  label: string;
  emptyText: string;
  chips: Chip[];
  usedKeys: Set<string>;
  onAdd: (chip: Chip) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      {chips.length === 0 ? (
        emptyText ? <p className="text-[13px] text-ink-500">{emptyText}</p> : null
      ) : (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const added = usedKeys.has(chip.key);
            return (
              <button
                key={chip.key}
                type="button"
                disabled={added}
                onClick={() => onAdd(chip)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                  added
                    ? "cursor-not-allowed border-ink-200 bg-ink-50 text-ink-400"
                    : "border-ink-300 bg-white text-ink-700 hover:border-brand-400 hover:bg-brand-50",
                )}
              >
                <span className="block font-medium">{chip.name}</span>
                <span className="block text-ink-500">{chip.detail}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
