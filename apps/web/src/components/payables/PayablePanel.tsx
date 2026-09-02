"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, FieldGrid, Input, NumberInput, Select, Textarea } from "@/components/ui/Field";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { Table, Td, Th, Tr } from "@/components/ui/Table";
import { IDLE, type ActionState } from "@/lib/action-state";
import { formatMoney } from "@/lib/format";
import {
  PAYABLE_STATUS_LABEL,
  PAYABLE_STATUS_TONE,
  PAYMENT_ACCOUNT_LABEL,
  type ClientPayable,
} from "@/lib/payables";

/**
 * Худалдан авалтын зээлийн нөхцөл, төлбөр хийх, төлбөрийн түүх.
 *
 * ГОЛ ДҮРЭМ: төлбөр нь ЗАРДАЛ БИШ — зөвхөн мөнгө гарч, өр буурна. Тиймээс
 * энэ хэсэг нөөц, өртөг, ашгийн үзүүлэлтэд огт нөлөөлөхгүй.
 *
 * Товч нуух нь хамгаалалт биш: буцаалтыг сервер тал requireOwner-оор
 * шалгана. `canReverse` нь зөвхөн харагдац.
 */
export function PayablePanel({
  payable,
  today,
  canReverse,
  payAction,
  reverseAction,
}: {
  payable: ClientPayable;
  /** Сервер талын өнөөдөр (YYYY-MM-DD) — цагийн бүсийн зөрүүнээс сэргийлнэ. */
  today: string;
  canReverse: boolean;
  payAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  reverseAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [reverseId, setReverseId] = useState<string | null>(null);

  const settled = payable.outstanding <= 0;
  const canPay = !payable.cancelled && !settled;

  return (
    <Card className="mb-6">
      <CardHeader
        title="Зээлийн нөхцөл"
        description="Худалдан авалтын үед мөнгө гараагүй — нийлүүлэгчид өглөг үүссэн."
        action={
          canPay ? (
            <Button size="sm" onClick={() => setPayOpen(true)}>
              Төлбөр хийх
            </Button>
          ) : null
        }
      />

      <div className="px-5 py-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-5">
          <div>
            <dt className="text-ink-500">Нийт өглөг</dt>
            <dd className="tabular font-medium text-ink-900">
              {formatMoney(payable.originalAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Төлсөн</dt>
            <dd className="tabular font-medium text-ink-900">{formatMoney(payable.paid)}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Үлдэгдэл</dt>
            <dd className="tabular font-semibold text-ink-900">
              {formatMoney(payable.outstanding)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Төлөх хугацаа</dt>
            <dd className="font-medium text-ink-900">
              {payable.dueDateLabel ?? "Тодорхойгүй"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Төлөв</dt>
            <dd className="mt-0.5">
              <Badge tone={PAYABLE_STATUS_TONE[payable.status]} dot>
                {PAYABLE_STATUS_LABEL[payable.status]}
              </Badge>
            </dd>
          </div>
        </dl>

        {payable.note ? (
          <p className="mt-3 text-[13px] text-ink-600">{payable.note}</p>
        ) : null}

        {payable.cancelled ? (
          <Alert tone="warning" className="mt-3">
            Худалдан авалт цуцлагдсан тул энэ өглөгт төлбөр хийх боломжгүй.
          </Alert>
        ) : null}
      </div>

      {payable.payments.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Огноо</Th>
              <Th>Данс</Th>
              <Th align="right">Дүн</Th>
              <Th>Тайлбар</Th>
              <Th>Бүртгэсэн</Th>
              <Th>Төлөв</Th>
              {canReverse ? <Th align="right">Үйлдэл</Th> : null}
            </tr>
          </thead>
          <tbody>
            {payable.payments.map((payment) => (
              <Tr key={payment.id}>
                <Td className="whitespace-nowrap">{payment.paidAtLabel}</Td>
                <Td>{PAYMENT_ACCOUNT_LABEL[payment.account]}</Td>
                <Td
                  align="right"
                  className={
                    payment.status === "REVERSED"
                      ? "text-ink-400 line-through"
                      : "font-medium"
                  }
                >
                  {formatMoney(payment.amount)}
                </Td>
                <Td className="text-ink-500">
                  {[payment.reference, payment.note].filter(Boolean).join(" · ") || "—"}
                </Td>
                <Td className="text-ink-500">{payment.createdByName}</Td>
                <Td>
                  {payment.status === "REVERSED" ? (
                    <span className="text-[13px] text-ink-500">
                      Буцаагдсан
                      {payment.reversedByName ? ` · ${payment.reversedByName}` : ""}
                      {payment.reversedAtLabel ? ` · ${payment.reversedAtLabel}` : ""}
                    </span>
                  ) : (
                    <Badge tone="success" dot>
                      Батлагдсан
                    </Badge>
                  )}
                </Td>
                {canReverse ? (
                  <Td align="right">
                    {payment.status === "POSTED" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReverseId(payment.id)}
                        className="text-red-700 hover:bg-red-50"
                      >
                        Буцаах
                      </Button>
                    ) : null}
                  </Td>
                ) : null}
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="border-t border-ink-200 px-5 py-4 text-[13px] text-ink-500">
          Төлбөр хараахан бүртгэгдээгүй.
        </p>
      )}

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        payable={payable}
        today={today}
        action={payAction}
      />

      <ReverseModal
        paymentId={reverseId}
        onClose={() => setReverseId(null)}
        action={reverseAction}
      />
    </Card>
  );
}

/**
 * Төлбөр бүртгэх модал.
 *
 * Анхдагч дүн нь ҮЛДЭГДЭЛ — ихэнх тохиолдолд бүтэн төлнө. Багасгаж болно
 * (хэсэгчилсэн төлөлт), нэмэгдүүлж БОЛОХГҮЙ. Клиент талын хязгаар нь зөвхөн
 * тав тухын үүднээс: сервер тал үлдэгдлийг түгжсэн байдлаар дахин шалгана.
 */
function PaymentModal({
  open,
  onClose,
  payable,
  today,
  action,
}: {
  open: boolean;
  onClose: () => void;
  payable: ClientPayable;
  today: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, IDLE);
  const [amount, setAmount] = useState(String(payable.outstanding));
  /**
   * Давхар дарахаас хамгаалах түлхүүр. Модал нээгдэх бүрд шинэ түлхүүр —
   * нэг нээлт = нэг төлбөр. Сервер тал ижил түлхүүрээр хоёр дахь төлбөр
   * үүсгэхгүй.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);

  useEffect(() => {
    if (!open) return;
    setAmount(String(payable.outstanding));
    setIdempotencyKey(newKey());
  }, [open, payable.outstanding]);

  // Амжилттай болмогц модалыг хаана — хуудас сервер талаас шинэчлэгдэнэ.
  useEffect(() => {
    if (state.status === "success") onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- зөвхөн төлөв солигдоход
  }, [state]);

  const parsed = Number(amount.replace(/\s|,/g, ""));
  const tooMuch = Number.isFinite(parsed) && parsed > payable.outstanding;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Нийлүүлэгчид төлбөр хийх"
      description={`${payable.purchaseNo} · ${payable.supplierName}`}
    >
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="payableId" value={payable.id} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

        {state.status === "error" && state.message ? (
          <Alert tone="error">{state.message}</Alert>
        ) : (
          <Alert tone="info" icon={false}>
            Үлдэгдэл: <strong className="tabular">{formatMoney(payable.outstanding)}</strong>. Энэ
            төлбөр нь шинэ зардал үүсгэхгүй — зөвхөн мөнгө гарч, өр буурна.
          </Alert>
        )}

        <FieldGrid columns={2}>
          <Field
            label="Төлөх дүн"
            htmlFor="payment-amount"
            required
            error={
              tooMuch
                ? [`Үлдэгдлээс хэтэрсэн. Дээд тал нь ${formatMoney(payable.outstanding)}.`]
                : state.fieldErrors?.amount
            }
            hint="Хэсэгчлэн төлж болно. Үлдэгдлээс хэтэрч болохгүй."
          >
            <NumberInput
              id="payment-amount"
              name="amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              min="0"
              max={payable.outstanding}
              step="0.01"
              required
            />
          </Field>
          <Field label="Данс" htmlFor="payment-account" required>
            <Select id="payment-account" name="account" defaultValue="CASH">
              <option value="CASH">Касс</option>
              <option value="BANK">Банк</option>
            </Select>
          </Field>
          <Field label="Төлсөн огноо" htmlFor="payment-date" required error={state.fieldErrors?.paidAt}>
            <Input id="payment-date" name="paidAt" type="date" defaultValue={today} required />
          </Field>
          <Field label="Гүйлгээний дугаар" htmlFor="payment-reference">
            <Input id="payment-reference" name="reference" placeholder="Сонголтоор" />
          </Field>
        </FieldGrid>

        <Field label="Тайлбар" htmlFor="payment-note">
          <Textarea id="payment-note" name="note" rows={2} placeholder="Сонголтоор" />
        </Field>

        <ModalActions>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Болих
          </Button>
          <SubmitButton pendingText="Бүртгэж байна..." disabled={tooMuch}>
            Төлбөр бүртгэх
          </SubmitButton>
        </ModalActions>
      </form>
    </Modal>
  );
}

/** Төлбөр буцаах — зөвхөн эзэн. Бичлэг устахгүй, эсрэг гүйлгээ үүснэ. */
function ReverseModal({
  paymentId,
  onClose,
  action,
}: {
  paymentId: string | null;
  onClose: () => void;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, IDLE);

  useEffect(() => {
    if (state.status === "success") onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- зөвхөн төлөв солигдоход
  }, [state]);

  return (
    <Modal
      open={paymentId !== null}
      onClose={onClose}
      title="Төлбөр буцаах"
      description="Бичлэг устахгүй. Эсрэг мөнгөн гүйлгээ үүсч, өглөгийн үлдэгдэл сэргэнэ."
      tone="danger"
    >
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="paymentId" value={paymentId ?? ""} />

        {state.status === "error" && state.message ? (
          <Alert tone="error">{state.message}</Alert>
        ) : null}

        <Field label="Шалтгаан" htmlFor="reverse-note" required error={state.fieldErrors?.note}>
          <Textarea id="reverse-note" name="note" required placeholder="Жишээ: буруу бүртгэсэн" />
        </Field>

        <ModalActions>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Болих
          </Button>
          <SubmitButton variant="danger" pendingText="Буцааж байна...">
            Буцаахыг баталгаажуулах
          </SubmitButton>
        </ModalActions>
      </form>
    </Modal>
  );
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
