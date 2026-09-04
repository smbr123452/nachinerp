"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AlertTriangle, ImagePlus, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Table, Td, Th, TotalRow, Tr } from "@/components/ui/Table";
import { formatMoney, formatQty } from "@/lib/format";
import { unitLabel } from "@/lib/units";
import type { Unit } from "@prisma/client";

/** Баримтын зурагт зөвшөөрөх төрлүүд. */
const ACCEPT = "image/jpeg,image/png,image/webp";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

export type ConfirmLine = {
  key: string;
  name: string;
  quantity: number;
  unit: Unit;
  unitPrice: number;
  subtotal: number;
};

/**
 * Эцсийн баталгаажуулах модал.
 *
 * ЧУХАЛ: энэ модал нээгдэх хүртэл болон "Баталгаажуулах" дарах хүртэл
 * ямар ч баримт, нөөцийн хөдөлгөөн, мөнгөн гүйлгээ үүсэхгүй. "Цуцлах" нь
 * зүгээр л модалыг хаана — формын өгөгдөл бүрэн хэвээр үлдэнэ.
 *
 * Файлын талбар ба илгээх товч нь `form` атрибутаар үндсэн формд
 * холбогдоно. Ингэснээр модал формын ГАДНА байрлаж (форм дотор форм
 * байж болохгүй) ч утга нь хамт илгээгдэнэ.
 */
export function ConfirmPurchaseModal({
  open,
  onClose,
  formId,
  lines,
  total,
  supplierName,
  paymentLabel,
  dateLabel,
  credit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  formId: string;
  lines: ConfirmLine[];
  total: number;
  supplierName: string;
  paymentLabel: string;
  dateLabel: string;
  /** Зээлээр авах бол өглөгийн нөхцөл. Бэлэн/банкаар бол null. */
  credit: { supplierName: string; dueDate: string | null } | null;
  /** Илгээж байгаа эсэх. Модал нь формын ГАДНА тул useFormStatus ажиллахгүй. */
  pending: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Урьдчилан харах URL-ыг үргэлж чөлөөлнө — санах ой алдагдахгүй.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      setFileError(null);
      return;
    }
    if (!ALLOWED.has(picked.type)) {
      resetInput();
      setFileError("JPG, PNG эсвэл WEBP зураг сонгоно уу.");
      return;
    }
    if (picked.size > MAX_BYTES) {
      resetInput();
      setFileError("Зургийн хэмжээ 10MB-аас хэтрэхгүй байх ёстой.");
      return;
    }
    setFileError(null);
    setFile(picked);
  };

  const openPicker = () => inputRef.current?.click();

  /**
   * Сонголтыг арилгана. Алдааны мессежийг ХӨНДӨХГҮЙ — буруу файл сонгоход
   * талбарыг цэвэрлэсэн ч шалтгааныг харуулсаар байх ёстой.
   */
  const resetInput = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  /** Хэрэглэгч өөрөө зургийг хасах — алдааны мессежийг ч цэвэрлэнэ. */
  const clearFile = () => {
    resetInput();
    setFileError(null);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Худалдан авалт баталгаажуулах"
      description="Эцсийн алхам. Доорх мэдээллийг шалгаад баталгаажуулна уу."
      size="lg"
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body sm:grid-cols-4">
          <div>
            <dt className="text-ink-500">Огноо</dt>
            <dd className="font-medium text-ink-900">{dateLabel}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-ink-500">Нийлүүлэгч</dt>
            <dd className="truncate font-medium text-ink-900">{supplierName}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Төлбөр</dt>
            <dd className="font-medium text-ink-900">{paymentLabel}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Мөрийн тоо</dt>
            <dd className="tabular font-medium text-ink-900">{lines.length}</dd>
          </div>
        </dl>

        <div className="overflow-hidden rounded-lg border border-ink-200">
          <Table>
            <thead>
              <tr>
                <Th>Бараа</Th>
                <Th align="right">Тоо хэмжээ</Th>
                <Th align="right">Нэгж үнэ</Th>
                <Th align="right">Дүн</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <Tr key={line.key}>
                  <Td>{line.name}</Td>
                  <Td align="right">
                    {formatQty(line.quantity)} {unitLabel(line.unit)}
                  </Td>
                  <Td align="right">{formatMoney(line.unitPrice)}</Td>
                  <Td align="right" className="font-medium">
                    {formatMoney(line.subtotal)}
                  </Td>
                </Tr>
              ))}
              <TotalRow>
                <Td colSpan={3}>Нийт төлөх дүн</Td>
                <Td align="right" className="text-title">
                  {formatMoney(total)}
                </Td>
              </TotalRow>
            </tbody>
          </Table>
        </div>

        {/* --- Зээлийн нөхцөл ---------------------------------------------
            Мөнгө одоо гарахгүй: оронд нь өглөг үүснэ. Хэрэглэгч баталгаажуулахаас
            ӨМНӨ хэнд, хэдийг, хэзээ гэдгээ харна. */}
        {credit ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-sm font-medium text-ink-900">Зээлийн нөхцөл</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-body sm:grid-cols-4">
              <div>
                <dt className="text-ink-500">Төлбөрийн нөхцөл</dt>
                <dd className="font-medium text-ink-900">{paymentLabel}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink-500">Нийлүүлэгч</dt>
                <dd className="truncate font-medium text-ink-900">{credit.supplierName}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Нийт өглөг</dt>
                <dd className="tabular font-medium text-ink-900">{formatMoney(total)}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Төлөх хугацаа</dt>
                <dd className="font-medium text-ink-900">{credit.dueDate ?? "Тодорхойгүй"}</dd>
              </div>
            </dl>
            <p className="mt-2 text-body text-ink-600">
              Одоо мөнгө гарахгүй. Төлбөрийг дараа нь худалдан авалтын хуудаснаас
              бүртгэнэ.
            </p>
          </div>
        ) : null}

        {/* --- Баримтын зураг (заавал биш) --------------------------------- */}
        <div>
          <p className="mb-2 text-sm font-medium text-ink-900">Баримтын зураг</p>
          {fileError ? (
            <Alert tone="error" className="mb-2">
              {fileError}
            </Alert>
          ) : null}

          {/* Файлын талбар ҮРГЭЛЖ нэг л ширхэг, `form` атрибутаар үндсэн
              формд холбогдоно. Харагдац нь доор өөрчлөгдөнө. */}
          <input
            ref={inputRef}
            type="file"
            name="receipt"
            form={formId}
            accept={ACCEPT}
            onChange={onPick}
            className="sr-only"
            aria-label="Баримтын зураг"
          />

          {file && previewUrl ? (
            <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-ink-50/60 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- локал blob URL */}
              <img
                src={previewUrl}
                alt="Сонгосон баримтын зураг"
                className="h-16 w-16 shrink-0 rounded-md border border-ink-200 object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-ink-900">{file.name}</p>
                <p className="text-body text-ink-500">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <Button variant="secondary" size="sm" onClick={openPicker} disabled={pending}>
                Солих
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<X />}
                onClick={clearFile}
                disabled={pending}
                className="text-ink-500 hover:bg-red-50 hover:text-red-700"
              >
                Хасах
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openPicker}
              disabled={pending}
              className={
                "flex w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed " +
                "border-ink-300 bg-white px-3 py-2.5 text-left text-body text-ink-600 " +
                "transition-colors hover:border-brand-400 hover:bg-brand-50 " +
                "disabled:cursor-not-allowed disabled:opacity-60"
              }
            >
              <ImagePlus aria-hidden className="h-4 w-4 shrink-0 text-ink-400" />
              <span>Зураг сонгох — JPG, PNG, WEBP (заавал биш)</span>
            </button>
          )}
        </div>

        <Alert tone="warning" className="items-start">
          <span className="inline-flex items-start gap-2">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            Баталгаажуулсны дараа худалдан авалтын мэдээллийг өөрчлөх боломжгүй.
          </span>
        </Alert>

        <div className="flex flex-wrap justify-end gap-2 border-t border-ink-200 pt-4">
          {/* Илгээж байх үед цуцлахыг хаана — хагас боловсруулалт үүсэхээс
              сэргийлнэ. */}
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Цуцлах
          </Button>
          {/* Формын ГАДНА байгаа ч `form` атрибутаар үндсэн формыг илгээнэ.
              Дарагдсаны дараа идэвхгүй болно; сервер тал дээр
              idempotencyKey давхар хамгаална. */}
          <Button type="submit" form={formId} loading={pending} disabled={pending}>
            {pending ? "Баталгаажуулж байна..." : "Баталгаажуулах"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
