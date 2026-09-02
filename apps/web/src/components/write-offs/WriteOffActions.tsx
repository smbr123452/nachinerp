"use client";

import { useActionState, useState } from "react";
import type { DocStatus } from "@prisma/client";
import { Undo2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Textarea } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IDLE, type ActionState } from "@/lib/action-state";
import type { WriteOffContext } from "@/lib/write-offs";
import {
  deleteWriteOffAction,
  postWriteOffAction,
  reverseWriteOffAction,
} from "@/app/(app)/write-off-actions";
import { ConfirmWriteOffModal, type ConfirmLine } from "./ConfirmWriteOffModal";

/**
 * Актын үйлдлүүд.
 *
 * Товч нуух нь хамгаалалт БИШ — буцаах үйлдэл сервер талд requireOwner()-ээр
 * хамгаалагдсан. Энд эрхийг зөвхөн харагдац төдийд шалгана.
 */
export function WriteOffActions({
  context,
  writeOffId,
  documentNo,
  status,
  reasonLabel,
  note,
  isOwner,
  lines,
  totalCost,
}: {
  context: WriteOffContext;
  writeOffId: string;
  documentNo: string;
  status: DocStatus;
  reasonLabel: string;
  note: string | null;
  isOwner: boolean;
  lines: ConfirmLine[];
  totalCost: number;
}) {
  const [postState, postAction, posting] = useActionState<ActionState, FormData>(
    postWriteOffAction,
    IDLE,
  );
  const [deleteState, deleteAction, deleting] = useActionState<ActionState, FormData>(
    deleteWriteOffAction,
    IDLE,
  );
  const [reverseState, reverseAction, reversing] = useActionState<ActionState, FormData>(
    reverseWriteOffAction,
    IDLE,
  );

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);

  // Формын хуулбар бүр НЭГ түлхүүртэй. Хоёр дахин дарах, сүлжээ давтан
  // илгээх зэрэгт ижил түлхүүр очиж, сервер тал шинэ хөдөлгөөн үүсгэхгүй.
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${writeOffId}-${Date.now()}`,
  );

  const error = postState.status === "error" ? postState : deleteState.status === "error" ? deleteState : reverseState.status === "error" ? reverseState : null;
  const success = postState.status === "success" ? postState : reverseState.status === "success" ? reverseState : null;

  if (status === "DRAFT") {
    return (
      <>
        <Card>
          <CardHeader title="Үйлдэл" />
          <CardBody className="space-y-3">
            {error ? <Alert tone="error">{error.message}</Alert> : null}
            {success ? <Alert tone="success">{success.message}</Alert> : null}

            <p className="text-[13px] leading-5 text-ink-500">
              Энэ акт ноорог байна — нөөцөд хараахан нөлөөлөөгүй. Батласны дараа засах боломжгүй.
            </p>

            <form action={postAction}>
              <input type="hidden" name="writeOffId" value={writeOffId} />
              <input type="hidden" name="context" value={context} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <Button
                type="button"
                className="w-full"
                disabled={posting || lines.length === 0}
                onClick={() => setConfirmOpen(true)}
              >
                АКТ батлах
              </Button>
              <button id="post-submit" type="submit" hidden aria-hidden tabIndex={-1} />
            </form>

            <form action={deleteAction}>
              <input type="hidden" name="writeOffId" value={writeOffId} />
              <input type="hidden" name="context" value={context} />
              <Button type="submit" variant="ghost" size="sm" className="w-full" disabled={deleting}>
                Ноорог устгах
              </Button>
            </form>
          </CardBody>
        </Card>

        <ConfirmWriteOffModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="АКТ батлах"
          confirmLabel="Батлах"
          documentNo={documentNo}
          reasonLabel={reasonLabel}
          note={note}
          lines={lines}
          totalCost={totalCost}
          pending={posting}
          onConfirm={() => {
            setConfirmOpen(false);
            document.getElementById("post-submit")?.click();
          }}
        />
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader title="Үйлдэл" />
        <CardBody className="space-y-3">
          {error ? <Alert tone="error">{error.message}</Alert> : null}
          {success ? <Alert tone="success">{success.message}</Alert> : null}

          {status === "POSTED" ? (
            isOwner ? (
              <>
                <p className="text-[13px] leading-5 text-ink-500">
                  Буцаалт нь эсрэг хөдөлгөөн үүсгэж, барааг эх өртгөөр нь нөөцөд сэргээнэ. Энэ
                  баримт устахгүй.
                </p>
                <Button
                  type="button"
                  variant="danger"
                  className="w-full"
                  disabled={reversing}
                  onClick={() => setReverseOpen(true)}
                >
                  <Undo2 className="h-4 w-4" />
                  АКТ буцаах
                </Button>
              </>
            ) : (
              <p className="text-[13px] leading-5 text-ink-500">
                Батлагдсан актыг зөвхөн байгууллагын эзэн буцаана.
              </p>
            )
          ) : (
            <p className="text-[13px] leading-5 text-ink-500">
              Энэ акт буцаагдсан. Нэмэлт үйлдэл байхгүй.
            </p>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={reverseOpen}
        onClose={() => setReverseOpen(false)}
        title="АКТ буцаах"
        description={`${documentNo} — хасагдсан бараа нөөцөд эх өртгөөрөө буцаж орно.`}
        confirmLabel="Буцаахыг батлах"
        pendingLabel="Буцааж байна..."
        cancelLabel="Буцах"
        disabled={reversing}
        hiddenFields={{ writeOffId, context }}
        action={reverseAction}
      >
        <Field label="Шалтгаан" htmlFor="reverse-note" hint="Заавал биш, гэхдээ аудитад үлдэнэ.">
          <Textarea id="reverse-note" name="note" rows={2} placeholder="Жишээ: буруу бүртгэсэн." />
        </Field>
      </ConfirmDialog>
    </>
  );
}
