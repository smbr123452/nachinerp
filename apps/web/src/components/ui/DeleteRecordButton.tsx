"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { IDLE, type ActionState } from "@/lib/action-state";

/**
 * Бүр мөсөн устгах товч — ЗӨВХӨН эзэнд харагдана.
 *
 * ЧУХАЛ: энэ бүрэлдэхүүн хэсэг нь харагдацын давхарга. Жинхэнэ хамгаалалт
 * нь server action доторх requireOwner() ба үйлчилгээний давхаргын
 * түүхийн шалгалт. Товчийг нуух нь хамгаалалт БИШ.
 *
 * blocked үнэн бол товч идэвхгүй — гэхдээ сервер ямар ч тохиолдолд
 * дахин шалгана.
 */
export function DeleteRecordButton({
  id,
  action,
  title,
  description,
  blocked = false,
  blockedReason,
  label = "Устгах",
}: {
  id: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  title: string;
  description: string;
  blocked?: boolean;
  blockedReason?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(action, IDLE);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<Trash2 />}
        disabled={blocked}
        title={blocked ? blockedReason : title}
        onClick={() => setOpen(true)}
        className={blocked ? undefined : "text-red-600 hover:bg-red-50 hover:text-red-700"}
      >
        {label}
      </Button>

      {state.status === "error" && state.message ? (
        <Alert tone="error" className="mt-2">
          {state.message}
        </Alert>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        tone="danger"
      >
        <form
          action={(formData) => {
            setOpen(false);
            formAction(formData);
          }}
        >
          <input type="hidden" name="id" value={id} />
          <ModalActions>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <SubmitButton variant="danger">Устгах</SubmitButton>
          </ModalActions>
        </form>
      </Modal>
    </>
  );
}
