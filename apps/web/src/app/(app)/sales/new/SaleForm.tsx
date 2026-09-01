"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Checkbox, Field, FieldGrid, Input, NumberInput, Select } from "@/components/ui/Field";
import { SummaryPanel } from "@/components/ui/SummaryPanel";
import { Table, Td, Th, TotalRow, Tr } from "@/components/ui/Table";
import { IDLE, type ActionState } from "@/lib/action-state";
import { formatMoney, formatQty } from "@/lib/format";
import { cn } from "@/lib/cn";
import { createSaleBatchAction } from "../actions";

export type ProductOption = {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  productType: "MANUFACTURED" | "RESALE";
  hasRecipe: boolean;
  /** Жорын мөрүүд — нөөцийн шалгалтыг шууд харуулахад ашиглана. */
  recipe: { rawMaterialId: string; baseQuantity: number }[];
};

/** Нөөцийн нэгж: түүхий эд ("rm:<id>") эсвэл RESALE бүтээгдэхүүн ("pr:<id>"). */
export type MaterialStock = { key: string; name: string; quantity: number; unit: string };

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
  const stockByKey = useMemo(() => new Map(materials.map((m) => [m.key, m])), [materials]);

  const total = rows.reduce((acc, row) => acc + toNumber(row.quantity) * toNumber(row.unitPrice), 0);
  const paymentTotal =
    toNumber(payments.cash) +
    toNumber(payments.card) +
    toNumber(payments.qr) +
    toNumber(payments.bankTransfer) +
    toNumber(payments.other);
  const difference = total - paymentTotal;
  const balanced = Math.abs(difference) <= 0.5 && total > 0;
  const filledRows = rows.filter((row) => row.productId && toNumber(row.quantity) > 0).length;
  const totalUnits = rows.reduce((acc, row) => acc + toNumber(row.quantity), 0);

  // Хасагдах нөөцийг урьдчилан харуулна: жорын материал, эсвэл дамжуулан
  // борлуулах бүтээгдэхүүн өөрөө.
  const consumption = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const product = productById.get(row.productId);
      if (!product) continue;
      const quantity = toNumber(row.quantity);
      if (product.productType === "RESALE") {
        const key = `pr:${product.id}`;
        map.set(key, (map.get(key) ?? 0) + quantity);
      } else {
        for (const line of product.recipe) {
          const key = `rm:${line.rawMaterialId}`;
          map.set(key, (map.get(key) ?? 0) + line.baseQuantity * quantity);
        }
      }
    }
    return [...map.entries()]
      .map(([key, required]) => {
        const stock = stockByKey.get(key);
        return {
          key,
          name: stock?.name ?? "",
          unit: stock?.unit ?? "",
          required,
          available: stock?.quantity ?? 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "mn"));
  }, [rows, productById, stockByKey]);

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
          <FieldGrid columns={3}>
            <Field label="Огноо" htmlFor="date" required error={state.fieldErrors?.date}>
              <Input id="date" name="date" type="date" defaultValue={today} required />
            </Field>
            <Field label="Тайлбар" htmlFor="note" className="lg:col-span-2">
              <Input id="note" name="note" placeholder="Сонголтоор" />
            </Field>
          </FieldGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Борлуулсан бүтээгдэхүүн"
          description="Баталгаажуулахад жорын материал болон дамжуулан борлуулах бүтээгдэхүүний нөөц автоматаар хасагдана."
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
              <Tr key={index}>
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
                  <NumberInput
                    name={`items[${index}][quantity]`}
                    value={row.quantity}
                    onChange={(event) => update(index, { quantity: event.target.value })}
                    placeholder="0"
                    aria-label="Тоо ширхэг"
                    className="w-28"
                  />
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
                  {formatMoney(toNumber(row.quantity) * toNumber(row.unitPrice))}
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
            ))}
            <TotalRow>
              <Td colSpan={3}>Нийт орлого</Td>
              <Td align="right">{formatMoney(total)}</Td>
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

      {missingRecipe.length > 0 ? (
        <Alert tone="warning" title="Жоргүй бүтээгдэхүүн">
          {missingRecipe.map((p) => p.name).join(", ")} — жор оруулаагүй тул нөөц хасагдахгүй.
        </Alert>
      ) : null}

      {consumption.length > 0 ? (
        <Card>
          <CardHeader
            title="Хасагдах нөөц"
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
                  <tr key={line.key} className={cn(short && "bg-red-50")}>
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
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {([
              ["cash", "Бэлэн"],
              ["card", "Карт"],
              ["qr", "QR"],
              ["bankTransfer", "Дансаар"],
              ["other", "Бусад"],
            ] as const).map(([key, label]) => (
              <Field key={key} label={label} htmlFor={key}>
                <NumberInput
                  id={key}
                  name={key}
                  value={payments[key]}
                  placeholder="0"
                  onChange={(event) => setPayments((current) => ({ ...current, [key]: event.target.value }))}
                />
              </Field>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
              <div>
                <dt className="text-ink-500">Нийт орлого</dt>
                <dd className="tabular font-semibold text-ink-900">{formatMoney(total)}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Хуваарилсан</dt>
                <dd className="tabular font-semibold text-ink-900">{formatMoney(paymentTotal)}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Зөрүү</dt>
                <dd
                  className={cn(
                    "tabular font-semibold",
                    total === 0 ? "text-ink-500" : balanced ? "text-emerald-700" : "text-red-700",
                  )}
                >
                  {formatMoney(difference)}
                </dd>
              </div>
            </dl>
            <Button
              variant="secondary"
              size="sm"
              icon={<Wand2 />}
              onClick={fillCash}
              disabled={total <= 0}
            >
              Үлдсэнийг бэлнээр бөглөх
            </Button>
          </div>
        </CardBody>
      </Card>

      <SummaryPanel
        lines={[
          { label: "Нэр төрөл", value: filledRows },
          { label: "Борлуулсан тоо", value: formatQty(totalUnits) },
          {
            label: "Төлбөрийн зөрүү",
            value: formatMoney(difference),
            tone: total === 0 ? "muted" : balanced ? "positive" : "negative",
          },
        ]}
        totalLabel="Нийт орлого"
        total={formatMoney(total)}
        note={
          balanced
            ? "Баталгаажуулсны дараа нөөц хасагдаж, мөнгөн гүйлгээ болон аудитын бичлэг үүснэ."
            : "Төлбөрийн хуваарилалт нийт орлоготой тэнцсэний дараа баталгаажуулах боломжтой."
        }
        action={
          <SubmitButton size="lg" pendingText="Баталгаажуулж байна..." disabled={!balanced}>
            Борлуулалт баталгаажуулах
          </SubmitButton>
        }
      />
    </form>
  );
}
