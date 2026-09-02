"use client";

import { useActionState, useState } from "react";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { Field, Textarea } from "./Field";
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
  variant = "danger",
}: {
  id: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  title?: string;
  description?: string;
  buttonLabel?: string;
  size?: "sm" | "md";
  /**
   * danger — хуудасны гол устгах/цуцлах үйлдэл (баримтын дэлгэрэнгүй).
   * ghost — хүснэгтийн мөр бүрд давтагдах үйлдэл: улаан товч мөр болж
   * эгнэвэл хуудасны хамгийн тод элемент нь цуцлалт болно.
   */
  variant?: "danger" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(action, IDLE);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className={variant === "ghost" ? "text-ink-500 hover:bg-red-50 hover:text-red-700" : undefined}
      >
        {buttonLabel}
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        confirmLabel="Цуцлахыг баталгаажуулах"
        pendingLabel="Цуцалж байна..."
        hiddenFields={{ id }}
        action={formAction}
      >
        {state.status === "error" && state.message ? (
          <Alert tone="error">{state.message}</Alert>
        ) : null}

        <Field label="Шалтгаан" htmlFor="cancel-note" required error={state.fieldErrors?.note}>
          <Textarea id="cancel-note" name="note" required placeholder="Жишээ: буруу бүртгэсэн" />
        </Field>

        <p className="text-xs leading-5 text-ink-500">
          Энэ үйлдлийг буцаах боломжгүй. Шалтгаан нь аудитын түүхэд хадгалагдана.
        </p>
      </ConfirmDialog>
    </>
  );
}
