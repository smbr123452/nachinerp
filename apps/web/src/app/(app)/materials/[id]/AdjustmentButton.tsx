"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { IDLE, type ActionState } from "@/lib/action-state";
import { manualAdjustmentAction } from "../actions";

const OPTIONS = [
  { value: "MANUAL_ADJUSTMENT_IN", label: "Гар тохируулга — нэмэх" },
  { value: "MANUAL_ADJUSTMENT_OUT", label: "Гар тохируулга — хасах" },
  { value: "WASTE_OUT", label: "Хаягдал" },
  { value: "RETURN_IN", label: "Буцаалт — орлого" },
  { value: "INTERNAL_USE_OUT", label: "Дотоод хэрэглээ" },
];

export function AdjustmentButton({
  rawMaterialId,
  materialName,
  unit,
}: {
  rawMaterialId: string;
  materialName: string;
  unit: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(manualAdjustmentAction, IDLE);

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state]);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Нөөц тохируулах
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${materialName} — нөөцийн тохируулга`}
        description="Тохируулга бүр нөөцийн хөдөлгөөн болон аудитад бүртгэгдэнэ."
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="rawMaterialId" value={rawMaterialId} />
          {state.status === "error" && state.message ? (
            <Alert tone="error">{state.message}</Alert>
          ) : null}

          <Field label="Төрөл" htmlFor="movementType" required>
            <Select id="movementType" name="movementType" defaultValue="MANUAL_ADJUSTMENT_IN">
              {OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={`Тоо хэмжээ (${unit})`}
            htmlFor="quantity"
            required
            error={state.fieldErrors?.quantity}
          >
            <Input id="quantity" name="quantity" inputMode="decimal" required placeholder="0" />
          </Field>

          <Field label="Шалтгаан" htmlFor="adjust-note" required error={state.fieldErrors?.note}>
            <Textarea id="adjust-note" name="note" required placeholder="Жишээ: чанар алдагдсан" />
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
