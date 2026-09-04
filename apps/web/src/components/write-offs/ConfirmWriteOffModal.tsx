"use client";

import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatMoney, formatQty } from "@/lib/format";
import { unitLabel } from "@/lib/units";

export type ConfirmLine = {
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  total: number;
};

/**
 * Батлахын өмнөх эцсийн хяналт.
 *
 * Санамсаргүй батлахаас сэргийлэх зорилготой: юу хасагдахыг бүрэн харуулж,
 * буцаах боломжгүй болохыг тодорхой хэлнэ.
 */
export function ConfirmWriteOffModal({
  open,
  onClose,
  onConfirm,
  title,
  confirmLabel,
  documentNo,
  reasonLabel,
  note,
  lines,
  totalCost,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  confirmLabel: string;
  documentNo: string | null;
  reasonLabel: string;
  note?: string | null;
  lines: ConfirmLine[];
  totalCost: number;
  pending: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      tone="danger"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Буцах
          </Button>
          <Button onClick={onConfirm} disabled={pending} loading={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {documentNo ? (
          <div className="tabular text-title font-semibold text-ink-900">{documentNo}</div>
        ) : null}

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-ink-500">Шалтгаан</dt>
          <dd className="font-medium text-ink-900">{reasonLabel}</dd>
          {note?.trim() ? (
            <>
              <dt className="text-ink-500">Тайлбар</dt>
              <dd className="text-ink-800">{note.trim()}</dd>
            </>
          ) : null}
          <dt className="text-ink-500">Барааны төрөл</dt>
          <dd className="text-ink-800">{lines.length}</dd>
        </dl>

        <ul className="divide-y divide-ink-200 rounded-card border border-ink-200">
          {lines.map((line, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-ink-800">{line.name}</span>
              <span className="tabular shrink-0 text-ink-500">
                {formatQty(line.quantity)} {unitLabel(line.unit as never)} ×{" "}
                {formatMoney(line.unitCost)}
              </span>
              <span className="tabular w-24 shrink-0 text-right font-medium text-ink-900">
                {formatMoney(line.total)}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-baseline justify-between border-t border-ink-200 pt-3">
          <span className="text-sm text-ink-500">Нийт өртөг</span>
          <span className="tabular text-figure font-semibold text-ink-900">
            {formatMoney(totalCost)}
          </span>
        </div>

        <div className="flex gap-2.5 rounded-card border border-amber-200 bg-amber-50 p-3 text-body leading-5 text-amber-900">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Эдгээр бараа агуулахын үлдэгдлээс хасагдана. Баталсны дараа АКТ-ыг засах боломжгүй.
          </span>
        </div>
      </div>
    </Modal>
  );
}
