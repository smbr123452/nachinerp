"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { NumberInput } from "@/components/ui/Field";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Table, Td, Th, TotalRow } from "@/components/ui/Table";
import { IDLE, type ActionState } from "@/lib/action-state";
import { formatMoney, formatQty } from "@/lib/format";
import { cn } from "@/lib/cn";
import { finalizeCountAction, saveCountAction } from "../actions";

export type CountSheetRow = {
  rawMaterialId: string;
  name: string;
  sku: string;
  unit: string;
  systemQuantity: number;
  countedQuantity: string;
  unitCost: number;
};

function toNumber(value: string): number {
  const parsed = Number(value.replace(/\s|,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CountSheet({ countId, rows: initialRows }: { countId: string; rows: CountSheetRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveState, saveAction] = useActionState<ActionState, FormData>(saveCountAction, IDLE);
  const [finalizeState, finalizeAction] = useActionState<ActionState, FormData>(finalizeCountAction, IDLE);

  const computed = rows.map((row) => {
    const counted = toNumber(row.countedQuantity);
    const difference = counted - row.systemQuantity;
    return { ...row, counted, difference, variance: difference * row.unitCost };
  });

  const totalVariance = computed.reduce((acc, row) => acc + row.variance, 0);
  const diffCount = computed.filter((row) => Math.abs(row.difference) > 1e-9).length;

  const update = (rawMaterialId: string, countedQuantity: string) =>
    setRows((current) =>
      current.map((row) => (row.rawMaterialId === rawMaterialId ? { ...row, countedQuantity } : row)),
    );

  const hiddenInputs = rows.map((row, index) => (
    <span key={row.rawMaterialId}>
      <input type="hidden" name={`lines[${index}][rawMaterialId]`} value={row.rawMaterialId} />
      <input type="hidden" name={`lines[${index}][countedQuantity]`} value={row.countedQuantity || "0"} />
    </span>
  ));

  const state = finalizeState.status !== "idle" ? finalizeState : saveState;

  return (
    <div className="space-y-4">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {state.status === "success" && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <Card>
        <CardHeader
          title="Тооллогын хуудас"
          description={`${diffCount} мөрөнд зөрүү байна · Нийт зөрүү ${formatMoney(totalVariance)}`}
        />
        <Table>
          <thead>
            <tr>
              <Th>Материал</Th>
              <Th align="right">Системийн үлдэгдэл</Th>
              <Th align="right">Биет тоолсон</Th>
              <Th align="right">Зөрүү</Th>
              <Th align="right">Нэгж өртөг</Th>
              <Th align="right">Зөрүүний дүн</Th>
            </tr>
          </thead>
          <tbody>
            {computed.map((row) => {
              const hasDiff = Math.abs(row.difference) > 1e-9;
              return (
                <tr key={row.rawMaterialId} className={cn(hasDiff && "bg-amber-50")}>
                  <Td>
                    <span className="font-medium">{row.name}</span>
                    <span className="ml-2 font-mono text-xs text-ink-400">{row.sku}</span>
                  </Td>
                  <Td align="right">
                    {formatQty(row.systemQuantity)} {row.unit}
                  </Td>
                  <Td align="right">
                    <NumberInput
                      value={row.countedQuantity}
                      onChange={(event) => update(row.rawMaterialId, event.target.value)}
                      aria-label={`${row.name} — тоолсон тоо`}
                      className="w-32"
                    />
                  </Td>
                  <Td
                    align="right"
                    className={cn(
                      "font-medium",
                      row.difference < 0 ? "text-red-600" : row.difference > 0 ? "text-emerald-600" : "",
                    )}
                  >
                    {row.difference > 0 ? "+" : ""}
                    {formatQty(row.difference)}
                  </Td>
                  <Td align="right" className="text-ink-500">
                    {formatMoney(row.unitCost)}
                  </Td>
                  <Td align="right" className={row.variance < 0 ? "text-red-600" : ""}>
                    {formatMoney(row.variance)}
                  </Td>
                </tr>
              );
            })}
            <TotalRow>
              <Td colSpan={5}>Нийт зөрүүний дүн</Td>
              <Td align="right" className={totalVariance < 0 ? "text-red-600" : "text-emerald-600"}>
                {formatMoney(totalVariance)}
              </Td>
            </TotalRow>
          </tbody>
        </Table>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          <form action={saveAction}>
            <input type="hidden" name="countId" value={countId} />
            {hiddenInputs}
            <SubmitButton variant="secondary" pendingText="Хадгалж байна...">
              Ноорог хадгалах
            </SubmitButton>
          </form>
          <Button onClick={() => setConfirmOpen(true)}>Тооллого баталгаажуулах</Button>
        </CardFooter>
      </Card>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Тооллого баталгаажуулах"
        description="Зөрүү бүрд нөөцийн тохируулгын хөдөлгөөн үүсэх бөгөөд буцаах боломжгүй."
      >
        <div className="space-y-4">
          <Alert tone={totalVariance < 0 ? "warning" : "info"}>
            <p>
              Зөрүүтэй мөр: <strong>{diffCount}</strong>
            </p>
            <p>
              Нийт зөрүүний дүн: <strong>{formatMoney(totalVariance)}</strong>
            </p>
          </Alert>
          <form action={finalizeAction}>
            <input type="hidden" name="countId" value={countId} />
            {hiddenInputs}
            <ModalActions>
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                Болих
              </Button>
              <SubmitButton pendingText="Баталгаажуулж байна...">Баталгаажуулах</SubmitButton>
            </ModalActions>
          </form>
        </div>
      </Modal>
    </div>
  );
}
