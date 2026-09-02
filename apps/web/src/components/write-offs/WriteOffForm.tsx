"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Field, FieldGrid, Input, NumberInput, Select, Textarea } from "@/components/ui/Field";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/SearchableCombobox";
import { IDLE, type ActionState } from "@/lib/action-state";
import { formatMoney, formatQty } from "@/lib/format";
import { unitLabel } from "@/lib/units";
import {
  WRITE_OFF_CONTEXT_LABEL,
  WRITE_OFF_REASON_LABEL,
  WRITE_OFF_REASONS,
  type WriteOffContext,
} from "@/lib/write-offs";
import type { WriteOffCandidate } from "@/server/services/write-offs";
import { createWriteOffAction } from "@/app/(app)/write-off-actions";
import { ConfirmWriteOffModal } from "./ConfirmWriteOffModal";

type Row = { subject: string; quantity: string };

const EMPTY_ROW: Row = { subject: "", quantity: "" };

export function WriteOffForm({
  context,
  candidates,
  today,
  preselect,
}: {
  /** Маягт зөвхөн энэ хүрээний барааг харуулна. Сервер тал мөн шалгана. */
  context: WriteOffContext;
  candidates: WriteOffCandidate[];
  today: string;
  /** Барааны хуудаснаас "АКТ" дарж ирэхэд урьдчилан сонгогдох бараа. */
  preselect?: string | null;
}) {
  const [rows, setRows] = useState<Row[]>([
    preselect ? { subject: preselect, quantity: "" } : { ...EMPTY_ROW },
  ]);
  const [reason, setReason] = useState<string>("EXPIRED");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createWriteOffAction,
    IDLE,
  );

  const byKey = useMemo(
    () => new Map(candidates.map((c) => [`${c.kind}:${c.id}`, c])),
    [candidates],
  );

  /** Аль хэдийн сонгогдсон барааг дахин сонгуулахгүй — давхардал төөрөгдүүлнэ. */
  const chosen = new Set(rows.map((r) => r.subject).filter(Boolean));

  /**
   * Тухайн мөрийн сонголтууд. Хүрээний шүүлт ӨӨРЧЛӨГДӨӨГҮЙ — `candidates` нь
   * сервер талаас хүрээгээрээ шүүгдэж ирнэ. Энд зөвхөн өөр мөрөнд сонгогдсон
   * барааг нуух хуучин дүрэм хэвээр үлдэнэ.
   */
  const optionsFor = (current: string): ComboboxOption[] =>
    candidates
      .filter((c) => `${c.kind}:${c.id}` === current || !chosen.has(`${c.kind}:${c.id}`))
      .map((c) => ({
        value: `${c.kind}:${c.id}`,
        label: c.name,
        secondary: c.sku,
        meta: `${formatQty(c.quantity)} ${unitLabel(c.unit as never)}`,
      }));

  const lines = rows
    .map((row) => {
      const candidate = byKey.get(row.subject);
      if (!candidate) return null;
      const quantity = Number(row.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      const unitCost = Number(candidate.averageCost);
      return {
        name: candidate.name,
        unit: candidate.unit,
        quantity,
        unitCost,
        total: quantity * unitCost,
        available: Number(candidate.quantity),
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);
  const totalCost = lines.reduce((s, l) => s + l.total, 0);

  // Үлдэгдлээс хэтэрсэн мөр байвал батлах товчийг хаана. Эцсийн шалгалт
  // сервер талд, барааг түгжсэний дараа хийгдэнэ — энэ нь зөвхөн тусламж.
  const overStock = lines.filter((l) => l.quantity > l.available);
  const noteRequired = reason === "OTHER";
  const canSubmit =
    lines.length > 0 && overStock.length === 0 && (!noteRequired || note.trim().length > 0);

  const update = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <>
      <form action={formAction} className="space-y-4">
        {/* Хүрээг сервер тал дахин шалгана — энэ талбар зөвхөн аль урсгалаас
            ирснийг хэлнэ, өөрөө эрх нээхгүй. */}
        <input type="hidden" name="context" value={context} />
        {state.status === "error" ? <Alert tone="error">{state.message}</Alert> : null}

        <Card>
          <CardHeader title="Актын мэдээлэл" />
          <CardBody className="space-y-4">
            <FieldGrid>
              <Field label="Огноо" htmlFor="date" required>
                <Input id="date" name="date" type="date" defaultValue={today} required />
              </Field>
              <Field label="Шалтгаан" htmlFor="reason" required>
                <Select
                  id="reason"
                  name="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  {WRITE_OFF_REASONS.map((value) => (
                    <option key={value} value={value}>
                      {WRITE_OFF_REASON_LABEL[value]}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldGrid>

            <Field
              label="Тайлбар"
              htmlFor="note"
              required={noteRequired}
              hint={noteRequired ? '"Бусад" шалтгаанд тайлбар заавал шаардана.' : undefined}
              error={state.fieldErrors?.note?.[0]}
            >
              <Textarea
                id="note"
                name="note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Юу болсон талаар товч тэмдэглэл."
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={WRITE_OFF_CONTEXT_LABEL[context]}
            description="Хасах бараа бүрийн тоо хэмжээг оруулна. Өртөг нь батлах үеийн жигнэсэн дундаж өртгөөр тооцогдоно."
          />
          <CardBody className="space-y-3">
            {rows.map((row, index) => {
              const candidate = byKey.get(row.subject);
              const quantity = Number(row.quantity);
              const available = candidate ? Number(candidate.quantity) : 0;
              const unitCost = candidate ? Number(candidate.averageCost) : 0;
              const over = Boolean(candidate) && quantity > available;

              return (
                <div
                  key={index}
                  className="rounded-card border border-ink-200 bg-ink-50/60 p-3 sm:p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_auto] sm:items-end">
                    <Field label="Бараа" htmlFor={`subject-${index}`}>
                      <SearchableCombobox
                        id={`subject-${index}`}
                        name={`lines[${index}][subject]`}
                        value={row.subject}
                        onChange={(next) => update(index, { subject: next })}
                        options={optionsFor(row.subject)}
                        placeholder="Бараа хайх эсвэл сонгох..."
                        searchPlaceholder="Нэр эсвэл код..."
                        emptyMessage="Бараа олдсонгүй."
                      />
                    </Field>

                    <Field label="Тоо хэмжээ" htmlFor={`quantity-${index}`}>
                      <NumberInput
                        id={`quantity-${index}`}
                        name={`lines[${index}][quantity]`}
                        step="0.001"
                        min="0"
                        value={row.quantity}
                        onChange={(e) => update(index, { quantity: e.target.value })}
                        placeholder="0"
                      />
                    </Field>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Мөр хасах"
                      disabled={rows.length === 1}
                      onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {candidate ? (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-500">
                      <span>
                        Үлдэгдэл:{" "}
                        <span className="tabular text-ink-700">
                          {formatQty(candidate.quantity)} {unitLabel(candidate.unit as never)}
                        </span>
                      </span>
                      <span>
                        Дундаж өртөг:{" "}
                        <span className="tabular text-ink-700">{formatMoney(unitCost)}</span>
                      </span>
                      {quantity > 0 ? (
                        <span>
                          Дүн:{" "}
                          <span className="tabular font-medium text-ink-900">
                            {formatMoney(quantity * unitCost)}
                          </span>
                        </span>
                      ) : null}
                      {over ? (
                        <span className="font-medium text-red-600">Үлдэгдлээс хэтэрсэн байна.</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}
            >
              <Plus className="h-4 w-4" />
              Бараа нэмэх
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <div className="text-ink-500">Нийт</div>
              <div className="tabular text-[19px] font-semibold text-ink-900">
                {formatMoney(totalCost)}
              </div>
              <div className="tabular text-[12px] text-ink-500">
                {lines.length} төрөл · {formatQty(totalQuantity)} нэгж
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="secondary" disabled={!canSubmit || isPending}>
                Ноорог хадгалах
              </Button>
              <Button
                type="button"
                disabled={!canSubmit || isPending}
                onClick={() => setConfirmOpen(true)}
              >
                Үргэлжлүүлэх
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>

      {/*
        Энэ алхам нь ноорог хадгална — батлах нь дэлгэрэнгүй хуудсан дээрх
        тусдаа алхам. Ингэснээр батлахаас өмнө акт дугаартай болж, хэрэглэгч
        эцсийн байдлаар нэг удаа хянана.
      */}
      <ConfirmWriteOffModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Ноорог акт үүсгэх"
        confirmLabel="Ноорог үүсгэх"
        documentNo={null}
        reasonLabel={WRITE_OFF_REASON_LABEL[reason as keyof typeof WRITE_OFF_REASON_LABEL]}
        note={note}
        lines={lines}
        totalCost={totalCost}
        pending={isPending}
        onConfirm={() => {
          setConfirmOpen(false);
          const form = document.querySelector<HTMLFormElement>("form");
          form?.requestSubmit();
        }}
      />
    </>
  );
}
