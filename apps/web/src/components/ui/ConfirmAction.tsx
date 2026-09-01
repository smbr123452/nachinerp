"use client";

import { useActionState, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Alert } from "./Alert";
import { Button, SubmitButton } from "./Button";
import { Field, Textarea } from "./Field";
import { Modal, ModalActions } from "./Modal";
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
  size = "sm",
}: {
  id: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  title?: string;
  description?: string;
  buttonLabel?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(action, IDLE);

  return (
    <>
      <Button variant="danger" size={size} onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        tone="danger"
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={id} />

          {state.status === "error" && state.message ? (
            <Alert tone="error">{state.message}</Alert>
          ) : (
            <Alert tone="warning" icon={false}>
              <span className="flex items-start gap-2">
                <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                Энэ үйлдлийг буцаах боломжгүй. Шалтгаан нь аудитын түүхэд хадгалагдана.
              </span>
            </Alert>
          )}

          <Field label="Шалтгаан" htmlFor="cancel-note" required error={state.fieldErrors?.note}>
            <Textarea id="cancel-note" name="note" required placeholder="Жишээ: буруу бүртгэсэн" />
          </Field>

          <ModalActions>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <SubmitButton variant="danger" pendingText="Цуцалж байна...">
              Цуцлахыг баталгаажуулах
            </SubmitButton>
          </ModalActions>
        </form>
      </Modal>
    </>
  );
}
