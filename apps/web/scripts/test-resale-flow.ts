/**
 * RESALE бүтээгдэхүүний бүтэн урсгалын шалгалт: худалдан авалт → нөөц →
 * жигнэсэн дундаж өртөг → борлуулалт → ББӨ → цуцлалт.
 *
 * Тест нь өөрийн үүсгэсэн бүх бичлэгээ эцэст нь устгаж, өмнөх төлөвт
 * буцаана — түүхэн өгөгдөлд ХҮРЭХГҮЙ.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { postPurchase, cancelPurchase } from "../src/server/services/purchases";
import { postSalesBatch, cancelSaleBatch } from "../src/server/services/sales";

const prisma = new PrismaClient();
const D = Prisma.Decimal;
let fails = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails += 1;
}

async function main() {
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });
  const tag = `__ТЕСТ-RESALE-${Date.now()}`;

  const product = await prisma.product.create({
    data: {
      sku: `__T${Date.now()}`,
      name: tag,
      productType: "RESALE",
      unit: "PCS",
      sellingPrice: 5000,
      isActive: true,
    },
  });

  const createdPurchases: string[] = [];
  const createdSales: string[] = [];

  try {
    // 1. Хоёр удаагийн худалдан авалт → жигнэсэн дундаж
    //    (10 × 3000 + 20 × 3600) / 30 = 3400
    const p1 = await postPurchase({
      date: new Date(), paymentMethod: "BANK", userId: owner.id,
      items: [{ productId: product.id, quantity: 10, unit: "PCS", unitPrice: 3000 }],
    });
    createdPurchases.push(p1.id);
    const p2 = await postPurchase({
      date: new Date(), paymentMethod: "BANK", userId: owner.id,
      items: [{ productId: product.id, quantity: 20, unit: "PCS", unitPrice: 3600 }],
    });
    createdPurchases.push(p2.id);

    let after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    check("Худалдан авалтаар нөөц нэмэгдэв", new D(after.quantity).equals(30), `${after.quantity}`);
    check(
      "Жигнэсэн дундаж өртөг (10×3000 + 20×3600)/30 = 3400",
      new D(after.averageCost).equals(3400),
      `${after.averageCost}`,
    );
    check("Сүүлийн авалтын үнэ хадгалагдав", new D(after.lastPurchasePrice ?? 0).equals(3600));

    // 2. Дэвтэр нь бүтээгдэхүүнд холбогдсон, түүхий эдэд биш
    const moves = await prisma.inventoryMovement.findMany({ where: { productId: product.id } });
    check("Хөдөлгөөн бүтээгдэхүүнд бүртгэгдэв", moves.length === 2);
    check("Хөдөлгөөнд rawMaterialId хоосон", moves.every((m) => m.rawMaterialId === null));

    // 3. Борлуулалт → ББӨ нь дундаж өртгөөр
    const sale = await postSalesBatch({
      date: new Date(), userId: owner.id,
      items: [{ productId: product.id, quantity: 5, unitPrice: 5000 }],
      payments: { cash: 25000, card: 0, qr: 0, bankTransfer: 0, other: 0 },
    });
    createdSales.push(sale.id);

    after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    check("Борлуулалтаар нөөц хасагдав", new D(after.quantity).equals(25), `${after.quantity}`);
    check("Дундаж өртөг борлуулалтаар өөрчлөгдөөгүй", new D(after.averageCost).equals(3400));

    const batch = await prisma.saleBatch.findUniqueOrThrow({ where: { id: sale.id } });
    check("ББӨ = 5 × 3400 = 17000", new D(batch.totalCogs).equals(17000), `${batch.totalCogs}`);
    check("Нийт ашиг = 25000 - 17000 = 8000", new D(batch.grossProfit).equals(8000));

    // 4. Нөөц хүрэлцэхгүй бол борлуулалт зогсоно
    let blocked = false;
    try {
      const s = await postSalesBatch({
        date: new Date(), userId: owner.id,
        items: [{ productId: product.id, quantity: 9999, unitPrice: 5000 }],
        payments: { cash: 9999 * 5000, card: 0, qr: 0, bankTransfer: 0, other: 0 },
      });
      createdSales.push(s.id);
    } catch { blocked = true; }
    check("Нөөц хүрэлцэхгүй борлуулалт зогссон", blocked);

    // 5. Борлуулалт цуцлах → нөөц буцаж орно
    await cancelSaleBatch({ saleBatchId: sale.id, userId: owner.id, note: "тест" });
    after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    check("Борлуулалт цуцлахад нөөц буцав", new D(after.quantity).equals(30), `${after.quantity}`);

    // 6. Худалдан авалт цуцлах → нөөц хасагдаж, дундаж ухарна
    await cancelPurchase({ purchaseId: p2.id, userId: owner.id, note: "тест" });
    after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    check("Худалдан авалт цуцлахад нөөц хасагдав", new D(after.quantity).equals(10), `${after.quantity}`);
    check("Дундаж өртөг 3000 руу ухарлаа", new D(after.averageCost).equals(3000), `${after.averageCost}`);

    // 7. Дэвтрийн нийлбэр = хадгалсан үлдэгдэл
    const sum = await prisma.inventoryMovement.aggregate({
      where: { productId: product.id }, _sum: { quantity: true },
    });
    check(
      "Дэвтрийн нийлбэр хадгалсан үлдэгдэлтэй тохирч байна",
      new D(sum._sum.quantity ?? 0).equals(new D(after.quantity)),
      `${sum._sum.quantity} vs ${after.quantity}`,
    );

    // 8. MANUFACTURED бүтээгдэхүүнийг худалдан авалтад бүртгэхийг хориглоно
    const manufactured = await prisma.product.findFirst({ where: { productType: "MANUFACTURED" } });
    if (manufactured) {
      let rejected = false;
      let msg = "";
      try {
        const p = await postPurchase({
          date: new Date(), paymentMethod: "BANK", userId: owner.id,
          items: [{ productId: manufactured.id, quantity: 1, unit: "PCS", unitPrice: 100 }],
        });
        createdPurchases.push(p.id);
      } catch (e) { rejected = true; msg = (e as Error).message; }
      check("Үйлдвэрлэдэг бүтээгдэхүүнийг худалдан авалтад бүртгэхийг хориглов", rejected, msg);
    }
  } finally {
    // Тестийн бүх бичлэгийг цэвэрлэнэ — түүхэн өгөгдөлд хүрэхгүй.
    for (const id of createdSales) {
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: id } });
      await prisma.moneyTransaction.deleteMany({ where: { referenceId: id } });
      await prisma.saleItem.deleteMany({ where: { saleBatchId: id } });
      await prisma.saleBatch.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdPurchases) {
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: id } });
      await prisma.moneyTransaction.deleteMany({ where: { referenceId: id } });
      await prisma.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await prisma.purchase.delete({ where: { id } }).catch(() => {});
    }
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...createdSales, ...createdPurchases, product.id] } },
    });
    await prisma.inventoryMovement.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } }).catch(() => {});
  }

  console.log(fails === 0 ? "\nБүх шалгалт амжилттай." : `\n${fails} шалгалт унасан.`);
  if (fails > 0) process.exitCode = 1;
}
main().finally(() => prisma.$disconnect());
