import "server-only";
import type { PurchasePaymentMethod, Unit } from "@prisma/client";
import { d, money, qty as toQty, cost as toCost, ZERO, type Dec } from "@/lib/decimal";
import { convertQuantity, convertUnitPrice, isConvertible, unitLabel } from "@/lib/units";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { applyMovement, subjectOf, type StockSubject } from "./inventory";
import { recordMoneyTransaction } from "./money";
import { nextDocumentNumber } from "./numbering";
import {
  cancelPayableForPurchase,
  createPayableForPurchase,
  PayableStateError,
} from "./payables";

/** Prisma-ийн давхардлын алдаа (P2002) эсэхийг шалгана. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Худалдан авалтын мөр. Түүхий эд ЭСВЭЛ RESALE бүтээгдэхүүн —
 * rawMaterialId / productId-ийн ЯГ НЭГИЙГ өгнө.
 */
export type PurchaseLineInput = {
  rawMaterialId?: string | null;
  productId?: string | null;
  quantity: string | number;
  unit: Unit;
  unitPrice: string | number;
};

/**
 * Баримтын зураг. Файл нь ЭНЭ ФУНКЦ дуудагдахаас ӨМНӨ хадгалалтын
 * давхаргад бичигдсэн байна — гүйлгээний дотор файл бичих нь түгжээг
 * удаан барих тул тэгэхгүй. Энд зөвхөн мета мөр үүснэ.
 */
export type PurchaseReceiptInput = {
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
};

export type PostPurchaseInput = {
  date: Date;
  supplierId?: string | null;
  paymentMethod: PurchasePaymentMethod;
  note?: string | null;
  items: PurchaseLineInput[];
  userId: string;
  ipAddress?: string | null;
  /** Баталгаажуулах үед хавсаргах баримтын зураг. Заавал биш. */
  receipt?: PurchaseReceiptInput | null;
  /**
   * Давхардлаас хамгаалах түлхүүр. Ижил түлхүүртэй баримт аль хэдийн
   * байвал ШИНЭ баримт үүсэхгүй, өмнөх нь буцна.
   */
  idempotencyKey?: string | null;
  /** Зээлээр авсан бол төлөх хугацаа. Заавал биш. */
  dueDate?: Date | null;
  /** Зээлийн нөхцөлийн тэмдэглэл. Заавал биш. */
  creditNote?: string | null;
};

/**
 * Худалдан авалтыг БАТАЛГААЖУУЛАХ — БҮГД нэг гүйлгээнд:
 *   1) баримт, 2) мөрүүд, 3) нөөц нэмэх, 4) жигнэсэн дундаж өртөг,
 *   5) нөөцийн хөдөлгөөн, 6) мөнгөн гүйлгээ, 7) баримтын зураг, 8) аудит.
 *
 * Нөөц ЗӨВХӨН энд өөрчлөгдөнө: баталгаажуулахаас өмнө ямар ч баримт,
 * хөдөлгөөн, мөнгөн гүйлгээ үүсэхгүй. Гүйлгээ бүтэлгүйтвэл юу ч үлдэхгүй.
 *
 * Давхар гүйцэтгэлээс хамгаалах: idempotencyKey өгсөн бол ижил түлхүүртэй
 * баримт байгаа эсэхийг шалгаж, байвал шинээр үүсгэхгүй. Зэрэгцээ хоёр
 * хүсэлт зэрэг ирвэл ч unique индекс хоёр дахийг нь зогсооно.
 */
export async function postPurchase(
  input: PostPurchaseInput,
): Promise<{ id: string; purchaseNo: string; created: boolean }> {
  if (input.items.length === 0) {
    throw new Error("Дор хаяж нэг мөр нэмнэ үү.");
  }

  // Зээлээр авахад нийлүүлэгч ЗААВАЛ — өглөг хэнд үүсэхийг мэдэхгүй бол
  // тэр өр утгагүй. Гүйлгээ эхлэхээс өмнө зогсооно.
  if (input.paymentMethod === "CREDIT" && !input.supplierId) {
    throw new PayableStateError(
      "Зээлээр худалдан авахад нийлүүлэгчийг заавал сонгоно — өглөг хэнд үүсэхийг тодорхойлно.",
    );
  }

  // Аль хэдийн баталгаажсан эсэхийг гүйлгээнээс ӨМНӨ шалгана — давтан
  // дарсан тохиолдолд шинэ дугаар ч зарцуулахгүй.
  if (input.idempotencyKey) {
    const existing = await prisma.purchase.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, purchaseNo: true },
    });
    // created:false — давхардсан илгээлт. Дуудагч тал энэ тохиолдолд
    // шинээр хадгалсан файлаа устгаж, өнчин файл үлдээхгүй.
    if (existing) return { ...existing, created: false };
  }

  try {
    return await postPurchaseTransaction(input);
  } catch (error) {
    // Зэрэгцээ хоёр хүсэлт ижил түлхүүрээр яг зэрэг ирвэл нэг нь unique
    // индекст мөргөнө. Энэ нь алдаа БИШ — давхардал амжилттай зогссон
    // гэсэн үг. Ялсан хүсэлтийн үүсгэсэн баримтыг буцаана.
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const existing = await prisma.purchase.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, purchaseNo: true },
      });
      if (existing) return { ...existing, created: false };
    }
    throw error;
  }
}

/** Баталгаажуулалтын бодит гүйлгээ. Дээрх боодол давхардлыг зохицуулна. */
async function postPurchaseTransaction(
  input: PostPurchaseInput,
): Promise<{ id: string; purchaseNo: string; created: boolean }> {
  return prisma.$transaction(async (tx) => {
    const materialIds = input.items.flatMap((i) => (i.rawMaterialId ? [i.rawMaterialId] : []));
    const productIds = input.items.flatMap((i) => (i.productId ? [i.productId] : []));

    const [materials, products] = await Promise.all([
      tx.rawMaterial.findMany({ where: { id: { in: materialIds } } }),
      tx.product.findMany({ where: { id: { in: productIds } } }),
    ]);
    const materialById = new Map(materials.map((m) => [m.id, m]));
    const productById = new Map(products.map((p) => [p.id, p]));

    type Prepared = {
      subject: StockSubject;
      rawMaterialId: string | null;
      productId: string | null;
      quantity: Dec;
      unit: Unit;
      unitPrice: Dec;
      subtotal: Dec;
      baseQuantity: Dec;
      baseUnitCost: Dec;
    };

    const prepared: Prepared[] = input.items.map((item) => {
      if (Boolean(item.rawMaterialId) === Boolean(item.productId)) {
        throw new Error("Мөр бүр яг нэг бараа буюу бүтээгдэхүүнтэй байх ёстой.");
      }

      // Хоёр төрлийн субьектийг нэгэн ижил байдлаар шалгана.
      let target: { id: string; name: string; unit: Unit; isActive: boolean };
      if (item.rawMaterialId) {
        const material = materialById.get(item.rawMaterialId);
        if (!material) throw new Error("Бараа материал олдсонгүй.");
        target = material;
      } else {
        const product = productById.get(item.productId!);
        if (!product) throw new Error("Бүтээгдэхүүн олдсонгүй.");
        if (product.productType !== "RESALE") {
          throw new Error(
            `"${product.name}" нь үйлдвэрлэдэг бүтээгдэхүүн тул худалдан авалтад бүртгэхгүй.`,
          );
        }
        target = product;
      }
      if (!target.isActive) throw new Error(`"${target.name}" идэвхгүй байна.`);

      const quantity = toQty(item.quantity);
      const unitPrice = toCost(item.unitPrice);
      if (quantity.lessThanOrEqualTo(0)) {
        throw new Error(`"${target.name}" — тоо хэмжээ 0-ээс их байх ёстой.`);
      }
      if (unitPrice.lessThan(0)) {
        throw new Error(`"${target.name}" — нэгж үнэ сөрөг байж болохгүй.`);
      }
      if (!isConvertible(item.unit, target.unit)) {
        throw new Error(
          `"${target.name}" — ${unitLabel(item.unit)} нэгжийг ${unitLabel(target.unit)} рүү хөрвүүлэх боломжгүй.`,
        );
      }

      const rawMaterialId = item.rawMaterialId ?? null;
      const productId = item.productId ?? null;

      return {
        subject: subjectOf({ rawMaterialId, productId }),
        rawMaterialId,
        productId,
        quantity,
        unit: item.unit,
        unitPrice,
        subtotal: money(quantity.times(unitPrice)),
        baseQuantity: toQty(convertQuantity(quantity, item.unit, target.unit)),
        baseUnitCost: toCost(convertUnitPrice(unitPrice, item.unit, target.unit)),
      };
    });

    const totalAmount = money(prepared.reduce<Dec>((acc, p) => acc.plus(p.subtotal), ZERO));
    const purchaseNo = await nextDocumentNumber(tx, "purchase");

    const purchase = await tx.purchase.create({
      data: {
        purchaseNo,
        date: input.date,
        supplierId: input.supplierId ?? null,
        paymentMethod: input.paymentMethod,
        note: input.note ?? null,
        totalAmount,
        status: "POSTED",
        createdById: input.userId,
        idempotencyKey: input.idempotencyKey ?? null,
        items: {
          create: prepared.map((p) => ({
            rawMaterialId: p.rawMaterialId,
            productId: p.productId,
            quantity: p.quantity,
            unit: p.unit,
            unitPrice: p.unitPrice,
            subtotal: p.subtotal,
            baseQuantity: p.baseQuantity,
            baseUnitCost: p.baseUnitCost,
          })),
        },
      },
      select: { id: true, purchaseNo: true },
    });

    // Нөөц нэмэх + жигнэсэн дундаж өртөг шинэчлэх.
    for (const line of prepared) {
      await applyMovement(tx, {
        subject: line.subject,
        movementType: "PURCHASE_IN",
        quantity: line.baseQuantity,
        costPolicy: { mode: "AT_COST", unitCost: line.baseUnitCost },
        referenceType: "PURCHASE",
        referenceId: purchase.id,
        note: purchaseNo,
        userId: input.userId,
      });
    }

    // Бэлэн / банкаар төлсөн бол мөнгө гарна. Зээлээр бол гүйлгээ үүсэхгүй.
    if (input.paymentMethod !== "CREDIT" && totalAmount.greaterThan(0)) {
      await recordMoneyTransaction(tx, {
        type: "PURCHASE_PAYMENT_OUT",
        amount: totalAmount,
        sourceAccount: input.paymentMethod === "CASH" ? "CASH" : "BANK",
        referenceType: "PURCHASE",
        referenceId: purchase.id,
        note: purchaseNo,
        userId: input.userId,
        occurredAt: input.date,
      });
    }

    // Зээлээр авсан бол мөнгө хөдлөхгүй — оронд нь өглөг үүснэ. Нэг
    // худалдан авалтад ЯГ НЭГ өглөг (purchaseId unique).
    if (input.paymentMethod === "CREDIT") {
      await createPayableForPurchase(tx, {
        purchaseId: purchase.id,
        supplierId: input.supplierId ?? null,
        totalAmount,
        dueDate: input.dueDate ?? null,
        note: input.creditNote ?? null,
        userId: input.userId,
        purchaseNo,
      });
    }

    // Баримтын зураг — файл нь хадгалалтад аль хэдийн бичигдсэн, энд
    // зөвхөн мета мөр. Гүйлгээ унавал энэ мөр ч үүсэхгүй.
    if (input.receipt) {
      await tx.purchaseAttachment.create({
        data: {
          purchaseId: purchase.id,
          originalFileName: input.receipt.originalFileName,
          mimeType: input.receipt.mimeType,
          fileSize: input.receipt.fileSize,
          storageKey: input.receipt.storageKey,
          uploadedById: input.userId,
        },
      });
    }

    await writeAudit(
      {
        userId: input.userId,
        action: "PURCHASE_CONFIRMED",
        entityType: "Purchase",
        entityId: purchase.id,
        newValue: {
          purchaseNo,
          totalAmount: totalAmount.toString(),
          paymentMethod: input.paymentMethod,
          hasReceipt: Boolean(input.receipt),
          items: prepared.map((p) => ({
            rawMaterialId: p.rawMaterialId,
            baseQuantity: p.baseQuantity.toString(),
            baseUnitCost: p.baseUnitCost.toString(),
          })),
        },
        ipAddress: input.ipAddress,
      },
      tx,
    );

    return { ...purchase, created: true };
  });
}

/**
 * Худалдан авалтыг ЦУЦЛАХ — устгахгүй.
 * Эсрэг чиглэлийн хөдөлгөөн үүсгэж, дундаж өртгийг ухраана.
 */
export async function cancelPurchase(params: {
  purchaseId: string;
  userId: string;
  note: string;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({
      where: { id: params.purchaseId },
      include: { items: true },
    });
    if (!purchase) throw new Error("Худалдан авалт олдсонгүй.");
    if (purchase.status !== "POSTED") throw new Error("Зөвхөн батлагдсан баримтыг цуцална.");

    // Өглөгийг ЭХЛЭЭД шалгана: төлбөр бүртгэгдсэн бол цуцлалт бүхэлдээ
    // зогсоно — нөөц ч хөдлөхгүй, мөнгө ч буцахгүй. Нийлүүлэгчийн төлбөрийг
    // чимээгүйхэн буцаахгүй; хэрэглэгч эхлээд төлбөрөө буцаана.
    if (purchase.paymentMethod === "CREDIT") {
      await cancelPayableForPurchase(tx, {
        purchaseId: purchase.id,
        userId: params.userId,
        purchaseNo: purchase.purchaseNo,
      });
    }

    for (const item of purchase.items) {
      await applyMovement(tx, {
        subject: subjectOf(item),
        movementType: "CORRECTION_OUT",
        quantity: item.baseQuantity,
        costPolicy: { mode: "REMOVE_AT_COST", unitCost: item.baseUnitCost },
        referenceType: "PURCHASE_CANCEL",
        referenceId: purchase.id,
        note: `${purchase.purchaseNo} цуцлалт`,
        userId: params.userId,
        // Цуцлалт нь өмнөх орлогыг буцаана — түүхийн бүрэн бүтэн байдлыг
        // хадгалахын тулд үлдэгдэл хүрэлцэхгүй байсан ч зогсоохгүй.
        allowNegative: true,
      });
    }

    if (purchase.paymentMethod !== "CREDIT" && d(purchase.totalAmount).greaterThan(0)) {
      await recordMoneyTransaction(tx, {
        type: "OTHER_IN",
        amount: purchase.totalAmount,
        destinationAccount: purchase.paymentMethod === "CASH" ? "CASH" : "BANK",
        referenceType: "PURCHASE_CANCEL",
        referenceId: purchase.id,
        note: `${purchase.purchaseNo} цуцлалтын буцаалт`,
        userId: params.userId,
      });
    }

    await tx.purchase.update({
      where: { id: purchase.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelNote: params.note },
    });

    await writeAudit(
      {
        userId: params.userId,
        action: "PURCHASE_CANCELLED",
        entityType: "Purchase",
        entityId: purchase.id,
        oldValue: { status: purchase.status, totalAmount: purchase.totalAmount.toString() },
        newValue: { status: "CANCELLED" },
        note: params.note,
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}

// Шошго нь клиент талд ч хэрэгтэй тул "server-only" биш модульд байрлана.
export { PURCHASE_PAYMENT_LABEL } from "@/lib/purchases";
