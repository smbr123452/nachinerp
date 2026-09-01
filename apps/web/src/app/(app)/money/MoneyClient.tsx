"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { IDLE, type ActionState } from "@/lib/action-state";
import { formatMoney } from "@/lib/format";
import { bankDepositAction, moneyAdjustmentAction } from "./actions";

export function BankDepositButton({
  pendingAmount,
  today,
}: {
  pendingAmount: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(bankDepositAction, IDLE);

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state]);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Банкинд тушаах</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Банкны тушаалт"
        description="Кассын бэлэн мөнгө банкны данс руу шилжинэ."
      >
        <form action={formAction} className="space-y-4">
          {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}

          <Alert tone="info">
            Тушаах боломжтой бэлэн мөнгө: <strong>{formatMoney(pendingAmount)}</strong>
          </Alert>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Огноо" htmlFor="deposit-date" required error={state.fieldErrors?.date}>
              <Input id="deposit-date" name="date" type="date" defaultValue={today} required />
            </Field>
            <Field label="Дүн (₮)" htmlFor="deposit-amount" required error={state.fieldErrors?.amount}>
              <Input
                id="deposit-amount"
                name="amount"
                inputMode="decimal"
                defaultValue={pendingAmount}
                required
              />
            </Field>
          </div>
          <Field label="Тайлбар" htmlFor="deposit-note">
            <Input id="deposit-note" name="note" placeholder="Сонголтоор" />
          </Field>

          <ModalActions>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <SubmitButton>Тушаалт бүртгэх</SubmitButton>
          </ModalActions>
        </form>
      </Modal>
    </>
  );
}

export function MoneyAdjustmentButton({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(moneyAdjustmentAction, IDLE);

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state]);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Тооцоо тулгах
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Мөнгөн тохируулга"
        description="Бодит үлдэгдэлтэй тулгах засвар. Аудитад бүртгэгдэнэ."
      >
        <form action={formAction} className="space-y-4">
          {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Огноо" htmlFor="adj-date" required error={state.fieldErrors?.date}>
              <Input id="adj-date" name="date" type="date" defaultValue={today} required />
            </Field>
            <Field label="Данс" htmlFor="adj-account" required>
              <Select id="adj-account" name="account" defaultValue="CASH">
                <option value="CASH">Касс</option>
                <option value="BANK">Банк</option>
              </Select>
            </Field>
            <Field label="Чиглэл" htmlFor="adj-direction" required>
              <Select id="adj-direction" name="direction" defaultValue="IN">
                <option value="IN">Нэмэх</option>
                <option value="OUT">Хасах</option>
              </Select>
            </Field>
            <Field label="Дүн (₮)" htmlFor="adj-amount" required error={state.fieldErrors?.amount}>
              <Input id="adj-amount" name="amount" inputMode="decimal" required placeholder="0" />
            </Field>
          </div>
          <Field label="Тайлбар" htmlFor="adj-note" required error={state.fieldErrors?.note}>
            <Textarea id="adj-note" name="note" required placeholder="Тохируулгын шалтгаан" />
          </Field>

          <ModalActions>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <SubmitButton>Бүртгэх</SubmitButton>
          </ModalActions>
        </form>
      </Modal>
    </>
  );
}
