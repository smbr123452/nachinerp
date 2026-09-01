"use client";

import { useActionState, useEffect } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { ModalActions } from "@/components/ui/Modal";
import { IDLE, type ActionState } from "@/lib/action-state";

export type SupplierFormValues = {
  id: string;
  name: string;
  phone: string | null;
  contactPerson: string | null;
  email: string | null;
  note: string | null;
};

/**
 * Нийлүүлэгчийн мастер өгөгдлийн форм. Нэмэх ба засахад НЭГ ижил форм.
 *
 * onSuccess нь амжилттай хариуг хүлээн авна — худалдан авалтын форм дотор
 * шинээр үүсгэсэн нийлүүлэгчийг шууд сонгоход ашиглагдана.
 */
export function SupplierForm({
  action,
  initial,
  onDone,
  onSuccess,
  submitLabel = "Хадгалах",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: SupplierFormValues;
  onDone: () => void;
  onSuccess?: (data: unknown) => void;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, IDLE);

  useEffect(() => {
    if (state.status !== "success") return;
    onSuccess?.(state.data);
    onDone();
  }, [state, onDone, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <Field label="Нийлүүлэгчийн нэр" htmlFor="supplier-name" required error={state.fieldErrors?.name}>
        <Input
          id="supplier-name"
          name="name"
          required
          defaultValue={initial?.name}
          placeholder="Алтан Тариа ХХК"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Утас" htmlFor="supplier-phone" error={state.fieldErrors?.phone}>
          <Input
            id="supplier-phone"
            name="phone"
            defaultValue={initial?.phone ?? ""}
            placeholder="99112233"
          />
        </Field>
        <Field
          label="Холбоо барих хүн"
          htmlFor="supplier-contact"
          error={state.fieldErrors?.contactPerson}
        >
          <Input
            id="supplier-contact"
            name="contactPerson"
            defaultValue={initial?.contactPerson ?? ""}
            placeholder="Болд"
          />
        </Field>
      </div>

      <Field label="И-мэйл" htmlFor="supplier-email" error={state.fieldErrors?.email}>
        <Input
          id="supplier-email"
          name="email"
          type="email"
          defaultValue={initial?.email ?? ""}
          placeholder="info@example.mn"
        />
      </Field>

      <Field label="Тэмдэглэл" htmlFor="supplier-note" error={state.fieldErrors?.note}>
        <Textarea id="supplier-note" name="note" rows={2} defaultValue={initial?.note ?? ""} />
      </Field>

      <ModalActions>
        <Button variant="secondary" onClick={onDone}>
          Болих
        </Button>
        <SubmitButton>{submitLabel}</SubmitButton>
      </ModalActions>
    </form>
  );
}
