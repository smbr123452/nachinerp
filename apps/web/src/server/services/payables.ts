import "server-only";
import type { Account, DocStatus, Prisma } from "@prisma/client";
import { d, money, ZERO, type Dec } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { startOfLocalDay } from "@/lib/dates";
import { recordMoneyTransaction } from "./money";

/**
 * Нийлүүлэгчийн өглөг (accounts payable).
 *
 * Хамрах хүрээ (v1): ЗӨВХӨН зээлээр (CREDIT) хийсэн худалдан авалт өглөг
 * үүсгэнэ. Зардлын зээл, эхний үлдэгдэл, авлага, ерөнхий дэвтэр — хамрахгүй.
 *
 * ГОЛ НЯГТЛАН БОДОХ ДҮРЭМ: нийлүүлэгчид хийсэн төлбөр нь ЗАРДАЛ БИШ.
 * Барааны өртөг худалдан авалтын үед аль хэдийн нөөцөд суусан бөгөөд
 * борлуулалтын үед ББӨ болж хүлээн зөвшөөрөгдөнө. Төлбөр нь зөвхөн:
 *   мөнгө гарах  +  өр буурах
 * Тиймээс төлбөр нь Expense, ББӨ, нөөц, жигнэсэн дундаж өртөг, PurchaseItem
 * аль нэгийг нь ХӨНДӨХГҮЙ.
 *
 * Төлсөн дүн ба үлдэгдлийг ХАДГАЛАХГҮЙ — батлагдсан төлбөрүүдээс тооцно.
 * Ингэснээр хадгалсан утга ба бодит түүх хоёр хэзээ ч зөрөхгүй.
 */

export const PAYABLE_REFERENCE = "SUPPLIER_PAYMENT";
export const PAYABLE_REVERSAL_REFERENCE = "SUPPLIER_PAYMENT_REVERSAL";

/** Prisma-ийн давхардлын алдаа (P2002). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export class PayableStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayableStateError";
  }
}

/**
 * Өглөгийн харагдах төлөв. Хадгалагддаггүй — үлдэгдэл ба хугацаанаас
 * тооцогдоно.
 *
 *   PAID    — үлдэгдэл 0
 *   OVERDUE — үлдэгдэлтэй бөгөөд төлөх өдөр өнгөрсөн (хэсэгчлэн төлсөн ч)
 *   PARTIAL — үлдэгдэлтэй, төлсөн дүн 0-ээс их
 *   UNPAID  — үлдэгдэлтэй, огт төлөөгүй
 */
export type PayableStatus = "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";

export function derivePayableStatus(params: {
  paid: Dec;
  outstanding: Dec;
  dueDate: Date | null;
  now?: Date;
}): PayableStatus {
  if (params.outstanding.lessThanOrEqualTo(0)) return "PAID";
  // Хугацаа хэтэрсэн нь хэсэгчилсэн төлөлтөөс ДЭЭГҮҮР харагдана.
  //
  // Төлөх өдөр өөрөө хэтэрсэнд тооцогдохгүй: тухайн өдрийн турш төлж
  // болно. Тиймээс өнөөдрийн эхлэлтэй харьцуулна.
  if (
    params.dueDate &&
    params.dueDate.getTime() < startOfLocalDay(params.now ?? new Date()).getTime()
  ) {
    return "OVERDUE";
  }
  return params.paid.greaterThan(0) ? "PARTIAL" : "UNPAID";
}

export const PAYABLE_STATUS_LABEL: Record<PayableStatus, string> = {
  UNPAID: "Төлөгдөөгүй",
  PARTIAL: "Хэсэгчлэн төлсөн",
  PAID: "Төлөгдсөн",
  OVERDUE: "Хугацаа хэтэрсэн",
};

/** Батлагдсан төлбөрүүдийн нийлбэр. Буцаагдсан төлбөр тооцогдохгүй. */
export function paidFromPayments(payments: { amount: Prisma.Decimal; status: DocStatus }[]): Dec {
  return money(
    payments
      .filter((p) => p.status === "POSTED")
      .reduce<Dec>((acc, p) => acc.plus(d(p.amount)), ZERO),
  );
}

/** Үлдэгдэл нь ХЭЗЭЭ Ч сөрөг болохгүй. */
export function outstandingOf(originalAmount: Prisma.Decimal | Dec, paid: Dec): Dec {
  const remaining = money(d(originalAmount).minus(paid));
  return remaining.greaterThan(0) ? remaining : ZERO;
}

// ---------------------------------------------------------------------------
// Өглөг үүсгэх (зээлээр худалдан авалт батлагдахад)
// ---------------------------------------------------------------------------

/**
 * Зээлээр худалдан авалтад өглөг үүсгэнэ.
 *
 * Худалдан авалтын гүйлгээний ДОТОР дуудагдана — баримт, нөөц, өглөг гурав
 * нэг атомт үйлдэл болно. Гүйлгээ унавал өглөг ч үүсэхгүй.
 *
 * Нийлүүлэгч ЗААВАЛ шаардагдана: хэнд өртэй нь тодорхойгүй өр утгагүй.
 */
export async function createPayableForPurchase(
  tx: Tx,
  params: {
    purchaseId: string;
    supplierId: string | null;
    totalAmount: Dec | Prisma.Decimal;
    dueDate?: Date | null;
    note?: string | null;
    userId: string;
    purchaseNo: string;
  },
): Promise<{ id: string } | null> {
  if (!params.supplierId) {
    throw new PayableStateError(
      "Зээлээр худалдан авахад нийлүүлэгчийг заавал сонгоно — өглөг хэнд үүсэхийг тодорхойлно.",
    );
  }

  const amount = money(params.totalAmount);
  // Тэг дүнтэй зээл өр биш — өглөг үүсгэхгүй.
  if (amount.lessThanOrEqualTo(0)) return null;

  const payable = await tx.supplierPayable.create({
    data: {
      purchaseId: params.purchaseId,
      supplierId: params.supplierId,
      originalAmount: amount,
      dueDate: params.dueDate ?? null,
      note: params.note ?? null,
      status: "POSTED",
      createdById: params.userId,
    },
    select: { id: true },
  });

  await writeAudit(
    {
      userId: params.userId,
      action: "SUPPLIER_PAYABLE_CREATED",
      entityType: "SupplierPayable",
      entityId: payable.id,
      newValue: {
        purchaseNo: params.purchaseNo,
        supplierId: params.supplierId,
        originalAmount: amount.toFixed(2),
        dueDate: params.dueDate ? params.dueDate.toISOString() : null,
      },
    },
    tx,
  );

  return payable;
}

/**
 * Худалдан авалт цуцлагдахад өглөгийг хаах.
 *
 * Батлагдсан төлбөртэй бол цуцлалтыг ЗОГСООНО — төлсөн мөнгийг чимээгүйхэн
 * буцаах нь мөнгөн дэвтрийг эвдэнэ. Эхлээд төлбөрүүдийг буцаах ёстой.
 */
export async function cancelPayableForPurchase(
  tx: Tx,
  params: { purchaseId: string; userId: string; purchaseNo: string },
): Promise<void> {
  const payable = await tx.supplierPayable.findUnique({
    where: { purchaseId: params.purchaseId },
    include: { payments: { select: { id: true, status: true } } },
  });
  if (!payable) return;

  const posted = payable.payments.filter((p) => p.status === "POSTED");
  if (posted.length > 0) {
    throw new PayableStateError(
      "Энэ худалдан авалтад төлбөр бүртгэгдсэн байна. Эхлээд өглөгийн төлбөрүүдийг буцаана уу.",
    );
  }

  if (payable.status === "CANCELLED") return;

  await tx.supplierPayable.update({
    where: { id: payable.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  await writeAudit(
    {
      userId: params.userId,
      action: "SUPPLIER_PAYABLE_CANCELLED",
      entityType: "SupplierPayable",
      entityId: payable.id,
      oldValue: { status: "POSTED" },
      newValue: { status: "CANCELLED", purchaseNo: params.purchaseNo },
    },
    tx,
  );
}

// ---------------------------------------------------------------------------
// Төлбөр
// ---------------------------------------------------------------------------

export type RecordPaymentInput = {
  payableId: string;
  amount: string | number;
  account: Account;
  paidAt: Date;
  note?: string | null;
  reference?: string | null;
  userId: string;
  idempotencyKey?: string | null;
  ipAddress?: string | null;
};

export type RecordPaymentResult = {
  paymentId: string;
  paid: Dec;
  outstanding: Dec;
  status: PayableStatus;
  /** false бол давхардсан илгээлт — шинэ төлбөр үүсээгүй. */
  created: boolean;
};

/**
 * Нийлүүлэгчид төлбөр хийх.
 *
 * Нэг гүйлгээнд: өглөгийг түгжих → үлдэгдлийг ДАХИН тооцох → хэтрэлтийг
 * шалгах → төлбөр бичих → мөнгө гаргах → аудит.
 *
 * Мөнгө ЗӨВХӨН энд гарна. Нөөц, өртөг, зардал хөндөгдөхгүй.
 *
 * Давхар дарахаас хамгаалах: idempotencyKey өгсөн бол ижил түлхүүртэй
 * төлбөр аль хэдийн байгаа эсэхийг шалгана. Зэрэгцээ хоёр хүсэлт яг зэрэг
 * ирвэл unique индекс хоёр дахийг нь зогсооно.
 */
export async function recordSupplierPayment(
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  if (input.idempotencyKey) {
    const existing = await findPaymentByKey(input.idempotencyKey);
    if (existing) return existing;
  }

  try {
    return await recordPaymentTransaction(input);
  } catch (error) {
    // Зэрэгцээ давхардал — алдаа биш, давхардал зогссон гэсэн үг.
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const existing = await findPaymentByKey(input.idempotencyKey);
      if (existing) return existing;
    }
    throw error;
  }
}

async function findPaymentByKey(key: string): Promise<RecordPaymentResult | null> {
  const payment = await prisma.supplierPayment.findUnique({
    where: { idempotencyKey: key },
    include: { payable: { include: { payments: true } } },
  });
  if (!payment) return null;
  const paid = paidFromPayments(payment.payable.payments);
  const outstanding = outstandingOf(payment.payable.originalAmount, paid);
  return {
    paymentId: payment.id,
    paid,
    outstanding,
    status: derivePayableStatus({ paid, outstanding, dueDate: payment.payable.dueDate }),
    created: false,
  };
}

async function recordPaymentTransaction(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  return prisma.$transaction(async (tx) => {
    // Түгжсэнээр зэрэгцээ хоёр төлбөр нийлээд үлдэгдлээс хэтрэх боломжгүй.
    await tx.$queryRaw`SELECT id FROM "SupplierPayable" WHERE id = ${input.payableId} FOR UPDATE`;
    const payable = await tx.supplierPayable.findUnique({
      where: { id: input.payableId },
      include: { payments: true, purchase: { select: { purchaseNo: true, status: true } } },
    });
    if (!payable) throw new PayableStateError("Өглөг олдсонгүй.");

    // Давхардсан илгээлт энд ирсэн бол өмнөх үр дүнг буцаана.
    if (input.idempotencyKey) {
      const already = payable.payments.find((p) => p.idempotencyKey === input.idempotencyKey);
      if (already) {
        const paid = paidFromPayments(payable.payments);
        const outstanding = outstandingOf(payable.originalAmount, paid);
        return {
          paymentId: already.id,
          paid,
          outstanding,
          status: derivePayableStatus({ paid, outstanding, dueDate: payable.dueDate }),
          created: false,
        };
      }
    }

    if (payable.status !== "POSTED") {
      throw new PayableStateError("Цуцлагдсан өглөгт төлбөр хийх боломжгүй.");
    }
    if (payable.purchase.status !== "POSTED") {
      throw new PayableStateError("Цуцлагдсан худалдан авалтад төлбөр хийх боломжгүй.");
    }

    const amount = money(input.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw new PayableStateError("Төлөх дүн 0-ээс их байх ёстой.");
    }

    const paidBefore = paidFromPayments(payable.payments);
    const outstandingBefore = outstandingOf(payable.originalAmount, paidBefore);

    if (outstandingBefore.lessThanOrEqualTo(0)) {
      throw new PayableStateError("Энэ өглөг бүрэн төлөгдсөн байна.");
    }
    // Илүү төлөлт хориотой — өглөг сөрөг болох боломжгүй.
    if (amount.greaterThan(outstandingBefore)) {
      throw new PayableStateError(
        `Төлөх дүн үлдэгдлээс хэтэрсэн байна. Үлдэгдэл: ${outstandingBefore.toFixed(2)}₮.`,
      );
    }

    const payment = await tx.supplierPayment.create({
      data: {
        payableId: payable.id,
        amount,
        account: input.account,
        paidAt: input.paidAt,
        note: input.note?.trim() || null,
        reference: input.reference?.trim() || null,
        status: "POSTED",
        idempotencyKey: input.idempotencyKey ?? null,
        createdById: input.userId,
      },
      select: { id: true },
    });

    // Мөнгө гарах ГАНЦ бичлэг. Зардал, ББӨ, нөөц ҮҮСГЭХГҮЙ — барааны өртөг
    // худалдан авалтын үед аль хэдийн бүртгэгдсэн.
    await recordMoneyTransaction(tx, {
      type: "SUPPLIER_PAYMENT_OUT",
      amount,
      sourceAccount: input.account,
      referenceType: PAYABLE_REFERENCE,
      referenceId: payment.id,
      note: `${payable.purchase.purchaseNo} — нийлүүлэгчийн төлбөр`,
      userId: input.userId,
      occurredAt: input.paidAt,
    });

    const paid = money(paidBefore.plus(amount));
    const outstanding = outstandingOf(payable.originalAmount, paid);
    const status = derivePayableStatus({ paid, outstanding, dueDate: payable.dueDate });

    await writeAudit(
      {
        userId: input.userId,
        action: "SUPPLIER_PAYMENT_RECORDED",
        entityType: "SupplierPayment",
        entityId: payment.id,
        newValue: {
          purchaseNo: payable.purchase.purchaseNo,
          payableId: payable.id,
          amount: amount.toFixed(2),
          account: input.account,
          paidAfter: paid.toFixed(2),
          outstandingAfter: outstanding.toFixed(2),
          status,
        },
        note: input.note?.trim() || null,
        ipAddress: input.ipAddress,
      },
      tx,
    );

    return { paymentId: payment.id, paid, outstanding, status, created: true };
  });
}

/**
 * Төлбөрийг БУЦААХ — зөвхөн эзэн (эрхийн шалгалт action давхаргад).
 *
 * Эх бичлэгийг устгахгүй: төлбөр REVERSED болж, эсрэг чиглэлийн мөнгөн
 * гүйлгээ үүснэ. Өглөгийн үлдэгдэл автоматаар сэргэнэ — тооцоологддог тул
 * тусад нь залруулах шаардлагагүй.
 */
export async function reverseSupplierPayment(params: {
  paymentId: string;
  userId: string;
  note?: string | null;
  ipAddress?: string | null;
}): Promise<{ paid: Dec; outstanding: Dec; status: PayableStatus }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SupplierPayment" WHERE id = ${params.paymentId} FOR UPDATE`;
    const payment = await tx.supplierPayment.findUnique({
      where: { id: params.paymentId },
      include: {
        payable: { include: { payments: true, purchase: { select: { purchaseNo: true } } } },
      },
    });
    if (!payment) throw new PayableStateError("Төлбөр олдсонгүй.");
    if (payment.status === "REVERSED") {
      throw new PayableStateError("Энэ төлбөр аль хэдийн буцаагдсан байна.");
    }
    if (payment.status !== "POSTED") {
      throw new PayableStateError("Зөвхөн батлагдсан төлбөрийг буцаана.");
    }

    await tx.supplierPayment.update({
      where: { id: payment.id },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
        reversedById: params.userId,
        reversalNote: params.note?.trim() || null,
      },
    });

    // Мөнгийг данс руу нь буцаана. Эх гүйлгээг устгахгүй.
    await recordMoneyTransaction(tx, {
      type: "SUPPLIER_PAYMENT_REVERSAL_IN",
      amount: payment.amount,
      destinationAccount: payment.account,
      referenceType: PAYABLE_REVERSAL_REFERENCE,
      referenceId: payment.id,
      note: `${payment.payable.purchase.purchaseNo} — төлбөрийн буцаалт`,
      userId: params.userId,
    });

    const remaining = payment.payable.payments.filter(
      (p) => p.id !== payment.id && p.status === "POSTED",
    );
    const paid = paidFromPayments(remaining);
    const outstanding = outstandingOf(payment.payable.originalAmount, paid);
    const status = derivePayableStatus({ paid, outstanding, dueDate: payment.payable.dueDate });

    await writeAudit(
      {
        userId: params.userId,
        action: "SUPPLIER_PAYMENT_REVERSED",
        entityType: "SupplierPayment",
        entityId: payment.id,
        oldValue: { status: "POSTED", amount: d(payment.amount).toFixed(2) },
        newValue: {
          paymentStatus: "REVERSED",
          purchaseNo: payment.payable.purchase.purchaseNo,
          account: payment.account,
          paidAfter: paid.toFixed(2),
          outstandingAfter: outstanding.toFixed(2),
          payableStatus: status,
        },
        note: params.note?.trim() || null,
        ipAddress: params.ipAddress,
      },
      tx,
    );

    return { paid, outstanding, status };
  });
}

// ---------------------------------------------------------------------------
// Уншилт ба нэгтгэл
// ---------------------------------------------------------------------------
//
// Төлсөн дүн, үлдэгдэл, төлөв — бүгд батлагдсан төлбөрүүдээс тооцогдоно.
// Нийлүүлэгчийн "балансыг" тусад нь хадгалж, гараар шинэчилдэггүй: тийм
// талбар байвал эрт орой нэгэн цагт бодит түүхээсээ зөрнө.

export type PayablePaymentView = {
  id: string;
  amount: Dec;
  account: Account;
  paidAt: Date;
  note: string | null;
  reference: string | null;
  status: DocStatus;
  createdByName: string;
  reversedAt: Date | null;
  reversedByName: string | null;
  reversalNote: string | null;
};

export type PayableView = {
  id: string;
  purchaseId: string;
  purchaseNo: string;
  purchaseDate: Date;
  purchaseStatus: DocStatus;
  supplierId: string;
  supplierName: string;
  originalAmount: Dec;
  paid: Dec;
  outstanding: Dec;
  dueDate: Date | null;
  note: string | null;
  status: PayableStatus;
  /** Баримтын төлөв: POSTED эсвэл CANCELLED (худалдан авалт цуцлагдсан). */
  docStatus: DocStatus;
  payments: PayablePaymentView[];
};

const PAYABLE_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  purchase: { select: { id: true, purchaseNo: true, date: true, status: true } },
  payments: {
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    include: {
      createdBy: { select: { name: true } },
      reversedBy: { select: { name: true } },
    },
  },
} satisfies Prisma.SupplierPayableInclude;

type PayableRow = Prisma.SupplierPayableGetPayload<{ include: typeof PAYABLE_INCLUDE }>;

function toPayableView(row: PayableRow, now = new Date()): PayableView {
  const paid = paidFromPayments(row.payments);
  const outstanding = outstandingOf(row.originalAmount, paid);
  return {
    id: row.id,
    purchaseId: row.purchaseId,
    purchaseNo: row.purchase.purchaseNo,
    purchaseDate: row.purchase.date,
    purchaseStatus: row.purchase.status,
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    originalAmount: money(row.originalAmount),
    paid,
    outstanding,
    dueDate: row.dueDate,
    note: row.note,
    status: derivePayableStatus({ paid, outstanding, dueDate: row.dueDate, now }),
    docStatus: row.status,
    payments: row.payments.map((p) => ({
      id: p.id,
      amount: money(p.amount),
      account: p.account,
      paidAt: p.paidAt,
      note: p.note,
      reference: p.reference,
      status: p.status,
      createdByName: p.createdBy.name,
      reversedAt: p.reversedAt,
      reversedByName: p.reversedBy?.name ?? null,
      reversalNote: p.reversalNote,
    })),
  };
}

/** Худалдан авалтын өглөг. Зээлийн бус, эсвэл өглөггүй бол null. */
export async function getPayableForPurchase(purchaseId: string): Promise<PayableView | null> {
  const row = await prisma.supplierPayable.findUnique({
    where: { purchaseId },
    include: PAYABLE_INCLUDE,
  });
  return row ? toPayableView(row) : null;
}

export async function getPayableById(payableId: string): Promise<PayableView | null> {
  const row = await prisma.supplierPayable.findUnique({
    where: { id: payableId },
    include: PAYABLE_INCLUDE,
  });
  return row ? toPayableView(row) : null;
}

export type PayableListFilter = {
  supplierId?: string | null;
  /** Зөвхөн хугацаа хэтэрсэн. */
  overdueOnly?: boolean;
  /** Харагдах төлвөөр шүүх (тооцоолсон төлөв тул санах ойд шүүгдэнэ). */
  status?: PayableStatus | null;
  /** Төлөх хугацааны хязгаар. */
  dueFrom?: Date | null;
  dueTo?: Date | null;
  now?: Date;
};

/**
 * Идэвхтэй өглөгүүд. Цуцлагдсан өглөг (худалдан авалт цуцлагдсан) орохгүй.
 *
 * Төлөв нь тооцоологддог тул SQL-ээр шүүх боломжгүй — идэвхтэй мөрүүдийг
 * авчраад санах ойд шүүнэ. Нэг цэгийн өглөгийн тоо хэдэн зуугаар хэмжигдэх
 * тул энэ нь асуудалгүй.
 */
export async function listPayables(filter: PayableListFilter = {}): Promise<PayableView[]> {
  const now = filter.now ?? new Date();
  const where: Prisma.SupplierPayableWhereInput = { status: "POSTED" };
  if (filter.supplierId) where.supplierId = filter.supplierId;
  if (filter.dueFrom || filter.dueTo) {
    where.dueDate = {
      ...(filter.dueFrom ? { gte: filter.dueFrom } : {}),
      ...(filter.dueTo ? { lte: filter.dueTo } : {}),
    };
  }

  const rows = await prisma.supplierPayable.findMany({
    where,
    include: PAYABLE_INCLUDE,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  let views = rows.map((row) => toPayableView(row, now));
  if (filter.overdueOnly) views = views.filter((v) => v.status === "OVERDUE");
  if (filter.status) views = views.filter((v) => v.status === filter.status);
  return views;
}

export type PayableTotals = {
  /** Нийт үлдэгдэл өглөг. */
  totalOutstanding: Dec;
  /** Хугацаа хэтэрсэн үлдэгдэл. */
  overdueOutstanding: Dec;
  /** Ойрын 7 хоногт төлөх үлдэгдэл (хугацаа хэтрээгүй). */
  dueSoonOutstanding: Dec;
  /** Үлдэгдэлтэй өглөгийн тоо. */
  openCount: number;
  overdueCount: number;
  dueSoonCount: number;
};

const DUE_SOON_DAYS = 7;

export function totalsFromPayables(payables: PayableView[], now = new Date()): PayableTotals {
  const horizon = new Date(now.getTime() + DUE_SOON_DAYS * 24 * 60 * 60 * 1000);
  let totalOutstanding = ZERO;
  let overdueOutstanding = ZERO;
  let dueSoonOutstanding = ZERO;
  let openCount = 0;
  let overdueCount = 0;
  let dueSoonCount = 0;

  for (const p of payables) {
    if (p.outstanding.lessThanOrEqualTo(0)) continue;
    totalOutstanding = totalOutstanding.plus(p.outstanding);
    openCount += 1;
    if (p.status === "OVERDUE") {
      overdueOutstanding = overdueOutstanding.plus(p.outstanding);
      overdueCount += 1;
    } else if (p.dueDate && p.dueDate.getTime() <= horizon.getTime()) {
      dueSoonOutstanding = dueSoonOutstanding.plus(p.outstanding);
      dueSoonCount += 1;
    }
  }

  return {
    totalOutstanding: money(totalOutstanding),
    overdueOutstanding: money(overdueOutstanding),
    dueSoonOutstanding: money(dueSoonOutstanding),
    openCount,
    overdueCount,
    dueSoonCount,
  };
}

/** Бүх нийлүүлэгчийн нэгдсэн өглөгийн үзүүлэлт. */
export async function getPayableTotals(now = new Date()): Promise<PayableTotals> {
  return totalsFromPayables(await listPayables({ now }), now);
}

/** Нэг нийлүүлэгчийн өглөг. */
export async function getSupplierPayableSummary(
  supplierId: string,
  now = new Date(),
): Promise<{ totals: PayableTotals; payables: PayableView[] }> {
  const payables = await listPayables({ supplierId, now });
  return { totals: totalsFromPayables(payables, now), payables };
}

/** Ойрын төлөлтүүд — хугацаа хэтэрсэн нь эхэлж, дараа нь ойртож буй. */
export async function getUpcomingPayables(limit = 5, now = new Date()): Promise<PayableView[]> {
  const open = (await listPayables({ now })).filter((p) => p.outstanding.greaterThan(0));
  const rank = (p: PayableView) => (p.status === "OVERDUE" ? 0 : p.dueDate ? 1 : 2);
  return open
    .sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      const aDue = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const bDue = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return b.outstanding.comparedTo(a.outstanding);
    })
    .slice(0, limit);
}
