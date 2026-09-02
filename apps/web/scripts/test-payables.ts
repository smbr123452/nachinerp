/**
 * Нийлүүлэгчийн өглөгийн шалгалт (A–P).
 *
 * Тест нь ӨӨРИЙН түүхий эд, нийлүүлэгчийг үүсгэж, эцэст нь бүгдийг устгана —
 * бодит өгөгдлийн нөөц, жигнэсэн дундаж өртөгт ХҮРЭХГҮЙ.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { postPurchase, cancelPurchase } from "../src/server/services/purchases";
import {
  derivePayableStatus,
  getPayableForPurchase,
  getPayableTotals,
  getSupplierPayableSummary,
  listPayables,
  recordSupplierPayment,
  reverseSupplierPayment,
} from "../src/server/services/payables";
import { getAccountBalances } from "../src/server/services/money";

const prisma = new PrismaClient();
const D = Prisma.Decimal;
let fails = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails += 1;
}
async function expectThrow(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const STAMP = Date.now();

async function main() {
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });

  // Тестийн тусгаарлагдсан бараа ба нийлүүлэгч.
  const material = await prisma.rawMaterial.create({
    data: { sku: `__PAY-${STAMP}`, name: `Тест материал ${STAMP}`, unit: "KG", isActive: true },
  });
  const supplier = await prisma.supplier.create({
    data: { name: `Тест нийлүүлэгч ${STAMP}` },
  });

  const purchaseIds: string[] = [];
  const paymentIds: string[] = [];

  const before = {
    expenses: await prisma.expense.count(),
    sales: await prisma.saleBatch.count(),
    money: await prisma.moneyTransaction.count(),
    balances: await getAccountBalances(prisma),
  };

  try {
    // ---- A. Бэлнээр — өглөг үүсэхгүй, мөнгө гарна ------------------------
    const cash = await postPurchase({
      date: new Date(), paymentMethod: "CASH", supplierId: supplier.id, userId: owner.id,
      items: [{ rawMaterialId: material.id, quantity: 1, unit: "KG", unitPrice: 1000 }],
    });
    purchaseIds.push(cash.id);
    check("A1. Бэлэн худалдан авалтад өглөг үүсэхгүй",
      (await getPayableForPurchase(cash.id)) === null);
    check("A2. Бэлэн худалдан авалт мөнгө гаргана",
      (await prisma.moneyTransaction.count({
        where: { referenceId: cash.id, type: "PURCHASE_PAYMENT_OUT" },
      })) === 1);

    // ---- B. Банкаар — өглөг үүсэхгүй ------------------------------------
    const bank = await postPurchase({
      date: new Date(), paymentMethod: "BANK", supplierId: supplier.id, userId: owner.id,
      items: [{ rawMaterialId: material.id, quantity: 1, unit: "KG", unitPrice: 1000 }],
    });
    purchaseIds.push(bank.id);
    check("B1. Банкны худалдан авалтад өглөг үүсэхгүй",
      (await getPayableForPurchase(bank.id)) === null);
    check("B2. Банкны худалдан авалт мөнгө гаргана",
      (await prisma.moneyTransaction.count({
        where: { referenceId: bank.id, type: "PURCHASE_PAYMENT_OUT" },
      })) === 1);

    // ---- C. Зээлээр ₮5,000,000 — өглөг үүснэ, мөнгө хөдлөхгүй -----------
    const dueDate = new Date(Date.now() + 10 * 86_400_000);
    const credit = await postPurchase({
      date: new Date(), paymentMethod: "CREDIT", supplierId: supplier.id, userId: owner.id,
      dueDate, creditNote: "Тестийн зээл",
      items: [{ rawMaterialId: material.id, quantity: 100, unit: "KG", unitPrice: 50_000 }],
    });
    purchaseIds.push(credit.id);
    const wacAfterCredit = new D(
      (await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } })).averageCost,
    );
    const p = await getPayableForPurchase(credit.id);
    check("C1. Зээлийн худалдан авалтад өглөг үүсэв", p !== null);
    check("C2. Өглөгийн дүн 5,000,000", p !== null && p.originalAmount.equals(5_000_000),
      p?.originalAmount.toString());
    check("C3. Зээлийн худалдан авалт мөнгө ГАРГАХГҮЙ",
      (await prisma.moneyTransaction.count({ where: { referenceId: credit.id } })) === 0);
    check("C4. Нөөц нэмэгдэв",
      new D((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } })).quantity)
        .equals(102));
    check("C5. Төлөв UNPAID", p?.status === "UNPAID", p?.status);
    check("C6. Нэг худалдан авалтад НЭГ өглөг",
      (await prisma.supplierPayable.count({ where: { purchaseId: credit.id } })) === 1);

    // Зээлээр авахад нийлүүлэгч заавал.
    const noSupplier = await expectThrow(() =>
      postPurchase({
        date: new Date(), paymentMethod: "CREDIT", userId: owner.id,
        items: [{ rawMaterialId: material.id, quantity: 1, unit: "KG", unitPrice: 10 }],
      }),
    );
    check("C7. Нийлүүлэгчгүй зээл татгалзагдав", (noSupplier ?? "").includes("нийлүүлэгч"),
      noSupplier ?? "алдаа гараагүй");

    const payableId = p!.id;

    // ---- D. Хэсэгчилсэн төлбөр ₮2,000,000 -------------------------------
    const cashBefore = (await getAccountBalances(prisma)).cash;
    const pay1 = await recordSupplierPayment({
      payableId, amount: 2_000_000, account: "CASH", paidAt: new Date(), userId: owner.id,
    });
    paymentIds.push(pay1.paymentId);
    check("D1. Төлсөн 2,000,000", pay1.paid.equals(2_000_000), pay1.paid.toString());
    check("D2. Үлдэгдэл 3,000,000", pay1.outstanding.equals(3_000_000), pay1.outstanding.toString());
    check("D3. Төлөв PARTIAL", pay1.status === "PARTIAL", pay1.status);
    check("D4. ЯГ НЭГ мөнгөн гүйлгээ үүсэв",
      (await prisma.moneyTransaction.count({
        where: { referenceId: pay1.paymentId, type: "SUPPLIER_PAYMENT_OUT" },
      })) === 1);
    check("D5. Кассаас 2,000,000 гарав",
      (await getAccountBalances(prisma)).cash.equals(cashBefore.minus(2_000_000)));

    // ---- F. Илүү төлөлт татгалзагдана ------------------------------------
    const over = await expectThrow(() =>
      recordSupplierPayment({
        payableId, amount: 3_000_001, account: "CASH", paidAt: new Date(), userId: owner.id,
      }),
    );
    check("F1. Үлдэгдлээс их төлбөр татгалзагдав", (over ?? "").includes("хэтэрсэн"),
      over ?? "алдаа гараагүй");
    const negative = await expectThrow(() =>
      recordSupplierPayment({
        payableId, amount: -100, account: "CASH", paidAt: new Date(), userId: owner.id,
      }),
    );
    check("F2. Сөрөг төлбөр татгалзагдав", negative !== null, negative ?? "алдаа гараагүй");

    // ---- M. Төлбөрийн давхар илгээлт -------------------------------------
    const key = `__paytest-${STAMP}`;
    const dup1 = await recordSupplierPayment({
      payableId, amount: 500_000, account: "BANK", paidAt: new Date(), userId: owner.id,
      idempotencyKey: key,
    });
    const dup2 = await recordSupplierPayment({
      payableId, amount: 500_000, account: "BANK", paidAt: new Date(), userId: owner.id,
      idempotencyKey: key,
    });
    paymentIds.push(dup1.paymentId);
    check("M1. Ижил түлхүүр ШИНЭ төлбөр үүсгэхгүй",
      dup1.paymentId === dup2.paymentId && dup2.created === false);
    check("M2. Мөнгө хоёр дахин гараагүй",
      (await prisma.moneyTransaction.count({ where: { referenceId: dup1.paymentId } })) === 1);
    check("M3. Үлдэгдэл 2,500,000", dup2.outstanding.equals(2_500_000), dup2.outstanding.toString());

    // ---- I. Буцаалт --------------------------------------------------------
    const rev = await reverseSupplierPayment({
      paymentId: dup1.paymentId, userId: owner.id, note: "Тест буцаалт",
    });
    check("I1. Буцаалтын дараа үлдэгдэл 3,000,000", rev.outstanding.equals(3_000_000),
      rev.outstanding.toString());
    check("I2. Төлбөр УСТААГҮЙ, REVERSED болов",
      (await prisma.supplierPayment.findUniqueOrThrow({ where: { id: dup1.paymentId } })).status ===
        "REVERSED");
    check("I3. Эсрэг мөнгөн гүйлгээ үүсэв",
      (await prisma.moneyTransaction.count({
        where: { referenceId: dup1.paymentId, type: "SUPPLIER_PAYMENT_REVERSAL_IN" },
      })) === 1);
    check("I4. Дахин буцаах боломжгүй",
      (await expectThrow(() =>
        reverseSupplierPayment({ paymentId: dup1.paymentId, userId: owner.id, note: "дахин" }),
      )) !== null);
    check("I5. Буцаалт аудитад бүртгэгдэв",
      (await prisma.auditLog.count({
        where: { action: "SUPPLIER_PAYMENT_REVERSED", entityId: dup1.paymentId },
      })) === 1);

    // ---- E. Эцсийн төлбөр ₮3,000,000 → PAID -------------------------------
    const pay2 = await recordSupplierPayment({
      payableId, amount: 3_000_000, account: "BANK", paidAt: new Date(), userId: owner.id,
    });
    paymentIds.push(pay2.paymentId);
    check("E1. Үлдэгдэл 0", pay2.outstanding.isZero(), pay2.outstanding.toString());
    check("E2. Төлөв PAID", pay2.status === "PAID", pay2.status);

    // ---- G. Бүрэн төлөгдсөн өглөгт төлбөр хийхгүй --------------------------
    const paidErr = await expectThrow(() =>
      recordSupplierPayment({
        payableId, amount: 1, account: "CASH", paidAt: new Date(), userId: owner.id,
      }),
    );
    check("G1. Төлөгдсөн өглөгт төлбөр татгалзагдав", (paidErr ?? "").includes("төлөгдсөн"),
      paidErr ?? "алдаа гараагүй");

    // Төлбөр нь өртөг, нөөцийг ХӨНДӨӨГҮЙ (шинэ худалдан авалт хийхээс ӨМНӨ
    // шалгана — дараагийн орлого дундаж өртгийг зүй ёсоор өөрчилнө).
    const afterPayments = await prisma.rawMaterial.findUniqueOrThrow({
      where: { id: material.id },
    });
    check("P3. Төлбөрийн дараа жигнэсэн дундаж өртөг ӨӨРЧЛӨГДӨӨГҮЙ",
      new D(afterPayments.averageCost).equals(wacAfterCredit),
      `${afterPayments.averageCost} vs ${wacAfterCredit}`);
    check("P3b. Төлбөрийн дараа нөөцийн үлдэгдэл ӨӨРЧЛӨГДӨӨГҮЙ",
      new D(afterPayments.quantity).equals(102), afterPayments.quantity.toString());

    // ---- H. Хугацаа хэтэрсэн төлөв ----------------------------------------
    const yesterday = new Date(Date.now() - 2 * 86_400_000);
    check("H1. Хугацаа хэтэрсэн бол OVERDUE",
      derivePayableStatus({
        paid: new D(0), outstanding: new D(100), dueDate: yesterday,
      }) === "OVERDUE");
    check("H2. Хэсэгчлэн төлсөн ч хугацаа хэтэрвэл OVERDUE",
      derivePayableStatus({
        paid: new D(50), outstanding: new D(50), dueDate: yesterday,
      }) === "OVERDUE");
    check("H3. Төлөх өдөр өнөөдөр бол хэтрээгүй",
      derivePayableStatus({
        paid: new D(0), outstanding: new D(100), dueDate: new Date(),
      }) === "UNPAID");
    check("H4. Бүрэн төлсөн бол хугацаа хэтэрсэн ч PAID",
      derivePayableStatus({
        paid: new D(100), outstanding: new D(0), dueDate: yesterday,
      }) === "PAID");
    check("H5. Үлдэгдэл сөрөг болохгүй",
      derivePayableStatus({
        paid: new D(120), outstanding: new D(0), dueDate: null,
      }) === "PAID");

    // ---- K. Төлбөртэй худалдан авалтыг цуцлахыг хаана ----------------------
    const cancelBlocked = await expectThrow(() =>
      cancelPurchase({ purchaseId: credit.id, userId: owner.id, note: "тест" }),
    );
    check("K1. Төлбөртэй зээлийн худалдан авалт цуцлагдахгүй",
      (cancelBlocked ?? "").includes("төлбөр бүртгэгдсэн"), cancelBlocked ?? "алдаа гараагүй");
    check("K2. Цуцлалт зогссон тул нөөц хэвээр",
      new D((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } })).quantity)
        .equals(102));
    check("K3. Төлбөр чимээгүй буцаагдаагүй",
      (await prisma.supplierPayment.count({ where: { payableId, status: "POSTED" } })) === 2);

    // ---- J. Төлбөргүй зээлийн худалдан авалтыг цуцална ---------------------
    const credit2 = await postPurchase({
      date: new Date(), paymentMethod: "CREDIT", supplierId: supplier.id, userId: owner.id,
      items: [{ rawMaterialId: material.id, quantity: 2, unit: "KG", unitPrice: 1000 }],
    });
    purchaseIds.push(credit2.id);
    await cancelPurchase({ purchaseId: credit2.id, userId: owner.id, note: "тест цуцлалт" });
    const closed = await prisma.supplierPayable.findUniqueOrThrow({
      where: { purchaseId: credit2.id },
    });
    check("J1. Төлбөргүй өглөг хаагдав", closed.status === "CANCELLED", closed.status);
    check("J2. Цуцлалт мөнгө буцаагаагүй (зээл тул)",
      (await prisma.moneyTransaction.count({ where: { referenceId: credit2.id } })) === 0);
    check("J3. Хаагдсан өглөг нэгтгэлд орохгүй",
      (await getSupplierPayableSummary(supplier.id)).payables.every(
        (row) => row.purchaseId !== credit2.id,
      ));
    check("J4. Хаагдсан өглөгт төлбөр хийхгүй",
      (await expectThrow(() =>
        recordSupplierPayment({
          payableId: closed.id, amount: 100, account: "CASH", paidAt: new Date(), userId: owner.id,
        }),
      )) !== null);

    // ---- L. Худалдан авалтын давхар илгээлт --------------------------------
    const pkey = `__paytest-purchase-${STAMP}`;
    const d1 = await postPurchase({
      date: new Date(), paymentMethod: "CREDIT", supplierId: supplier.id, userId: owner.id,
      idempotencyKey: pkey,
      items: [{ rawMaterialId: material.id, quantity: 3, unit: "KG", unitPrice: 2000 }],
    });
    const d2 = await postPurchase({
      date: new Date(), paymentMethod: "CREDIT", supplierId: supplier.id, userId: owner.id,
      idempotencyKey: pkey,
      items: [{ rawMaterialId: material.id, quantity: 3, unit: "KG", unitPrice: 2000 }],
    });
    purchaseIds.push(d1.id);
    check("L1. Давхар илгээлт нэг л баримт үүсгэв", d1.id === d2.id && d2.created === false);
    check("L2. Давхар илгээлт нэг л өглөг үүсгэв",
      (await prisma.supplierPayable.count({ where: { purchaseId: d1.id } })) === 1);
    check("L3. Нөөцийн хөдөлгөөн нэг удаа",
      (await prisma.inventoryMovement.count({ where: { referenceId: d1.id } })) === 1);

    // ---- N. Нийлүүлэгчийн нэгтгэл ------------------------------------------
    const summary = await getSupplierPayableSummary(supplier.id);
    check("N1. Нийлүүлэгчийн нийт өглөг 6,000", summary.totals.totalOutstanding.equals(6_000),
      summary.totals.totalOutstanding.toString());
    check("N2. Нээлттэй өглөг 1", summary.totals.openCount === 1, String(summary.totals.openCount));

    // ---- O. Мөнгө хуудасны нэгтгэл ------------------------------------------
    const totals = await getPayableTotals();
    const balances = await getAccountBalances(prisma);
    check("O1. Нийт өглөг нь нийлүүлэгчийн өглөгийг агуулна",
      totals.totalOutstanding.greaterThanOrEqualTo(6_000), totals.totalOutstanding.toString());
    // Нэгтгэлийг ХАМААРАЛГҮЙ замаар — өглөг мөр бүрээр — дахин тооцож тулгана.
    const independent = (await listPayables()).reduce(
      (acc, row) => acc.plus(row.outstanding),
      new D(0),
    );
    check("O2. Нийт өглөг нь мөр бүрийн үлдэгдлийн нийлбэртэй тэнцэв",
      totals.totalOutstanding.equals(independent),
      `${totals.totalOutstanding} vs ${independent}`);
    const netLiquidity = balances.cash.plus(balances.bank).minus(totals.totalOutstanding);
    check("O2b. Өглөг хассан мөнгөн байр суурь = касс + банк − өглөг",
      netLiquidity.equals(balances.cash.plus(balances.bank).minus(independent)),
      netLiquidity.toString());
    check("O3. Хугацаа хэтэрсэн ≤ нийт",
      totals.overdueOutstanding.lessThanOrEqualTo(totals.totalOutstanding));

    // ---- P. Төлбөр нь ЗАРДАЛ ч ББӨ ч БИШ ------------------------------------
    check("P1. Зардлын бичлэг нэмэгдээгүй",
      (await prisma.expense.count()) === before.expenses);
    check("P2. Борлуулалт (ББӨ) нэмэгдээгүй", (await prisma.saleBatch.count()) === before.sales);
    check("P4. Төлбөр нөөцийн хөдөлгөөн үүсгээгүй",
      (await prisma.inventoryMovement.count({ where: { referenceId: { in: paymentIds } } })) === 0);
    check("P5. Төлбөрийн мөнгөн гүйлгээ ЗӨВХӨН нийлүүлэгчийн төрөлтэй",
      (await prisma.moneyTransaction.findMany({ where: { referenceId: { in: paymentIds } } })).every(
        (t) => t.type === "SUPPLIER_PAYMENT_OUT" || t.type === "SUPPLIER_PAYMENT_REVERSAL_IN",
      ));

    // ---- Тогтвортой байдлын шалгалт ------------------------------------------
    const finalPayable = await getPayableForPurchase(credit.id);
    check("Q1. Анхны дүн = төлсөн + үлдэгдэл",
      finalPayable !== null &&
        finalPayable.paid.plus(finalPayable.outstanding).equals(finalPayable.originalAmount),
      finalPayable
        ? `${finalPayable.paid} + ${finalPayable.outstanding} vs ${finalPayable.originalAmount}`
        : "",
    );
    check("Q2. Үлдэгдэл сөрөг биш",
      finalPayable !== null && finalPayable.outstanding.greaterThanOrEqualTo(0));
    check("Q3. Өглөг үүсэх нь аудитад бүртгэгдэв",
      (await prisma.auditLog.count({
        where: { action: "SUPPLIER_PAYABLE_CREATED", entityId: payableId },
      })) === 1);
    // ---- R. Эрхийн хамгаалалт нь СЕРВЕР талд ---------------------------
    const actionSource = await readFile("src/app/(app)/purchases/payable-actions.ts", "utf8");
    const reverseBody = actionSource.slice(
      actionSource.indexOf("export async function reverseSupplierPaymentAction("),
    );
    check("R1. Буцаалтын action requireOwner()-ээр хамгаалагдсан",
      reverseBody.includes("await requireOwner()") && !reverseBody.includes("await requireOperator()"));
    const payBody = actionSource.slice(
      actionSource.indexOf("export async function recordSupplierPaymentAction("),
      actionSource.indexOf("export async function reverseSupplierPaymentAction("),
    );
    check("R2. Төлбөрийн action requireOperator()-ээр хамгаалагдсан (менежер ч төлнө)",
      payBody.includes("await requireOperator()"));
    const moneySource = await readFile("src/app/(app)/money/page.tsx", "utf8");
    check("R3. Өглөгийн нэгтгэл зөвхөн эзний харагдацад",
      moneySource.includes("payableParams") &&
        !(await readFile("src/app/(app)/money/ManagerMoneyView.tsx", "utf8")).includes(
          "PayablesSection",
        ));
  } finally {
    // Цэвэрлэгээ — үүсгэсэн бүхнээ буцаана.
    const payables = await prisma.supplierPayable.findMany({
      where: { purchaseId: { in: purchaseIds } },
      select: { id: true },
    });
    const payableIds = payables.map((row) => row.id);
    const payments = await prisma.supplierPayment.findMany({
      where: { payableId: { in: payableIds } },
      select: { id: true },
    });
    const allPaymentIds = payments.map((row) => row.id);

    await prisma.moneyTransaction.deleteMany({ where: { referenceId: { in: allPaymentIds } } });
    await prisma.supplierPayment.deleteMany({ where: { payableId: { in: payableIds } } });
    await prisma.supplierPayable.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
    for (const id of purchaseIds) {
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: id } });
      await prisma.moneyTransaction.deleteMany({ where: { referenceId: id } });
      await prisma.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await prisma.purchase.delete({ where: { id } }).catch(() => {});
    }
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...purchaseIds, ...payableIds, ...allPaymentIds] } },
    });
    await prisma.supplierItem.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } }).catch(() => {});
    await prisma.rawMaterial.delete({ where: { id: material.id } }).catch(() => {});
  }

  const after = {
    money: await prisma.moneyTransaction.count(),
    balances: await getAccountBalances(prisma),
    payables: await prisma.supplierPayable.count(),
  };
  check("Цэвэрлэгээ: мөнгөн гүйлгээний тоо сэргэв", after.money === before.money,
    `${after.money} vs ${before.money}`);
  check("Цэвэрлэгээ: кассын үлдэгдэл сэргэв", after.balances.cash.equals(before.balances.cash),
    `${after.balances.cash} vs ${before.balances.cash}`);
  check("Цэвэрлэгээ: банкны үлдэгдэл сэргэв", after.balances.bank.equals(before.balances.bank),
    `${after.balances.bank} vs ${before.balances.bank}`);

  console.log(fails === 0 ? "\nБүх шалгалт амжилттай." : `\n${fails} шалгалт унасан.`);
  if (fails > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
