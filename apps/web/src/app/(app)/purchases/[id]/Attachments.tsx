"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FileText, ImageIcon, Trash2, Upload } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { IDLE, type ActionState } from "@/lib/action-state";
import { formatDateTime } from "@/lib/format";
import {
  deletePurchaseAttachmentAction,
  uploadPurchaseAttachmentAction,
} from "../attachment-actions";

export type AttachmentView = {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedByName: string;
  isImage: boolean;
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Худалдан авалтын баримтын зураг / нэхэмжлэх.
 *
 * Файлууд нь /api/attachments/[id] дундуур л татагдана — шууд, таамаглаж
 * болох URL байхгүй, нэвтэрсэн хэрэглэгч л хандана.
 * canDelete нь зөвхөн товч нуух зорилготой; жинхэнэ хамгаалалт серверт.
 */
export function PurchaseAttachments({
  purchaseId,
  attachments,
  canDelete,
}: {
  purchaseId: string;
  attachments: AttachmentView[];
  canDelete: boolean;
}) {
  const [uploadState, uploadAction] = useActionState<ActionState, FormData>(
    uploadPurchaseAttachmentAction,
    IDLE,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [fileCount, setFileCount] = useState(0);

  useEffect(() => {
    if (uploadState.status === "success") {
      formRef.current?.reset();
      setFileCount(0);
    }
  }, [uploadState]);

  return (
    <div className="space-y-4">
      {uploadState.status === "error" && uploadState.message ? (
        <Alert tone="error">{uploadState.message}</Alert>
      ) : null}

      {attachments.length === 0 ? (
        <p className="text-[13px] text-ink-500">Хавсралт нэмэгдээгүй байна.</p>
      ) : (
        <ul className="divide-y divide-ink-200 rounded-lg border border-ink-200">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <span aria-hidden className="text-ink-400">
                {attachment.isImage ? (
                  <ImageIcon className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
              </span>
              <a
                href={`/api/attachments/${attachment.id}`}
                className="min-w-0 flex-1 truncate text-sm font-medium text-brand-600 underline-offset-4 hover:underline"
              >
                {attachment.originalFileName}
              </a>
              <span className="text-[13px] tabular-nums text-ink-500">
                {formatSize(attachment.fileSize)}
              </span>
              <span className="text-[13px] text-ink-500">
                {attachment.uploadedByName} · {formatDateTime(attachment.uploadedAt)}
              </span>
              {canDelete ? <DeleteAttachmentButton attachment={attachment} /> : null}
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} action={uploadAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="purchaseId" value={purchaseId} />
        <input
          type="file"
          name="files"
          multiple
          accept={ACCEPT}
          onChange={(event) => setFileCount(event.target.files?.length ?? 0)}
          className={
            "min-w-0 flex-1 text-[13px] text-ink-600 file:mr-3 file:rounded-lg file:border " +
            "file:border-ink-300 file:bg-white file:px-3 file:py-1.5 file:text-[13px] " +
            "file:font-medium file:text-ink-700 hover:file:bg-ink-50"
          }
        />
        <SubmitButton size="sm" icon={<Upload />} disabled={fileCount === 0}>
          Хавсаргах
        </SubmitButton>
      </form>
      <p className="text-[13px] text-ink-500">
        JPEG, PNG, WebP, HEIC, PDF · нэг файл 10MB хүртэл · нэг баримтад 10 хавсралт хүртэл.
      </p>
    </div>
  );
}

function DeleteAttachmentButton({ attachment }: { attachment: AttachmentView }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(
    deletePurchaseAttachmentAction,
    IDLE,
  );

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={<Trash2 />}
        onClick={() => setOpen(true)}
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        Устгах
      </Button>
      {state.status === "error" && state.message ? (
        <Alert tone="error" className="w-full">
          {state.message}
        </Alert>
      ) : null}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Хавсралт устгах"
        description={`"${attachment.originalFileName}" файлыг устгах уу? Энэ үйлдлийг буцаах боломжгүй.`}
        tone="danger"
      >
        <form
          action={(formData) => {
            setOpen(false);
            formAction(formData);
          }}
        >
          <input type="hidden" name="attachmentId" value={attachment.id} />
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
