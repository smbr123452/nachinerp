"use client";

import type { ReactNode } from "react";
import { Button, SubmitButton } from "./Button";
import { Modal, ModalFooter } from "./Modal";

/**
 * Эргэлт буцалтгүй үйлдлийн НЭГДСЭН баталгаажуулалт — устгах, цуцлах,
 * буцаах бүгд ижил хэлбэртэй.
 *
 * Шатлал: дүрс тэмдэг → гарчиг → тайлбар → (шаардлагатай бол оролт) →
 * үйлдэл. Улаан өнгө нь зөвхөн дүрс тэмдэг ба эцсийн товчинд гарна;
 * гарчиг, дэвсгэр саармаг хэвээр байснаар текст уншихад амар үлдэнэ.
 *
 * Товч нуух нь хамгаалалт БИШ — эрхийн шалгалт server action дотор хийгдэнэ.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Болих",
  action,
  hiddenFields,
  children,
  disabled = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  /** Формын үйлдэл. Модал нь зөвхөн харагдац — шалгалт сервер талд. */
  action: (formData: FormData) => void | Promise<void>;
  /** Формтой хамт илгээх нуугдмал утгууд. */
  hiddenFields?: Record<string, string>;
  /** Нэмэлт агуулга: алдааны мэдэгдэл, шалтгааны талбар гэх мэт. */
  children?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      tone="danger"
      size="sm"
      bodyClassName="p-0"
    >
      <form action={action}>
        {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        {children ? <div className="space-y-3.5 px-5 pb-4">{children}</div> : null}

        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <SubmitButton variant="dangerSolid" pendingText={pendingLabel} disabled={disabled}>
            {confirmLabel}
          </SubmitButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}
