"use client";

import { useActionState, useState } from "react";
import { Alert } from "./Alert";
import { Button, SubmitButton } from "./Button";
import { Field, Textarea } from "./Field";
import { Modal } from "./Modal";
import { IDLE, type ActionState } from "@/lib/action-state";

/**
 * Санхүү / нөөцийн баримтыг ЦУЦЛАХ баталгаажуулалт.
 * Устгах биш — шалтгаан заавал бичих ба аудитад бүртгэгдэнэ.
 */
export function CancelDocumentButton({
  id,
  action,
  title = "Баримт цуцлах",
  description = "Энэ баримт устахгүй. Цуцлалтын бичилт үүсч, нөөц болон мөнгөний хөдөлгөөн буцаагдана.",
  buttonLabel = "Цуцлах",
}: {
  id: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  title?: string;
  description?: string;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(action, IDLE);

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description={description}>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          {state.status === "error" && state.message ? (
            <Alert tone="error">{state.message}</Alert>
          ) : null}
          <Field label="Шалтгаан" htmlFor="cancel-note" required error={state.fieldErrors?.note}>
            <Textarea id="cancel-note" name="note" required placeholder="Жишээ: буруу бүртгэсэн" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <SubmitButton variant="danger" pendingText="Цуцалж байна...">
              Цуцлахыг баталгаажуулах
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
