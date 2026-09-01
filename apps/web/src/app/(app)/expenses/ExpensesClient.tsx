"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { IDLE, type ActionState } from "@/lib/action-state";
import {
  createExpenseAction,
  createExpenseCategoryAction,
  toggleExpenseCategoryAction,
} from "./actions";

type Category = { id: string; name: string };

export function NewExpenseButton({ categories, today }: { categories: Category[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(createExpenseAction, IDLE);

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state]);

  return (
    <>
      <Button icon={<Plus />} onClick={() => setOpen(true)} disabled={categories.length === 0}>
        Зардал бүртгэх
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Шинэ зардал"
        description="Бараа материалын худалдан авалтыг 'Худалдан авалт' хэсэгт бүртгэнэ."
        size="lg"
      >
        <form action={formAction} className="space-y-4">
          {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Огноо" htmlFor="expense-date" required error={state.fieldErrors?.date}>
              <Input id="expense-date" name="date" type="date" defaultValue={today} required />
            </Field>
            <Field label="Ангилал" htmlFor="expense-category" required error={state.fieldErrors?.categoryId}>
              <Select id="expense-category" name="categoryId" required defaultValue="">
                <option value="" disabled>
                  — Сонгох —
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Дүн (₮)" htmlFor="expense-amount" required error={state.fieldErrors?.amount}>
              <Input id="expense-amount" name="amount" inputMode="decimal" required placeholder="0" />
            </Field>
            <Field label="Төлсөн данс" htmlFor="expense-account" required>
              <Select id="expense-account" name="account" defaultValue="CASH">
                <option value="CASH">Касс (бэлэн)</option>
                <option value="BANK">Банк</option>
              </Select>
            </Field>
            <Field label="Тайлбар" htmlFor="expense-description" className="sm:col-span-2">
              <Textarea id="expense-description" name="description" placeholder="Сонголтоор" />
            </Field>
            <Field
              label="Баримтын зураг (холбоос)"
              htmlFor="expense-receipt"
              className="sm:col-span-2"
              hint="Сонголтоор — баримтын зургийн холбоос."
            >
              <Input id="expense-receipt" name="receiptUrl" placeholder="https://..." />
            </Field>
          </div>

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

export function NewExpenseCategoryButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(createExpenseCategoryAction, IDLE);

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state]);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Ангилал нэмэх
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Зардлын ангилал">
        <form action={formAction} className="space-y-4">
          {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
          <Field label="Нэр" htmlFor="expense-category-name" required error={state.fieldErrors?.name}>
            <Input id="expense-category-name" name="name" required placeholder="Түлш" />
          </Field>
          <ModalActions>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <SubmitButton>Хадгалах</SubmitButton>
          </ModalActions>
        </form>
      </Modal>
    </>
  );
}

export function ToggleCategoryButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(toggleExpenseCategoryAction, IDLE);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      {state.status === "error" && state.message ? (
        <span className="mr-2 text-xs text-red-600">{state.message}</span>
      ) : null}
      <SubmitButton variant="secondary" size="sm" pendingText="...">
        {isActive ? "Идэвхгүй болгох" : "Идэвхжүүлэх"}
      </SubmitButton>
    </form>
  );
}
