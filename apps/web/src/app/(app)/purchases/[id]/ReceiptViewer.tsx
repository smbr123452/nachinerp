"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { formatDateTime } from "@/lib/format";

export type ReceiptView = {
  id: string;
  originalFileName: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedByName: string;
  isImage: boolean;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Баталгаажсан баримтын хавсралт — ЗӨВХӨН харах.
 *
 * Нэмэх, устгах товч байхгүй: баталгаажсаны дараа баримтын зураг бусад
 * мэдээлэлтэй адил өөрчлөгдөхгүй (сервер тал дээр ч хоригдсон).
 *
 * Зургийг дарвал томоор харна. Файл нь /api/attachments/[id] дундуур л
 * дамжина — нэвтэрсэн хэрэглэгч л үзнэ.
 */
export function ReceiptViewer({ attachments }: { attachments: ReceiptView[] }) {
  const [zoomed, setZoomed] = useState<ReceiptView | null>(null);

  if (attachments.length === 0) {
    return <p className="text-[13px] text-ink-500">Баримтын зураг хавсаргаагүй.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {attachments.map((attachment) =>
          attachment.isImage ? (
            <button
              key={attachment.id}
              type="button"
              onClick={() => setZoomed(attachment)}
              title="Томоор харах"
              className="group text-left"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- баталгаажсан хэрэглэгчид зориулсан дотоод маршрут */}
              <img
                src={`/api/attachments/${attachment.id}?disposition=inline`}
                alt={attachment.originalFileName}
                className="h-28 w-28 rounded-lg border border-ink-200 object-cover transition-colors group-hover:border-brand-400"
              />
              <span className="mt-1 block max-w-28 truncate text-[13px] text-ink-500">
                {formatSize(attachment.fileSize)}
              </span>
            </button>
          ) : (
            <a
              key={attachment.id}
              href={`/api/attachments/${attachment.id}`}
              className="flex h-28 w-28 flex-col items-center justify-center gap-1.5 rounded-lg border border-ink-200 text-[13px] text-ink-600 transition-colors hover:border-brand-400 hover:bg-brand-50"
            >
              <FileText aria-hidden className="h-6 w-6 text-ink-400" />
              <span className="max-w-24 truncate px-1">{attachment.originalFileName}</span>
            </a>
          ),
        )}
      </div>

      <Modal
        open={zoomed !== null}
        onClose={() => setZoomed(null)}
        title={zoomed?.originalFileName ?? ""}
        description={
          zoomed
            ? `${zoomed.uploadedByName} · ${formatDateTime(zoomed.uploadedAt)} · ${formatSize(zoomed.fileSize)}`
            : undefined
        }
        size="xl"
      >
        {zoomed ? (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- баталгаажсан хэрэглэгчид зориулсан дотоод маршрут */}
            <img
              src={`/api/attachments/${zoomed.id}?disposition=inline`}
              alt={zoomed.originalFileName}
              className="max-h-[70vh] w-auto max-w-full rounded-lg border border-ink-200 object-contain"
            />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
