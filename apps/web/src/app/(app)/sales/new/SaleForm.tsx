"use client";

import { useActionState, useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { Table, Td, Th } from "@/components/ui/Table";
import { IDLE, type ActionState } from "@/lib/action-state";
import { formatMoney, formatQty } from "@/lib/format";
import { cn } from "@/lib/cn";
import { createSaleBatchAction } from "../actions";

export type ProductOption = {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  hasRecipe: boolean;
  /** Жорын мөрүүд — нөөцийн шалгалтыг шууд харуулахад ашиглана. */
  recipe: { rawMaterialId: string; baseQuantity: number }[];
};

export type MaterialStock = { id: string; name: string; quantity: number; unit: string };

type Row = { productId: string; quantity: string; unitPrice: string };

const EMPTY_ROW: Row = { productId: "", quantity: "", unitPrice: "" };

function toNumber(value: string): number {
  const parsed = Number(value.replace(/\s|,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function SaleForm({
  products,
  materials,
  today,
  isOwner,
}: {
  products: ProductOption[];
  materials: MaterialStock[];
  today: string;
  isOwner: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [payments, setPayments] = useState({ cash: "", card: "", qr: "", bankTransfer: "", other: "" });
  const [state, formAction] = useActionState<ActionState, FormData>(createSaleBatchAction, IDLE);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  const total = rows.reduce((acc, row) => acc + toNumber(row.quantity) * toNumber(row.unitPrice), 0);
  const paymentTotal =
    toNumber(payments.cash) +
    toNumber(payments.card) +
    toNumber(payments.qr) +
    toNumber(payments.bankTransfer) +
    toNumber(payments.other);
  const difference = total - paymentTotal;

  // Жорын дагуух материалын хэрэглээг урьдчилан харуулна.
  const consumption = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const product = productById.get(row.productId);
      if (!product) continue;
      const quantity = toNumber(row.quantity);
      for (const line of product.recipe) {
        map.set(line.rawMaterialId, (map.get(line.rawMaterialId) ?? 0) + line.baseQuantity * quantity);
      }
    }
    return [...map.entries()]
      .map(([rawMaterialId, required]) => {
        const material = materialById.get(rawMaterialId);
        return {
          rawMaterialId,
          name: material?.name ?? "",
          unit: material?.unit ?? "",
          required,
          available: material?.quantity ?? 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "mn"));
  }, [rows, productById, materialById]);

  const shortages = consumption.filter((line) => line.required > line.available + 1e-9);
  const missingRecipe = rows
    .map((row) => productById.get(row.productId))
    .filter((product): product is ProductOption => product !== undefined && !product.hasRecipe);

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const onProductChange = (index: number, productId: string) => {
    const product = productById.get(productId);
    update(index, { productId, unitPrice: product?.sellingPrice ?? "" });
  };

  const fillCash = () => setPayments((current) => ({ ...current, cash: String(total - (paymentTotal - toNumber(current.cash))) }));

  return (
    <form action={formAction} className="space-y-6">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <Card>
        <CardHeader title="Өдрийн мэдээлэл" />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Огноо" htmlFor="date" required error={state.fieldErrors?.date}>
              <Input id="date" name="date" type="date" defaultValue={today} required />
            </Field>
            <Field label="Тайлбар" htmlFor="note" className="lg:col-span-2">
              <Input id="note" name="note" placeholder="Сонголтоор" />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Борлуулсан бүтээгдэхүүн"
          description="Баталгаажуулахад жорын дагуу материал автоматаар хасагдана."
        />
        <Table>
          <thead>
            <tr>
              <Th className="w-2/5">Бүтээгдэхүүн</Th>
              <Th align="right">Тоо ширхэг</Th>
              <Th align="right">Нэгж үнэ</Th>
              <Th align="right">Дүн</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <Td>
                  <Select
                    name={`items[${index}][productId]`}
                    value={row.productId}
                    onChange={(event) => onProductChange(index, event.target.value)}
                  >
                    <option value="">— Сонгох —</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.sku})
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
                <Td align="right">
                  <input
                    name={`items[${index}][unitPrice]`}
                    value={row.unitPrice}
                    onChange={(event) => update(index, { unitPrice: event.target.value })}
                    inputMode="decimal"
                    placeholder="0"
                    className="tabular w-32 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </Td>
                <Td align="right" className="font-medium">
                  {formatMoney(toNumber(row.quantity) * toNumber(row.unitPrice))}
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
            ))}
            <tr className="bg-slate-50 font-semibold">
              <Td colSpan={3}>Нийт орлого</Td>
              <Td align="right">{formatMoney(total)}</Td>
              <Td />
            </tr>
          </tbody>
        </Table>
        <CardBody className="border-t border-slate-200">
          <Button variant="secondary" onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}>
            + Мөр нэмэх
          </Button>
        </CardBody>
      </Card>

      {missingRecipe.length > 0 ? (
        <Alert tone="warning" title="Жоргүй бүтээгдэхүүн">
          {missingRecipe.map((p) => p.name).join(", ")} — жор оруулаагүй тул нөөц хасагдахгүй.
        </Alert>
      ) : null}

      {consumption.length > 0 ? (
        <Card>
          <CardHeader
            title="Хасагдах материал"
            description="Жорын дагуу тооцоолсон урьдчилсан дүн"
          />
          <Table>
            <thead>
              <tr>
                <Th>Материал</Th>
                <Th align="right">Шаардлагатай</Th>
                <Th align="right">Үлдэгдэл</Th>
                <Th align="right">Дараах үлдэгдэл</Th>
              </tr>
            </thead>
            <tbody>
              {consumption.map((line) => {
                const short = line.required > line.available + 1e-9;
                return (
                  <tr key={line.rawMaterialId} className={cn(short && "bg-red-50")}>
                    <Td>{line.name}</Td>
                    <Td align="right">
                      {formatQty(line.required)} {line.unit}
                    </Td>
                    <Td align="right">{formatQty(line.available)}</Td>
                    <Td align="right" className={short ? "font-semibold text-red-600" : ""}>
                      {formatQty(line.available - line.required)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {shortages.length > 0 ? (
        <Alert tone="error" title="Нөөц хүрэлцэхгүй байна">
          <p>{shortages.map((s) => s.name).join(", ")} — үлдэгдэл хүрэлцэхгүй.</p>
          {isOwner ? (
            <div className="mt-2">
              <Checkbox
                label="Сөрөг үлдэгдэл рүү орохыг зөвшөөрөх (эзний эрх)"
                name="allowNegativeStock"
              />
            </div>
          ) : (
            <p className="mt-1">
              Эхлээд худалдан авалт эсвэл тохируулга хийнэ үү. Шаардлагатай бол эзэн зөвшөөрөл өгнө.
            </p>
          )}
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Төлбөрийн хуваарилалт" description="Бэлэн мөнгө кассд, карт / QR / шилжүүлэг банкинд бүртгэгдэнэ." />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {([
              ["cash", "Бэлэн"],
              ["card", "Карт"],
              ["qr", "QR"],
              ["bankTransfer", "Дансаар"],
              ["other", "Бусад"],
            ] as const).map(([key, label]) => (
              <Field key={key} label={label} htmlFor={key}>
                <Input
                  id={key}
                  name={key}
                  inputMode="decimal"
                  value={payments[key]}
                  placeholder="0"
                  onChange={(event) => setPayments((current) => ({ ...current, [key]: event.target.value }))}
                  className="text-right"
                />
              </Field>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-slate-500">Нийт орлого: </span>
                <strong className="tabular">{formatMoney(total)}</strong>
              </div>
              <div>
                <span className="text-slate-500">Хуваарилсан: </span>
                <strong className="tabular">{formatMoney(paymentTotal)}</strong>
              </div>
              <div>
                <span className="text-slate-500">Зөрүү: </span>
                <strong className={cn("tabular", Math.abs(difference) > 0.5 ? "text-red-600" : "text-emerald-600")}>
                  {formatMoney(difference)}
                </strong>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={fillCash} disabled={total <= 0}>
              Үлдсэнийг бэлнээр бөглөх
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            Баталгаажуулсны дараа нөөц хасагдаж, мөнгөн гүйлгээ болон аудитын бичлэг үүснэ.
          </p>
          <SubmitButton size="lg" pendingText="Баталгаажуулж байна..." disabled={Math.abs(difference) > 0.5}>
            Борлуулалт баталгаажуулах
          </SubmitButton>
        </CardBody>
      </Card>
    </form>
  );
}
