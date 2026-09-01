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
import { compatibleUnits, unitLabel } from "@/lib/units";
import { createPurchaseAction } from "../actions";

export type MaterialOption = {
  id: string;
  name: string;
  sku: string;
  unit: Unit;
  lastPurchasePrice: string | null;
};

type Row = { rawMaterialId: string; quantity: string; unit: Unit; unitPrice: string };

const EMPTY_ROW: Row = { rawMaterialId: "", quantity: "", unit: "KG", unitPrice: "" };

function toNumber(value: string): number {
  const parsed = Number(value.replace(/\s|,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PurchaseForm({
  materials,
  suppliers,
  today,
}: {
  materials: MaterialOption[];
  suppliers: { id: string; name: string }[];
  today: string;
}) {
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [state, formAction] = useActionState<ActionState, FormData>(createPurchaseAction, IDLE);
  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const onMaterialChange = (index: number, rawMaterialId: string) => {
    const material = byId.get(rawMaterialId);
    update(index, {
      rawMaterialId,
      unit: material?.unit ?? "KG",
      unitPrice: material?.lastPurchasePrice ?? "",
    });
  };

  const total = rows.reduce((acc, row) => acc + toNumber(row.quantity) * toNumber(row.unitPrice), 0);
  const filledRows = rows.filter((row) => row.rawMaterialId && toNumber(row.quantity) > 0).length;
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
            <Field label="Нийлүүлэгч" htmlFor="supplierId">
              <Select id="supplierId" name="supplierId" defaultValue="">
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

      <Card>
        <CardHeader title="Худалдан авсан бараа" description="Нэгжийг материалын үндсэн нэгж рүү автоматаар хөрвүүлнэ." />
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
              const material = byId.get(row.rawMaterialId);
              const units = material ? compatibleUnits(material.unit) : [];
              const subtotal = toNumber(row.quantity) * toNumber(row.unitPrice);
              return (
                <Tr key={index}>
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
