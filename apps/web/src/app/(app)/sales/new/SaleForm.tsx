"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Checkbox, Field, FieldGrid, Input, NumberInput } from "@/components/ui/Field";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/SearchableCombobox";
import { SummaryPanel } from "@/components/ui/SummaryPanel";
import { Table, Td, Th, TotalRow, Tr } from "@/components/ui/Table";
import { IDLE, type ActionState } from "@/lib/action-state";
import { formatMoney, formatQty } from "@/lib/format";
import { cn } from "@/lib/cn";
import { buildSalePreview, type SaleProduct } from "@/lib/sale-consumption";
import { Modal } from "@/components/ui/Modal";
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

/** Нөөцийн нэгж: түүхий эд ("rm:<id>") эсвэл бэлэн бүтээгдэхүүн ("pr:<id>"). */
export type MaterialStock = { key: string; name: string; quantity: number; unit: string };

type Row = { productId: string; quantity: string; unitPrice: string };

const EMPTY_ROW: Row = { productId: "", quantity: "", unitPrice: "" };

/** Мөнгөн дүнг сервертэй ижилхэн 2 орон болгож харьцуулна. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

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
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createSaleBatchAction,
    IDLE,
  );

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  // Сонгох боломжтой бүтээгдэхүүний хүрээ ХЭВЭЭР — `products` prop нь
  // сервер талаас өмнөх шигээ ирнэ (идэвхтэй бүх бүтээгдэхүүн).
  const productOptions: ComboboxOption[] = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        secondary: product.sku,
        badge: product.productType === "RESALE" ? "Бэлэн бүтээгдэхүүн" : "Үйлдвэрлэдэг",
      })),
    [products],
  );

  const stockByKey = useMemo(() => new Map(materials.map((m) => [m.key, m])), [materials]);

  // Сөрөг үлдэгдлийн зөвшөөрөл нь REACT-ийн ТӨЛӨВ. Урьд нь энэ нь формын
  // энгийн (uncontrolled) checkbox байсан бөгөөд React 19 нь action дуусахад
  // формыг СЭРГЭЭДЭГ тул алдаа гарах бүрд чагт нь арилдаг байв.
  const [allowNegative, setAllowNegative] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const total = rows.reduce((acc, row) => acc + toNumber(row.quantity) * toNumber(row.unitPrice), 0);
  const paymentTotal =
    toNumber(payments.cash) +
    toNumber(payments.card) +
    toNumber(payments.qr) +
    toNumber(payments.bankTransfer) +
    toNumber(payments.other);
  const difference = round2(total - paymentTotal);
  // Сервер нь ЯГ тэнцүү байхыг шаарддаг. Урьд нь клиент ±0.5₮ зөвшөөрдөг байсан
  // тул 0.4₮-ийн зөрүү клиентээр гарч, сервер дээр унаж, ойлгомжгүй алдаа
  // өгөөд формыг сэргээдэг байв. Одоо хоёр тал ижил дүрэмтэй.
  const balanced = difference === 0 && total > 0;
  const filledRows = rows.filter((row) => row.productId && toNumber(row.quantity) > 0).length;
  const totalUnits = rows.reduce((acc, row) => acc + toNumber(row.quantity), 0);

  // Хасагдах нөөц. Дүрэм нь сервертэй ГАНЦ файлаас гарна (sale-consumption),
  // тиймээс урьдчилсан харагдац ба бодит хасалт салж чадахгүй.
  const consumption = useMemo(
    () =>
      buildSalePreview(
        rows.map((row) => ({ productId: row.productId, quantity: toNumber(row.quantity) })),
        productById,
        stockByKey,
      ),
    [rows, productById, stockByKey],
  );

  // Үлдэгдэл нь олдоогүй мөр — өгөгдлийн холболтын алдаа. Үүнийг нөөцийн
  // дутагдал гэж тооцохгүй: эзний зөвшөөрлөөр "давж гарах" зүйл биш.
  const unresolved = consumption.filter((line) => !line.resolved);
  const shortages = consumption.filter((line) => line.short);
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

  // Дутагдал арилвал зөвшөөрлийг автоматаар унтраана — хуучирсан зөвшөөрөл
  // санамсаргүйгээр илгээгдэхээс сэргийлнэ.
  useEffect(() => {
    if (shortages.length === 0 && allowNegative) setAllowNegative(false);
  }, [shortages.length, allowNegative]);

  const overrideActive = isOwner && allowNegative && shortages.length > 0;
  // Тодорхойгүй мөр байвал ямар ч тохиолдолд илгээхгүй — эзний зөвшөөрөл ч
  // үүнийг давж гарахгүй, учир нь энэ нь нөөцийн асуудал биш.
  const blocked = !balanced || unresolved.length > 0 || (shortages.length > 0 && !overrideActive);

  return (
    <form action={formAction} className="space-y-6">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}

      {/* Зөвшөөрлийг төлөвөөс шууд илгээнэ — формыг сэргээсэн ч төлөв хэвээр. */}
      <input type="hidden" name="allowNegativeStock" value={overrideActive ? "on" : "off"} />

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
          description="Баталгаажуулахад жорын материал болон бэлэн бүтээгдэхүүний нөөц автоматаар хасагдана."
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
                  <SearchableCombobox
                    name={`items[${index}][productId]`}
                    value={row.productId}
                    onChange={(next) => onProductChange(index, next)}
                    options={productOptions}
                    placeholder="Бүтээгдэхүүн хайх эсвэл сонгох..."
                    searchPlaceholder="Нэр эсвэл код..."
                    emptyMessage="Бүтээгдэхүүн олдсонгүй."
                  />
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
              {consumption.map((line) => (
                <tr
                  key={line.key}
                  className={cn(line.short && "bg-red-50", !line.resolved && "bg-amber-50")}
                >
                  <Td>
                    {line.resolved ? (
                      line.name
                    ) : (
                      <span className="text-amber-800">Тодорхойгүй бараа ({line.key})</span>
                    )}
                  </Td>
                  <Td align="right">
                    {formatQty(line.required)} {line.unit}
                  </Td>
                  <Td align="right">{line.resolved ? formatQty(line.available) : "—"}</Td>
                  <Td align="right" className={line.short ? "font-semibold text-red-600" : ""}>
                    {line.resolved ? formatQty(line.after) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {unresolved.length > 0 ? (
        <Alert tone="warning" title="Барааны үлдэгдэл тодорхойлогдсонгүй">
          <p>
            Дараах нөөцийн үлдэгдлийг уншиж чадсангүй: {unresolved.map((u) => u.key).join(", ")}.
            Энэ нь нөөцийн дутагдал БИШ — өгөгдлийн холболтын алдаа тул эзний зөвшөөрлөөр
            давж гарахгүй. Жор болон барааны бүртгэлээ шалгана уу.
          </p>
        </Alert>
      ) : null}

      {shortages.length > 0 ? (
        <Alert tone="error" title="Нөөц хүрэлцэхгүй байна">
          <p>{shortages.map((s) => s.name).join(", ")} — үлдэгдэл хүрэлцэхгүй.</p>
          {isOwner ? (
            <div className="mt-2 space-y-2">
              <Checkbox
                label="Сөрөг үлдэгдэл рүү орохыг зөвшөөрөх (эзний эрх)"
                checked={allowNegative}
                onChange={(event) => setAllowNegative(event.target.checked)}
              />
              {allowNegative ? (
                <p className="rounded-md bg-white/70 px-2.5 py-2 text-[13px] font-medium leading-5 text-red-800">
                  Эзний зөвшөөрлөөр сөрөг үлдэгдэл үүснэ. Энэ зөвшөөрөл зөвхөн ЭНЭ борлуулалтад
                  үйлчилнэ — системийн тохиргоо өөрчлөгдөхгүй.
                </p>
              ) : null}
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

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink-50 px-4 py-3">
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
          overrideActive ? (
            <>
              <Button
                size="lg"
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={blocked || isPending}
                loading={isPending}
              >
                {isPending ? "Баталгаажуулж байна..." : "Борлуулалт баталгаажуулах"}
              </Button>
              <button id="sale-submit" type="submit" hidden aria-hidden tabIndex={-1} />
            </>
          ) : (
            <SubmitButton size="lg" pendingText="Баталгаажуулж байна..." disabled={blocked}>
              Борлуулалт баталгаажуулах
            </SubmitButton>
          )
        }
      />

      {/* Сөрөг үлдэгдэл үүсгэхийн өмнөх эцсийн баталгаажуулалт. */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Сөрөг үлдэгдэл үүсгэхийг батлах"
        tone="danger"
        description="Доорх барааны үлдэгдэл сөрөг болно. Энэ зөвшөөрөл зөвхөн энэ борлуулалтад үйлчилнэ."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Буцах
            </Button>
            <Button
              variant="dangerSolid"
              disabled={isPending}
              loading={isPending}
              onClick={() => {
                setConfirmOpen(false);
                document.getElementById("sale-submit")?.click();
              }}
            >
              Зөвшөөрч баталгаажуулах
            </Button>
          </>
        }
      >
        <ul className="divide-y divide-ink-200 rounded-card border border-ink-200">
          {shortages.map((line) => (
            <li key={line.key} className="px-3 py-2 text-sm">
              <div className="font-medium text-ink-900">{line.name}</div>
              <dl className="mt-1 grid grid-cols-3 gap-2 text-[12px] text-ink-500">
                <div>
                  <dt>Одоо</dt>
                  <dd className="tabular text-ink-700">
                    {formatQty(line.available)} {line.unit}
                  </dd>
                </div>
                <div>
                  <dt>Шаардлагатай</dt>
                  <dd className="tabular text-ink-700">
                    {formatQty(line.required)} {line.unit}
                  </dd>
                </div>
                <div>
                  <dt>Дараах</dt>
                  <dd className="tabular font-semibold text-red-600">
                    {formatQty(line.after)} {line.unit}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </Modal>
    </form>
  );
}
