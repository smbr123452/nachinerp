/**
 * Өгөгдлийн бүрэн бүтэн байдлын шалгалт: `npm run verify`.
 *
 * Системийн үндсэн дүрмүүд үнэн эсэхийг дэвтрүүдээс дахин тооцож шалгана.
 * Бодит дата дээр ч ажиллана — зөвхөн уншина, юу ч өөрчлөхгүй.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const D = Prisma.Decimal;
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  // 1. Дэвтэр ↔ үлдэгдэл нийцэл (түүхий эд)
  const materials = await prisma.rawMaterial.findMany();
  const grouped = await prisma.inventoryMovement.groupBy({
    by: ["rawMaterialId"],
    _sum: { quantity: true },
  });
  const sums = new Map(
    grouped.filter((g) => g.rawMaterialId).map((g) => [g.rawMaterialId!, new D(g._sum.quantity ?? 0)]),
  );
  const mismatched = materials.filter(
    (m) => !new D(m.quantity).equals(sums.get(m.id) ?? new D(0)),
  );
  check("Нөөцийн дэвтэр ба үлдэгдэл тохирч байна", mismatched.length === 0,
    mismatched.map((m) => `${m.name}: ${m.quantity} vs ${sums.get(m.id)}`).join(", "));

  // 1b. Дэвтэр ↔ үлдэгдэл нийцэл (RESALE бүтээгдэхүүн)
  //     MANUFACTURED бүтээгдэхүүн өөрийн нөөцгүй тул дэвтэрт орохгүй.
  const resaleProducts = await prisma.product.findMany({ where: { productType: "RESALE" } });
  const productGrouped = await prisma.inventoryMovement.groupBy({
    by: ["productId"],
    _sum: { quantity: true },
  });
  const productSums = new Map(
    productGrouped.filter((g) => g.productId).map((g) => [g.productId!, new D(g._sum.quantity ?? 0)]),
  );
  const productMismatched = resaleProducts.filter(
    (p) => !new D(p.quantity).equals(productSums.get(p.id) ?? new D(0)),
  );
  check(
    "Дамжуулан борлуулах бүтээгдэхүүний дэвтэр ба үлдэгдэл тохирч байна",
    productMismatched.length === 0,
    `${resaleProducts.length} бүтээгдэхүүн шалгав` +
      (productMismatched.length
        ? "; " + productMismatched.map((p) => `${p.name}: ${p.quantity}`).join(", ")
        : ""),
  );

  // 1c. Үйлдвэрлэдэг бүтээгдэхүүн дэвтэрт орсон эсэх (орох ёсгүй)
  const manufacturedInLedger = await prisma.inventoryMovement.count({
    where: { product: { productType: "MANUFACTURED" } },
  });
  check(
    "Үйлдвэрлэдэг бүтээгдэхүүн нөөцийн дэвтэрт ороогүй",
    manufacturedInLedger === 0,
    `${manufacturedInLedger} мөр`,
  );

  // 1d. Дэвтрийн мөр бүр яг нэг субьекттэй (DB CHECK-ийн давхар баталгаа)
  const orphanMovements = await prisma.inventoryMovement.count({
    where: { rawMaterialId: null, productId: null },
  });
  const doubleMovements = await prisma.inventoryMovement.count({
    where: { NOT: { rawMaterialId: null }, productId: { not: null } },
  });
  check(
    "Дэвтрийн мөр бүр яг нэг субьекттэй",
    orphanMovements === 0 && doubleMovements === 0,
    `хоосон ${orphanMovements}, давхар ${doubleMovements}`,
  );

  // 2. Сөрөг үлдэгдэлгүй
  const negative = materials.filter((m) => new D(m.quantity).lessThan(0));
  check("Сөрөг үлдэгдэл байхгүй", negative.length === 0, negative.map((m) => m.name).join(", "));

  // 3. Жигнэсэн дундаж өртөг — гурил
  const flour = materials.find((m) => m.sku === "RM-001")!;
  const flourMoves = await prisma.inventoryMovement.findMany({
    where: { rawMaterialId: flour.id },
    orderBy: { createdAt: "asc" },
  });
  let qty = new D(0);
  let avg = new D(0);
  for (const m of flourMoves) {
    const q = new D(m.quantity);
    if (q.greaterThan(0) && ["PURCHASE_IN", "CORRECTION_IN", "RETURN_IN"].includes(m.movementType)) {
      const total = qty.times(avg).plus(q.times(new D(m.unitCost)));
      qty = qty.plus(q);
      avg = qty.greaterThan(0) ? total.dividedBy(qty) : avg;
    } else {
      qty = qty.plus(q);
    }
  }
  check(
    "Гурилын жигнэсэн дундаж өртөг дэвтрээс дахин тооцоход тохирч байна",
    avg.toDecimalPlaces(2).equals(new D(flour.averageCost).toDecimalPlaces(2)),
    `тооцоолсон ${avg.toFixed(4)} vs хадгалсан ${flour.averageCost}`,
  );

  // 4. Хоёр дахь худалдан авалтын дараах дундаж 3200 байх ёстой
  const secondPurchase = flourMoves[1]!;
  const afterSecond = new D(50 * 3000 + 100 * 3300).dividedBy(150);
  check(
    "Жишээ: (50×3000 + 100×3300) / 150 = 3200",
    afterSecond.equals(3200) && new D(secondPurchase.unitCost).equals(3300),
  );

  // 5. Борлуулалтын ББӨ ба хэрэглээний өртөг тохирч байна
  const batches = await prisma.saleBatch.findMany({ where: { status: "POSTED" } });
  let cogsOk = true;
  const details: string[] = [];
  for (const batch of batches) {
    const moves = await prisma.inventoryMovement.findMany({
      where: { referenceType: "SALE", referenceId: batch.id },
    });
    const moveCost = moves.reduce((acc, m) => acc.plus(new D(m.totalCost).abs()), new D(0));
    const diff = moveCost.minus(new D(batch.totalCogs)).abs();
    if (diff.greaterThan(1)) {
      cogsOk = false;
      details.push(`${batch.batchNo}: ${batch.totalCogs} vs ${moveCost.toFixed(2)}`);
    }
  }
  check("Борлуулалтын ББӨ нь хэрэглээний өртөгтэй тэнцэж байна", cogsOk, details.join(", "));

  // 6. Мөнгөний үлдэгдэл дэвтрээс
  const txns = await prisma.moneyTransaction.findMany();
  const balance = { CASH: new D(0), BANK: new D(0) };
  for (const t of txns) {
    if (t.destinationAccount) balance[t.destinationAccount] = balance[t.destinationAccount].plus(new D(t.amount));
    if (t.sourceAccount) balance[t.sourceAccount] = balance[t.sourceAccount].minus(new D(t.amount));
  }
  check("Кассын үлдэгдэл сөрөг биш", balance.CASH.greaterThanOrEqualTo(0), balance.CASH.toFixed(2));
  console.log(`     Касс: ${balance.CASH.toFixed(0)}₮  Банк: ${balance.BANK.toFixed(0)}₮`);

  // 7. Борлуулалтын төлбөрийн хуваарилалт орлоготой тэнцэж байна
  const unbalanced = batches.filter((b) => {
    const pay = new D(b.cashAmount).plus(b.cardAmount).plus(b.qrAmount).plus(b.bankTransferAmount).plus(b.otherAmount);
    return !pay.equals(new D(b.totalRevenue));
  });
  check("Төлбөрийн хуваарилалт орлоготой тэнцэж байна", unbalanced.length === 0);

  // 8. Тооллогын зөрүү нь тохируулгын хөдөлгөөн үүсгэсэн эсэх
  const counts = await prisma.inventoryCount.findMany({
    where: { status: "POSTED" },
    include: { items: true },
  });
  let countOk = true;
  for (const count of counts) {
    const diffItems = count.items.filter((i) => !new D(i.differenceQuantity).isZero());
    const moves = await prisma.inventoryMovement.count({
      where: { referenceType: "INVENTORY_COUNT", referenceId: count.id },
    });
    if (moves !== diffItems.length) countOk = false;
  }
  check("Тооллогын зөрүү бүрд тохируулгын хөдөлгөөн үүссэн", countOk);

  // 9. Аудитын бичлэг
  const auditCount = await prisma.auditLog.count();
  const purchaseAudit = await prisma.auditLog.count({ where: { action: "PURCHASE_CREATED" } });
  const saleAudit = await prisma.auditLog.count({ where: { action: "SALE_FINALIZED" } });
  check("Аудитын бичлэг үүссэн", auditCount > 0, `нийт ${auditCount}, ХА ${purchaseAudit}, БО ${saleAudit}`);

  console.log(failures === 0 ? "\nБүх шалгалт амжилттай." : `\n${failures} шалгалт унасан.`);
  if (failures > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
