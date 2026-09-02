import "server-only";
import type { DocStatus, Prisma, WriteOffReason } from "@prisma/client";
import { d, money, qty as toQty, sum, ZERO, type Dec } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { reasonRequiresNote } from "@/lib/write-offs";
import {
  applyMovement,
  lockStock,
  productSubject,
  rawMaterialSubject,
  type StockSubject,
} from "./inventory";
import { nextDocumentNumber } from "./numbering";

/**
 * Актаар хасалт — мэдэгдэж буй шалтгаанаар нөөцөөс бараа хасах баримт.
 *
 * Зарчим:
 *  - Нөөцийг ШУУД дарж бичихгүй. Бүх өөрчлөлт applyMovement()-ээр дамжина.
 *  - Ноорог үед нөөцөд нөлөөлөхгүй; зөвхөн батлах үед хөдөлгөөн үүснэ.
 *  - Батлах үед тухайн үеийн жигнэсэн дундаж өртөг ЦАРЦАНА. Хожмын
 *    худалдан авалт дундаж өртгийг өөрчилсөн ч актын түүхэн дүн хэвээр.
 *  - Батлагдсан актыг устгах / засах боломжгүй. Буцаалт нь эсрэг хөдөлгөөн
 *    үүсгэж, эх түүхийг хэвээр үлдээнэ.
 *  - Мөнгөн гүйлгээ ҮҮСГЭХГҮЙ — акт нь касс/банкны гүйлгээ биш.
 */

export const WRITE_OFF_REFERENCE = "INVENTORY_WRITE_OFF";
export const WRITE_OFF_REVERSAL_REFERENCE = "INVENTORY_WRITE_OFF_REVERSAL";

/** Prisma-ийн давхардлын алдаа (P2002) эсэхийг шалгана. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export class WriteOffStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteOffStateError";
  }
}

// ---------------------------------------------------------------------------
// Оролтын хэлбэр
// ---------------------------------------------------------------------------

/** Актын мөр — түүхий эд ЭСВЭЛ бэлэн бүтээгдэхүүн, ЯГ НЭГ нь. */
export type WriteOffLineInput = {
  rawMaterialId?: string | null;
  productId?: string | null;
  quantity: string | number;
  note?: string | null;
};

export type WriteOffDraftInput = {
  date: Date;
  reason: WriteOffReason;
  note?: string | null;
  lines: WriteOffLineInput[];
  userId: string;
  ipAddress?: string | null;
};

/** Оролтын мөрийг нөөцийн субьект болгоно. Хоёулаа / аль нь ч биш бол алдаа. */
function lineSubject(line: WriteOffLineInput): StockSubject {
  const hasMaterial = Boolean(line.rawMaterialId);
  const hasProduct = Boolean(line.productId);
  if (hasMaterial === hasProduct) {
    throw new WriteOffStateError(
      "Актын мөр бүр яг нэг бараа сонгосон байх ёстой (түүхий эд эсвэл бэлэн бүтээгдэхүүн).",
    );
  }
  return hasMaterial ? rawMaterialSubject(line.rawMaterialId!) : productSubject(line.productId!);
}

function subjectKey(subject: StockSubject): string {
  return `${subject.kind}:${subject.id}`;
}

/**
 * Мөрүүдийг шалгаж, нэг бараа давхардвал нэгтгэнэ.
 *
 * Давхардлыг нэгтгэх нь зайлшгүй: ижил бараа хоёр мөрөнд байвал үлдэгдлийн
 * шалгалт мөр тус бүрдээ давж, нийлбэр нь үлдэгдлээс хэтэрч болно.
 */
function normalizeLines(lines: WriteOffLineInput[]): {
  subject: StockSubject;
  quantity: Dec;
  note: string | null;
}[] {
  if (lines.length === 0) {
    throw new WriteOffStateError("Дор хаяж нэг бараа нэмнэ үү.");
  }

  const merged = new Map<string, { subject: StockSubject; quantity: Dec; note: string | null }>();

  for (const line of lines) {
    const subject = lineSubject(line);
    const quantity = toQty(line.quantity);
    if (quantity.lessThanOrEqualTo(0)) {
      throw new WriteOffStateError("Тоо хэмжээ 0-ээс их байх ёстой.");
    }

    const key = subjectKey(subject);
    const existing = merged.get(key);
    if (existing) {
      existing.quantity = toQty(existing.quantity.plus(quantity));
      existing.note = existing.note ?? (line.note?.trim() || null);
    } else {
      merged.set(key, { subject, quantity, note: line.note?.trim() || null });
    }
  }

  return [...merged.values()];
}

function validateReasonNote(reason: WriteOffReason, note: string | null | undefined): string | null {
  const trimmed = note?.trim() || null;
  if (reasonRequiresNote(reason) && !trimmed) {
    throw new WriteOffStateError('"Бусад" шалтгаан сонгосон бол тайлбар заавал бичнэ.');
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Ноорог
// ---------------------------------------------------------------------------

/**
 * Ноорог акт үүсгэх. Нөөцөд НӨЛӨӨЛӨХГҮЙ — зөвхөн баримт бэлтгэнэ.
 *
 * Мөрийн өртөг энд бодогдохгүй: жигнэсэн дундаж өртөг зөвхөн БАТЛАХ үед
 * царцах ёстой. Ноорогт хадгалсан өртөг батлах үед хуучирсан байх эрсдэлтэй.
 */
export async function createWriteOffDraft(
  input: WriteOffDraftInput,
): Promise<{ id: string; documentNo: string }> {
  const lines = normalizeLines(input.lines);
  const note = validateReasonNote(input.reason, input.note);

  return prisma.$transaction(async (tx) => {
    // Барааны эрхийг ноорог үедээ ч шалгана — үйлдвэрлэдэг бүтээгдэхүүн
    // нөөцийн субьект биш тул актад ерөөсөө орж болохгүй.
    for (const line of lines) await assertEligible(tx, line.subject);

    const documentNo = await nextDocumentNumber(tx, "writeOff");
    const writeOff = await tx.inventoryWriteOff.create({
      data: {
        documentNo,
        date: input.date,
        reason: input.reason,
        note,
        status: "DRAFT",
        createdById: input.userId,
        items: {
          create: await Promise.all(
            lines.map(async (line) => {
              const stock = await lockStock(tx, line.subject);
              return {
                rawMaterialId: line.subject.kind === "rawMaterial" ? line.subject.id : null,
                productId: line.subject.kind === "product" ? line.subject.id : null,
                quantity: line.quantity,
                unit: stock.unit,
                note: line.note,
              };
            }),
          ),
        },
      },
      select: { id: true, documentNo: true },
    });

    await writeAudit(
      {
        userId: input.userId,
        action: "WRITE_OFF_CREATED",
        entityType: "InventoryWriteOff",
        entityId: writeOff.id,
        newValue: { documentNo, reason: input.reason, itemCount: lines.length },
        ipAddress: input.ipAddress,
      },
      tx,
    );

    return writeOff;
  });
}

/** Ноорог актыг бүтнээр нь солих (мөр нэмэх / хасах / тоо, шалтгаан засах). */
export async function updateWriteOffDraft(params: {
  writeOffId: string;
  date: Date;
  reason: WriteOffReason;
  note?: string | null;
  lines: WriteOffLineInput[];
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  const lines = normalizeLines(params.lines);
  const note = validateReasonNote(params.reason, params.note);

  await prisma.$transaction(async (tx) => {
    const existing = await lockWriteOff(tx, params.writeOffId);
    assertDraft(existing.status, "засварлах");

    for (const line of lines) await assertEligible(tx, line.subject);

    await tx.inventoryWriteOffItem.deleteMany({ where: { writeOffId: existing.id } });

    for (const line of lines) {
      const stock = await lockStock(tx, line.subject);
      await tx.inventoryWriteOffItem.create({
        data: {
          writeOffId: existing.id,
          rawMaterialId: line.subject.kind === "rawMaterial" ? line.subject.id : null,
          productId: line.subject.kind === "product" ? line.subject.id : null,
          quantity: line.quantity,
          unit: stock.unit,
          note: line.note,
        },
      });
    }

    await tx.inventoryWriteOff.update({
      where: { id: existing.id },
      data: { date: params.date, reason: params.reason, note },
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "WRITE_OFF_UPDATED",
        entityType: "InventoryWriteOff",
        entityId: existing.id,
        newValue: {
          documentNo: existing.documentNo,
          reason: params.reason,
          itemCount: lines.length,
        },
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}

/** Ноорог актыг устгах. Батлагдсан / буцаасан актыг ХЭЗЭЭ Ч устгахгүй. */
export async function deleteWriteOffDraft(params: {
  writeOffId: string;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await lockWriteOff(tx, params.writeOffId);
    assertDraft(existing.status, "устгах");

    await tx.inventoryWriteOff.delete({ where: { id: existing.id } });

    await writeAudit(
      {
        userId: params.userId,
        action: "WRITE_OFF_DELETED",
        entityType: "InventoryWriteOff",
        entityId: existing.id,
        oldValue: { documentNo: existing.documentNo, reason: existing.reason },
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Туслах шалгалтууд
// ---------------------------------------------------------------------------

/** Актын мөрийг гүйлгээний туршид түгжинэ. */
async function lockWriteOff(tx: Tx, writeOffId: string) {
  await tx.$queryRaw`SELECT id FROM "InventoryWriteOff" WHERE id = ${writeOffId} FOR UPDATE`;
  const writeOff = await tx.inventoryWriteOff.findUnique({
    where: { id: writeOffId },
    include: { items: true },
  });
  if (!writeOff) throw new WriteOffStateError("Акт олдсонгүй.");
  return writeOff;
}

function assertDraft(status: DocStatus, verb: string): void {
  if (status !== "DRAFT") {
    throw new WriteOffStateError(
      `Зөвхөн ноорог актыг ${verb} боломжтой. Батлагдсан акт өөрчлөгдөхгүй.`,
    );
  }
}

/**
 * Нөөцийн субьект актад орох эрхтэй эсэх.
 *
 * Үйлдвэрлэдэг бүтээгдэхүүн өөрийн нөөцгүй (өртөг нь жорноос бодогддог,
 * материал нь борлуулалтын үед хасагддаг) тул актад ОРОХГҮЙ. lockStock мөн
 * үүнийг татгалздаг — энд урьдчилан ойлгомжтой алдаа өгөх зорилготой.
 */
async function assertEligible(tx: Tx, subject: StockSubject): Promise<void> {
  if (subject.kind === "rawMaterial") {
    const material = await tx.rawMaterial.findUnique({
      where: { id: subject.id },
      select: { id: true },
    });
    if (!material) throw new WriteOffStateError("Бараа материал олдсонгүй.");
    return;
  }
  const product = await tx.product.findUnique({
    where: { id: subject.id },
    select: { name: true, productType: true },
  });
  if (!product) throw new WriteOffStateError("Бүтээгдэхүүн олдсонгүй.");
  if (product.productType !== "RESALE") {
    throw new WriteOffStateError(
      `"${product.name}" нь үйлдвэрлэдэг бүтээгдэхүүн тул актаар хасах боломжгүй. ` +
        "Түүний түүхий эдийг актад оруулна уу.",
    );
  }
}

// ---------------------------------------------------------------------------
// Батлах
// ---------------------------------------------------------------------------

export type PostWriteOffResult = {
  id: string;
  documentNo: string;
  totalCost: Dec;
  /** false бол давхардсан илгээлт — шинэ баримт үүсээгүй. */
  posted: boolean;
};

/**
 * Актыг БАТЛАХ. Бүх алхам НЭГ гүйлгээнд:
 *   1) актыг түгжих, 2) ноорог эсэхийг шалгах, 3) бараа бүрийг түгжих,
 *   4) үлдэгдэл хүрэлцэхийг шалгах, 5) дундаж өртгийг царцаах,
 *   6) WRITE_OFF_OUT хөдөлгөөн үүсгэх, 7) актыг POSTED болгох, 8) аудит.
 *
 * Аль нэг алхам бүтэлгүйтвэл БҮГД буцна — хагас хасалт үлдэхгүй.
 *
 * Давхар дарахаас хамгаалах: idempotencyKey өгсөн бол ижил түлхүүртэй акт
 * аль хэдийн батлагдсан эсэхийг шалгана. Зэрэгцээ хоёр хүсэлт яг зэрэг ирвэл
 * unique индекс хоёр дахийг нь зогсооно.
 */
export async function postWriteOff(params: {
  writeOffId: string;
  userId: string;
  idempotencyKey?: string | null;
  ipAddress?: string | null;
}): Promise<PostWriteOffResult> {
  // Гүйлгээнээс ӨМНӨ шалгах нь давтан дарсан хүсэлтэд ажил хийхээс сэргийлнэ.
  if (params.idempotencyKey) {
    const existing = await findByIdempotencyKey(params.idempotencyKey);
    if (existing) return existing;
  }

  try {
    return await postWriteOffTransaction(params);
  } catch (error) {
    // Зэрэгцээ хоёр хүсэлт ижил түлхүүрээр ирвэл нэг нь unique индекст
    // мөргөнө. Энэ нь алдаа БИШ — давхардал амжилттай зогссон гэсэн үг.
    if (params.idempotencyKey && isUniqueViolation(error)) {
      const existing = await findByIdempotencyKey(params.idempotencyKey);
      if (existing) return existing;
    }
    throw error;
  }
}

async function findByIdempotencyKey(key: string): Promise<PostWriteOffResult | null> {
  const existing = await prisma.inventoryWriteOff.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, documentNo: true, totalCost: true },
  });
  if (!existing) return null;
  return {
    id: existing.id,
    documentNo: existing.documentNo,
    totalCost: d(existing.totalCost),
    posted: false,
  };
}

async function postWriteOffTransaction(params: {
  writeOffId: string;
  userId: string;
  idempotencyKey?: string | null;
  ipAddress?: string | null;
}): Promise<PostWriteOffResult> {
  return prisma.$transaction(async (tx) => {
    const writeOff = await lockWriteOff(tx, params.writeOffId);

    // Зэрэгцээ давхар илгээлт: хоёулаа гүйлгээнээс өмнөх шалгалтыг давсан ч
    // энд нэг нь хүлээнэ. Хүлээсэн хүсэлт актыг аль хэдийн батлагдсан
    // байхад олно — энэ нь АЛДАА БИШ, давхардал зогссон гэсэн үг. Ижил
    // түлхүүртэй бол өмнөх үр дүнг буцаана, шинэ хөдөлгөөн үүсгэхгүй.
    if (
      params.idempotencyKey &&
      writeOff.idempotencyKey === params.idempotencyKey &&
      writeOff.status !== "DRAFT"
    ) {
      return {
        id: writeOff.id,
        documentNo: writeOff.documentNo,
        totalCost: d(writeOff.totalCost),
        posted: false,
      };
    }

    assertDraft(writeOff.status, "батлах");

    if (writeOff.items.length === 0) {
      throw new WriteOffStateError("Хоосон актыг батлах боломжгүй.");
    }
    validateReasonNote(writeOff.reason, writeOff.note);

    let totalQuantity = ZERO;
    let totalCost = ZERO;

    // Мөрүүдийг барааны дарааллаар нь эрэмбэлж түгжинэ — хоёр акт ижил
    // хоёр барааг эсрэг дарааллаар түгжвэл харилцан түгжрэл (deadlock)
    // үүсэх эрсдэлтэй. Тогтмол дараалал үүнээс сэргийлнэ.
    const ordered = [...writeOff.items].sort((a, b) =>
      subjectKey(subjectOfItem(a)).localeCompare(subjectKey(subjectOfItem(b))),
    );

    for (const item of ordered) {
      const subject = subjectOfItem(item);
      await assertEligible(tx, subject);

      // lockStock нь SELECT ... FOR UPDATE хийнэ. Энэ мөчөөс хойш өөр
      // гүйлгээ энэ барааны үлдэгдлийг өөрчилж чадахгүй тул доорх шалгалт
      // ба хасалт нь атомт болно.
      const stock = await lockStock(tx, subject);
      const quantity = toQty(item.quantity);

      // Сөрөг үлдэгдлийг ХОЁУЛАНГ нь дүрд үл хамааран хориглоно. Тохиргооны
      // allowNegativeStock зөвшөөрөл актад ЗОРИУДААР үйлчлэхгүй — акт нь
      // мэдэгдэж буй бодит хорогдол тул байхгүй барааг хасах утгагүй.
      if (quantity.greaterThan(stock.quantity)) {
        throw new WriteOffStateError(
          `"${stock.name}" хүрэлцэхгүй байна. Актад: ${quantity.toFixed(3)}, ` +
            `үлдэгдэл: ${d(stock.quantity).toFixed(3)}.`,
        );
      }

      // Дундаж өртгийг ЭНЭ мөчид царцаана. Хожим худалдан авалт хийгдэж
      // дундаж өртөг өөрчлөгдсөн ч энэ утга хэвээр үлдэнэ.
      const frozenUnitCost = d(stock.averageCost);
      const lineCost = money(quantity.times(frozenUnitCost));

      // costPolicy: AVERAGE — зарлага нь дундаж өртгийг ДАХИН ТООЦООЛОХГҮЙ.
      // 10 ширхэг × 5,000₮-с 2 хасахад 8 ширхэг × 5,000₮ хэвээр үлдэнэ.
      const movement = await applyMovement(tx, {
        subject,
        movementType: "WRITE_OFF_OUT",
        quantity,
        costPolicy: { mode: "AVERAGE" },
        referenceType: WRITE_OFF_REFERENCE,
        referenceId: writeOff.id,
        note: `${writeOff.documentNo} · ${writeOff.reason}`,
        userId: params.userId,
        // Тохиргооноос үл хамааран сөрөг үлдэгдэл гаргахгүй.
        allowNegative: false,
      });

      await tx.inventoryWriteOffItem.update({
        where: { id: item.id },
        data: {
          frozenUnitCost,
          totalCost: lineCost,
          movementId: movement.movementId,
        },
      });

      totalQuantity = toQty(totalQuantity.plus(quantity));
      totalCost = money(totalCost.plus(lineCost));
    }

    const posted = await tx.inventoryWriteOff.update({
      where: { id: writeOff.id },
      data: {
        status: "POSTED",
        totalQuantity,
        totalCost,
        postedAt: new Date(),
        postedById: params.userId,
        idempotencyKey: params.idempotencyKey ?? null,
      },
      select: { id: true, documentNo: true },
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "WRITE_OFF_POSTED",
        entityType: "InventoryWriteOff",
        entityId: posted.id,
        newValue: {
          documentNo: posted.documentNo,
          reason: writeOff.reason,
          itemCount: writeOff.items.length,
          totalQuantity: totalQuantity.toFixed(3),
          totalCost: totalCost.toFixed(2),
        },
        ipAddress: params.ipAddress,
      },
      tx,
    );

    return { ...posted, totalCost, posted: true };
  });
}

function subjectOfItem(item: { rawMaterialId: string | null; productId: string | null }) {
  if (item.rawMaterialId) return rawMaterialSubject(item.rawMaterialId);
  if (item.productId) return productSubject(item.productId);
  throw new WriteOffStateError("Актын мөрөнд бараа алга байна (өгөгдлийн зөрчил).");
}

// ---------------------------------------------------------------------------
// Буцаалт
// ---------------------------------------------------------------------------

/**
 * Батлагдсан актыг БУЦААХ. Зөвхөн эзэн.
 *
 * Эх хөдөлгөөнийг УСТГАХГҮЙ — мөр бүрд эсрэг чиглэлийн
 * WRITE_OFF_REVERSAL_IN хөдөлгөөн үүсгэж, актыг REVERSED болгоно.
 * Түүх бүрэн хэвээр үлдэнэ.
 *
 * Өртгийн бодлого: буцаалт нь ЭХ царцсан өртгөөр үнэлэгдэнэ (одоогийн
 * дундаж өртгөөр БИШ). Тухайн бараа буцаж орж ирэхдээ өөрийн царцсан
 * өртгөө авчирдаг тул AT_COST горим ашиглана — жигнэсэн дундаж дахин
 * тооцоологдож, нөөцийн нийт үнэлгээ зөв хэвээр үлдэнэ:
 *
 *   8ш × 5,000 = 40,000  +  буцаалт 2ш × 5,000 = 10,000
 *   → 10ш, дундаж 5,000, нийт 50,000 ✓
 *
 * Хэрэв хооронд нь өөр өртгөөр худалдан авалт болсон бол дундаж өртөг
 * хоёр эх үүсвэрийн жигнэсэн дундаж болно — энэ нь дэвтрийн нийт үнэлгээг
 * хадгалдаг математикийн хувьд зөв арга.
 */
export async function reverseWriteOff(params: {
  writeOffId: string;
  userId: string;
  note?: string | null;
  ipAddress?: string | null;
}): Promise<{ id: string; documentNo: string; restoredCost: Dec }> {
  return prisma.$transaction(async (tx) => {
    const writeOff = await lockWriteOff(tx, params.writeOffId);

    if (writeOff.status === "REVERSED") {
      throw new WriteOffStateError("Энэ акт аль хэдийн буцаагдсан байна.");
    }
    if (writeOff.status !== "POSTED") {
      throw new WriteOffStateError("Зөвхөн батлагдсан актыг буцаана.");
    }

    let restoredCost = ZERO;

    const ordered = [...writeOff.items].sort((a, b) =>
      subjectKey(subjectOfItem(a)).localeCompare(subjectKey(subjectOfItem(b))),
    );

    for (const item of ordered) {
      const subject = subjectOfItem(item);
      const quantity = toQty(item.quantity);
      const frozenUnitCost = d(item.frozenUnitCost);

      const movement = await applyMovement(tx, {
        subject,
        movementType: "WRITE_OFF_REVERSAL_IN",
        quantity,
        // ЭХ царцсан өртгөөр — одоогийн дундажаар БИШ.
        costPolicy: { mode: "AT_COST", unitCost: frozenUnitCost },
        referenceType: WRITE_OFF_REVERSAL_REFERENCE,
        referenceId: writeOff.id,
        note: `${writeOff.documentNo} буцаалт`,
        userId: params.userId,
      });

      await tx.inventoryWriteOffItem.update({
        where: { id: item.id },
        data: { reversalMovementId: movement.movementId },
      });

      restoredCost = money(restoredCost.plus(money(quantity.times(frozenUnitCost))));
    }

    await tx.inventoryWriteOff.update({
      where: { id: writeOff.id },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
        reversedById: params.userId,
        reversalNote: params.note?.trim() || null,
      },
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "WRITE_OFF_REVERSED",
        entityType: "InventoryWriteOff",
        entityId: writeOff.id,
        oldValue: { status: "POSTED", totalCost: d(writeOff.totalCost).toFixed(2) },
        newValue: {
          documentNo: writeOff.documentNo,
          reason: writeOff.reason,
          itemCount: writeOff.items.length,
          restoredCost: restoredCost.toFixed(2),
        },
        note: params.note?.trim() || null,
        ipAddress: params.ipAddress,
      },
      tx,
    );

    return { id: writeOff.id, documentNo: writeOff.documentNo, restoredCost };
  });
}

// ---------------------------------------------------------------------------
// Уншилт
// ---------------------------------------------------------------------------

const ITEM_INCLUDE = {
  rawMaterial: { select: { id: true, name: true, unit: true, sku: true } },
  product: { select: { id: true, name: true, unit: true, sku: true } },
} as const;

export type WriteOffListFilters = {
  from?: Date | null;
  to?: Date | null;
  reason?: WriteOffReason | null;
  status?: DocStatus | null;
};

function listWhere(filters: WriteOffListFilters): Prisma.InventoryWriteOffWhereInput {
  return {
    ...(filters.from || filters.to
      ? {
          date: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(filters.reason ? { reason: filters.reason } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
}

export async function listWriteOffs(filters: WriteOffListFilters = {}, take = 100) {
  return prisma.inventoryWriteOff.findMany({
    where: listWhere(filters),
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      createdBy: { select: { name: true } },
      postedBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
}

export async function getWriteOff(id: string) {
  return prisma.inventoryWriteOff.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      postedBy: { select: { name: true } },
      reversedBy: { select: { name: true } },
      items: { include: ITEM_INCLUDE, orderBy: { id: "asc" } },
    },
  });
}

export type WriteOffCandidate = {
  kind: "rawMaterial" | "product";
  id: string;
  sku: string;
  name: string;
  unit: string;
  quantity: string;
  averageCost: string;
};

/**
 * Актад нэмж болох барааны жагсаалт: идэвхтэй түүхий эд ба идэвхтэй
 * БЭЛЭН (RESALE) бүтээгдэхүүн. Үйлдвэрлэдэг бүтээгдэхүүн ЭНД ОРОХГҮЙ —
 * тэдгээр нь өөрийн нөөцгүй.
 */
export async function listWriteOffCandidates(): Promise<WriteOffCandidate[]> {
  const [materials, products] = await Promise.all([
    prisma.rawMaterial.findMany({
      where: { isActive: true },
      select: { id: true, sku: true, name: true, unit: true, quantity: true, averageCost: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { isActive: true, productType: "RESALE" },
      select: { id: true, sku: true, name: true, unit: true, quantity: true, averageCost: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return [
    ...materials.map((m) => ({
      kind: "rawMaterial" as const,
      id: m.id,
      sku: m.sku,
      name: m.name,
      unit: m.unit,
      quantity: d(m.quantity).toFixed(3),
      averageCost: d(m.averageCost).toFixed(4),
    })),
    ...products.map((p) => ({
      kind: "product" as const,
      id: p.id,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
      quantity: d(p.quantity).toFixed(3),
      averageCost: d(p.averageCost).toFixed(4),
    })),
  ];
}

// ---------------------------------------------------------------------------
// Тайлан
// ---------------------------------------------------------------------------

export type WriteOffReportRow = { key: string; label: string; amount: Dec; quantity: Dec };

export type WriteOffReport = {
  actCount: number;
  reversedCount: number;
  totalQuantity: Dec;
  totalCost: Dec;
  byReason: WriteOffReportRow[];
  bySubjectKind: WriteOffReportRow[];
  topItems: (WriteOffReportRow & { unit: string })[];
};

/**
 * Хугацааны хорогдлын тайлан.
 *
 * ЗӨВХӨН батлагдсан (POSTED) актыг тооцно. Буцаагдсан акт нь бодит хорогдол
 * биш тул дүнд ОРОХГҮЙ — гэхдээ түүх нь жагсаалтад хэвээр харагдана.
 */
export async function writeOffReport(range: { from: Date; to: Date }): Promise<WriteOffReport> {
  const where: Prisma.InventoryWriteOffWhereInput = {
    date: { gte: range.from, lte: range.to },
  };

  const [posted, reversedCount] = await Promise.all([
    prisma.inventoryWriteOff.findMany({
      where: { ...where, status: "POSTED" },
      include: { items: { include: ITEM_INCLUDE } },
    }),
    prisma.inventoryWriteOff.count({ where: { ...where, status: "REVERSED" } }),
  ]);

  const byReason = new Map<string, { amount: Dec; quantity: Dec }>();
  const byKind = new Map<string, { amount: Dec; quantity: Dec }>();
  const byItem = new Map<string, { label: string; unit: string; amount: Dec; quantity: Dec }>();

  for (const act of posted) {
    for (const item of act.items) {
      const amount = d(item.totalCost);
      const quantity = d(item.quantity);

      const reasonBucket = byReason.get(act.reason) ?? { amount: ZERO, quantity: ZERO };
      byReason.set(act.reason, {
        amount: money(reasonBucket.amount.plus(amount)),
        quantity: toQty(reasonBucket.quantity.plus(quantity)),
      });

      const kind = item.rawMaterialId ? "rawMaterial" : "product";
      const kindBucket = byKind.get(kind) ?? { amount: ZERO, quantity: ZERO };
      byKind.set(kind, {
        amount: money(kindBucket.amount.plus(amount)),
        quantity: toQty(kindBucket.quantity.plus(quantity)),
      });

      const subject = item.rawMaterial ?? item.product;
      const key = `${kind}:${item.rawMaterialId ?? item.productId}`;
      const itemBucket = byItem.get(key) ?? {
        label: subject?.name ?? "—",
        unit: item.unit,
        amount: ZERO,
        quantity: ZERO,
      };
      byItem.set(key, {
        ...itemBucket,
        amount: money(itemBucket.amount.plus(amount)),
        quantity: toQty(itemBucket.quantity.plus(quantity)),
      });
    }
  }

  const totalCost = money(sum(posted.map((a) => d(a.totalCost))));
  const totalQuantity = toQty(sum(posted.map((a) => d(a.totalQuantity))));

  return {
    actCount: posted.length,
    reversedCount,
    totalQuantity,
    totalCost,
    byReason: [...byReason.entries()]
      .map(([key, v]) => ({ key, label: key, ...v }))
      .sort((a, b) => b.amount.comparedTo(a.amount)),
    bySubjectKind: [...byKind.entries()]
      .map(([key, v]) => ({
        key,
        label: key === "rawMaterial" ? "Бараа материал" : "Бэлэн бүтээгдэхүүн",
        ...v,
      }))
      .sort((a, b) => b.amount.comparedTo(a.amount)),
    topItems: [...byItem.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.amount.comparedTo(a.amount))
      .slice(0, 10),
  };
}
