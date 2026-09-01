"use client";

import { useActionState, useState } from "react";
import { Power, RotateCcw } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { IDLE, type ActionState } from "@/lib/action-state";
import { setSupplierActiveAction } from "../actions";

/** Идэвхтэй / идэвхгүй төлөв солих. OWNER ба MANAGER хоёуланд нээлттэй. */
export function ToggleSupplierActiveButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(setSupplierActiveAction, IDLE);
  const [dismissed, setDismissed] = useState(false);

  return (
    <>
      <form action={formAction} className="inline-flex">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="isActive" value={String(!isActive)} />
        <SubmitButton
          variant="secondary"
          icon={isActive ? <Power /> : <RotateCcw />}
          onClick={() => setDismissed(false)}
        >
          {isActive ? "Идэвхгүй болгох" : "Идэвхжүүлэх"}
        </SubmitButton>
      </form>
      {state.status === "error" && state.message && !dismissed ? (
        <Alert tone="error" className="mt-2">
          {state.message}
        </Alert>
      ) : null}
    </>
  );
}
