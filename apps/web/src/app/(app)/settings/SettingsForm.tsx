"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { IDLE, type ActionState } from "@/lib/action-state";
import { updateSettingsAction } from "./actions";

export function SettingsForm({
  companyName,
  allowNegativeStock,
}: {
  companyName: string;
  allowNegativeStock: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateSettingsAction, IDLE);

  return (
    <form action={formAction} className="space-y-4">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {state.status === "success" && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <Field label="Байгууллагын нэр" htmlFor="companyName" required>
        <Input id="companyName" name="companyName" defaultValue={companyName} required />
      </Field>

      <div className="rounded-lg border border-ink-200 p-4">
        <Checkbox
          label="Нөөц хүрэлцэхгүй үед борлуулалт баталгаажуулахыг зөвшөөрөх"
          name="allowNegativeStock"
          defaultChecked={allowNegativeStock}
        />
        <p className="mt-2 text-xs text-ink-500">
          Анхдагчаар хаалттай. Асаавал үлдэгдэл сөрөг болох боломжтой тул зөвхөн онцгой тохиолдолд ашиглана уу.
        </p>
      </div>

      <div className="flex justify-end">
        <SubmitButton>Тохиргоо хадгалах</SubmitButton>
      </div>
    </form>
  );
}
