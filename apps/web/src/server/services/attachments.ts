import "server-only";
import type { DocStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  fileStorage,
  isAllowedMimeType,
} from "@/server/storage";

/**
 * Худалдан авалтын баримт / нэхэмжлэхийн хавсралт.
 *
 * Файл өөрөө хадгалалтын давхаргад, мета мэдээлэл нь өгөгдлийн санд.
 * Хандалт нь ЗӨВХӨН баталгаажсан хэрэглэгчид, /api/attachments/[id]
 * маршрутаар — файлын шууд, таамаглаж болох URL байхгүй.
 *
 * ӨӨРЧЛӨХ ХОРИГ: баталгаажсан (POSTED) буюу цуцлагдсан баримтын хавсралтыг
 * нэмэх, устгах боломжгүй. Баримтын зураг нь баримтын нэг хэсэг тул
 * баталгаажсаны дараа бусад мэдээлэлтэй адил өөрчлөгдөхгүй. Зураг нь
 * ЗӨВХӨН баталгаажуулах үйлдлийн дотор, баримттайгаа хамт үүсдэг
 * (postPurchase-ийн receipt параметр).
 */

export const MAX_ATTACHMENTS_PER_PURCHASE = 10;

export type AttachmentSummary = {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedByName: string;
  isImage: boolean;
};

/**
 * Хэрэглэгчийн өгсөн файлын нэрийг ЗӨВХӨН харуулах зорилгоор цэвэрлэнэ.
 * Энэ нэр хадгалалтын зам болж ХЭЗЭЭ Ч ашиглагдахгүй.
 */
export function sanitizeDisplayFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base
    // Хяналтын тэмдэгт, хашилт, цэг таслалыг цэвэрлэнэ (header injection).
    .replace(/[\u0000-\u001f\u007f"\\]/g, "")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : "file";
}

export async function listPurchaseAttachments(purchaseId: string): Promise<AttachmentSummary[]> {
  const rows = await prisma.purchaseAttachment.findMany({
    where: { purchaseId },
    orderBy: { uploadedAt: "asc" },
    include: { uploadedBy: { select: { name: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    uploadedAt: row.uploadedAt,
    uploadedByName: row.uploadedBy.name,
    isImage: row.mimeType.startsWith("image/"),
  }));
}

/** Баримт эцэслэгдсэн үү (баталгаажсан эсвэл цуцлагдсан)? */
function isFinalized(status: DocStatus): boolean {
  return status !== "DRAFT";
}

const IMMUTABLE_MESSAGE =
  "Баталгаажсан худалдан авалтын баримтын зургийг өөрчлөх боломжгүй.";

export async function addPurchaseAttachment(params: {
  purchaseId: string;
  file: File;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: params.purchaseId },
    select: {
      id: true,
      purchaseNo: true,
      status: true,
      _count: { select: { attachments: true } },
    },
  });
  if (!purchase) throw new Error("Худалдан авалт олдсонгүй.");
  // Серверийн түвшний хориг — UI-д товч нуух нь хамгаалалт биш.
  if (isFinalized(purchase.status)) throw new Error(IMMUTABLE_MESSAGE);
  if (purchase._count.attachments >= MAX_ATTACHMENTS_PER_PURCHASE) {
    throw new Error(`Нэг баримтад дээд тал нь ${MAX_ATTACHMENTS_PER_PURCHASE} хавсралт байна.`);
  }

  const mimeType = params.file.type;
  if (!isAllowedMimeType(mimeType)) {
    throw new Error(
      `Зөвшөөрөгдөх төрөл: ${Object.keys(ALLOWED_MIME_TYPES).join(", ")}.`,
    );
  }
  if (params.file.size <= 0) throw new Error("Файл хоосон байна.");
  if (params.file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Файлын хэмжээ ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB-аас хэтрэхгүй байх ёстой.`);
  }

  const data = Buffer.from(await params.file.arrayBuffer());
  // Тунхагласан хэмжээ ба бодит хэмжээ зөрж болзошгүй тул дахин шалгана.
  if (data.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error("Файлын хэмжээ хэтэрсэн байна.");
  }

  const stored = await fileStorage.put({ data, mimeType });

  try {
    const attachment = await prisma.purchaseAttachment.create({
      data: {
        purchaseId: purchase.id,
        originalFileName: sanitizeDisplayFileName(params.file.name),
        mimeType,
        fileSize: stored.fileSize,
        storageKey: stored.storageKey,
        uploadedById: params.userId,
      },
    });

    await writeAudit({
      userId: params.userId,
      action: "PURCHASE_ATTACHMENT_ADDED",
      entityType: "Purchase",
      entityId: purchase.id,
      newValue: {
        attachmentId: attachment.id,
        fileName: attachment.originalFileName,
        mimeType,
        fileSize: stored.fileSize,
      },
      note: purchase.purchaseNo,
      ipAddress: params.ipAddress,
    });
  } catch (error) {
    // Бүртгэл үүсээгүй бол диск дээр өнчин файл үлдээхгүй.
    await fileStorage.delete(stored.storageKey).catch(() => {});
    throw error;
  }
}

/** Хавсралт устгах. Дуудагч талд OWNER эрхийг ЗААВАЛ шалгасан байна. */
export async function deletePurchaseAttachment(params: {
  attachmentId: string;
  userId: string;
  ipAddress?: string | null;
}): Promise<{ purchaseId: string }> {
  const attachment = await prisma.purchaseAttachment.findUnique({
    where: { id: params.attachmentId },
    include: { purchase: { select: { purchaseNo: true, status: true } } },
  });
  if (!attachment) throw new Error("Хавсралт олдсонгүй.");
  if (isFinalized(attachment.purchase.status)) throw new Error(IMMUTABLE_MESSAGE);

  await prisma.purchaseAttachment.delete({ where: { id: attachment.id } });
  await fileStorage.delete(attachment.storageKey).catch(() => {});

  await writeAudit({
    userId: params.userId,
    action: "PURCHASE_ATTACHMENT_DELETED",
    entityType: "Purchase",
    entityId: attachment.purchaseId,
    oldValue: {
      attachmentId: attachment.id,
      fileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
    },
    note: attachment.purchase.purchaseNo,
    ipAddress: params.ipAddress,
  });

  return { purchaseId: attachment.purchaseId };
}

/** Татаж авахад шаардлагатай мэдээлэл. Хандалтын шалгалт дуудагч талд. */
export async function readAttachmentForDownload(attachmentId: string): Promise<{
  data: Buffer;
  mimeType: string;
  fileName: string;
  fileSize: number;
  /** Зураг л шууд харуулах боломжтой. SVG цагаан жагсаалтад БАЙХГҮЙ. */
  isImage: boolean;
} | null> {
  const attachment = await prisma.purchaseAttachment.findUnique({
    where: { id: attachmentId },
  });
  if (!attachment) return null;

  // Хадгалсан төрөл нь цагаан жагсаалтад байгаа эсэхийг дахин шалгана —
  // хариуд буруу Content-Type буцаахаас сэргийлнэ.
  if (!isAllowedMimeType(attachment.mimeType)) return null;

  const data = await fileStorage.get(attachment.storageKey);
  return {
    data,
    mimeType: attachment.mimeType,
    fileName: attachment.originalFileName,
    fileSize: attachment.fileSize,
    isImage: attachment.mimeType.startsWith("image/"),
  };
}
