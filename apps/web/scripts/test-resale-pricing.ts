/**
 * Бэлэн бүтээгдэхүүний үнэ, ашгийн харагдац ба сүүлийн авсан үнийн шалгалт.
 *
 * Тест нь өөрийн үүсгэсэн бүх бичлэгээ эцэст нь устгаж, түүхэн өгөгдөлд
 * ХҮРЭХГҮЙ.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { PRODUCT_TYPE_LABEL, productFinancials, profitTone } from "../src/lib/products";
import { getLastPurchase } from "../src/server/services/supplier-history";
import { postPurchase, cancelPurchase } from "../src/server/services/purchases";
import { postSalesBatch } from "../src/server/services/sales";
import { calculateRecipeCost } from "../src/server/services/recipes";

const prisma = new PrismaClient();
const D = Prisma.Decimal;
let fails = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails += 1;
}

async function main() {
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });
  const purchaseIds: string[] = [];
  const saleIds: string[] = [];

  // ---- 1-4. Шошго ба технikийн нэр төрөл гадагш гарахгүй байх --------------
  check("1. Үйлдвэрлэдэг бүтээгдэхүүний шошго",
    PRODUCT_TYPE_LABEL.MANUFACTURED === "Үйлдвэрлэдэг", PRODUCT_TYPE_LABEL.MANUFACTURED);
  check("2. Бэлэн бүтээгдэхүүний шошго",
    PRODUCT_TYPE_LABEL.RESALE === "Бэлэн бүтээгдэхүүн", PRODUCT_TYPE_LABEL.RESALE);

  // Хэрэглэгчид харагдах мөрүүдээс хуучин нэр томьёо арилсан эсэх.
  const uiFiles = (await import("node:child_process")).execSync(
    "grep -rl \"\" src/app src/components src/lib --include=*.tsx --include=*.ts",
  ).toString().trim().split("\n");
  let oldLabel = 0;
  let enumLeak = 0;
  for (const f of uiFiles) {
    const text = await readFile(f, "utf8");
    if (text.includes("Худалдан авч борлуулдаг")) oldLabel += 1;
    // Хэрэглэгчид харагдах мөр дотор "RESALE" гарч байна уу
    // (кодын таних тэмдэг, тайлбар биш).
    for (const m of text.matchAll(/"[^"\n]*RESALE[^"\n]*"/g)) {
      const lit = m[0];
      // productType === "RESALE" гэх мэт харьцуулалт зөвшөөрөгдөнө.
      if (lit === '"RESALE"') continue;
      enumLeak += 1;
    }
  }
  check("3. Хэрэглэгчид харагдах 'Худалдан авч борлуулдаг' үлдээгүй", oldLabel === 0, `${oldLabel} файл`);
  check("4. Хэрэглэгчид харагдах 'RESALE' мөр үлдээгүй", enumLeak === 0, `${enumLeak} мөр`);

  // ---- Тестийн бүтээгдэхүүн ------------------------------------------------
  const product = await prisma.product.create({
    data: {
      sku: `__TP${Date.now()}`,
      name: `__ТЕСТ кола ${Date.now()}`,
      productType: "RESALE",
      unit: "PCS",
      sellingPrice: 3500,
      isActive: true,
    },
  });

  try {
    // ---- 5. Түүхгүй бол сүүлийн үнэ байхгүй -------------------------------
    check("5. Түүхгүй бэлэн бүтээгдэхүүнд сүүлийн авсан үнэ алга",
      (await getLastPurchase({ productId: product.id })) === null);

    // ---- 6. Батлагдсан худалдан авалтын дараа -----------------------------
    const p1 = await postPurchase({
      date: new Date("2026-08-01"), paymentMethod: "BANK", userId: owner.id,
      items: [{ productId: product.id, quantity: 10, unit: "PCS", unitPrice: 2000 }],
    });
    purchaseIds.push(p1.id);
    const p2 = await postPurchase({
      date: new Date("2026-08-15"), paymentMethod: "BANK", userId: owner.id,
      items: [{ productId: product.id, quantity: 10, unit: "PCS", unitPrice: 2100 }],
    });
    purchaseIds.push(p2.id);

    let last = await getLastPurchase({ productId: product.id });
    check("6. Сүүлийн авсан үнэ хамгийн сүүлийн батлагдсан баримтынх",
      last !== null && new D(last.baseUnitCost).equals(2100), last?.baseUnitCost);
    check("6b. Сүүлийн авалтын огноо зөв",
      last?.date.toISOString().startsWith("2026-08-15") === true, last?.date.toISOString());

    // ---- 7. Цуцлагдсан баримт сүүлийн үнэ болохгүй -------------------------
    // 2026-08-20-нд илүү өндөр үнээр авч, дараа нь цуцална.
    const p3 = await postPurchase({
      date: new Date("2026-08-20"), paymentMethod: "BANK", userId: owner.id,
      items: [{ productId: product.id, quantity: 5, unit: "PCS", unitPrice: 9999 }],
    });
    purchaseIds.push(p3.id);
    check("7a. Цуцлахын өмнө шинэ үнэ харагдана",
      new D((await getLastPurchase({ productId: product.id }))!.baseUnitCost).equals(9999));

    await cancelPurchase({ purchaseId: p3.id, userId: owner.id, note: "тест" });
    last = await getLastPurchase({ productId: product.id });
    check("7b. Цуцлагдсан баримт сүүлийн үнэ болохгүй",
      last !== null && new D(last.baseUnitCost).equals(2100), last?.baseUnitCost);

    // Product.lastPurchasePrice нь цуцлалтад ухардаггүй — түүхээс гаргаснаар
    // энэ алдаанаас зайлсхийсэн эсэхийг батлана.
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    check("7c. Хадгалсан талбар хуучирсан ч харагдац зөв хэвээр",
      new D(stored.lastPurchasePrice ?? 0).equals(9999) && new D(last!.baseUnitCost).equals(2100),
      `хадгалсан ${stored.lastPurchasePrice} vs түүхээс ${last!.baseUnitCost}`);

    // ---- 8. DRAFT баримт сүүлийн үнэ болохгүй ------------------------------
    const draft = await prisma.purchase.create({
      data: {
        purchaseNo: `__DRAFT-${Date.now()}`,
        date: new Date("2026-08-25"),
        paymentMethod: "BANK",
        totalAmount: 8888,
        status: "DRAFT",
        createdById: owner.id,
        items: {
          create: [{
            productId: product.id, quantity: 1, unit: "PCS",
            unitPrice: 8888, subtotal: 8888, baseQuantity: 1, baseUnitCost: 8888,
          }],
        },
      },
    });
    purchaseIds.push(draft.id);
    last = await getLastPurchase({ productId: product.id });
    check("8. DRAFT баримт сүүлийн үнэ болохгүй",
      last !== null && new D(last.baseUnitCost).equals(2100), last?.baseUnitCost);

    // ---- 9. Дундаж өртөг нь нөөцийн системийнхтэй тохирно -----------------
    const fresh = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    const fin = productFinancials({
      productType: fresh.productType,
      sellingPrice: fresh.sellingPrice,
      averageCost: fresh.averageCost,
    });
    // (10×2000 + 10×2100)/20 = 2050
    check("9. Дундаж өртөг нөөцийн өгөгдөлтэй тохирч байна",
      fin.unitCost !== null && fin.unitCost.equals(new D(fresh.averageCost)) && fin.unitCost.equals(2050),
      `${fin.unitCost?.toString()}`);

    // ---- 10-12. Зарах үнэ, ашиг, ашгийн хувь ------------------------------
    check("10. Зарах үнэ бүтээгдэхүүний мастертайгаа тохирч байна",
      fin.sellingPrice.equals(new D(fresh.sellingPrice)) && fin.sellingPrice.equals(3500));
    check("11. Нэгж ашиг = 3500 - 2050 = 1450",
      fin.unitProfit !== null && fin.unitProfit.equals(1450), fin.unitProfit?.toString());
    check("12. Ашгийн хувь = 1450/3500 = 41.4%",
      fin.marginPercent !== null && fin.marginPercent.equals(new D("41.4")), fin.marginPercent?.toString());

    // ---- 12b. Худалдан авч байгаагүй бол өртөг мэдэгдэхгүй ----------------
    const neverBought = productFinancials({
      productType: "RESALE", sellingPrice: 3500, averageCost: 0,
    });
    check("12b. Авалтгүй бэлэн бүтээгдэхүүний өртөг мэдэгдэхгүй", neverBought.unitCost === null);
    check("12c. Тиймээс ашиг ба ашгийн хувь ч мэдэгдэхгүй (100% төөрөгдөл гарахгүй)",
      neverBought.unitProfit === null && neverBought.marginPercent === null);

    // ---- 13. Тэг зарах үнэ дээр тэгд хуваахгүй -----------------------------
    const zero = productFinancials({ productType: "RESALE", sellingPrice: 0, averageCost: 2050 });
    check("13a. Тэг зарах үнэ дээр ашгийн хувь алга", zero.marginPercent === null);
    const negative = productFinancials({ productType: "RESALE", sellingPrice: -5, averageCost: 10 });
    check("13b. Сөрөг зарах үнэ дээр ч ашгийн хувь алга", negative.marginPercent === null);

    // ---- 14. Үйлдвэрлэдэг бүтээгдэхүүний жорын өртөг өөрчлөгдөөгүй --------
    const mfg = await prisma.product.findFirstOrThrow({
      where: { productType: "MANUFACTURED", recipeItems: { some: {} } },
    });
    const recipe = await calculateRecipeCost(mfg.id);
    const mfgFin = productFinancials({
      productType: "MANUFACTURED",
      sellingPrice: mfg.sellingPrice,
      averageCost: mfg.averageCost,
      recipeCost: recipe.recipeCost,
    });
    check("14a. Үйлдвэрлэдэг бүтээгдэхүүний өртөг нь жорынх",
      mfgFin.unitCost !== null && mfgFin.unitCost.equals(recipe.recipeCost),
      `${mfgFin.unitCost?.toString()} vs ${recipe.recipeCost.toString()}`);
    check("14b. Үйлдвэрлэдэг бүтээгдэхүүнд авалтын дундаж ашиглагдаагүй",
      new D(mfg.averageCost).equals(0) && !mfgFin.unitCost!.equals(new D(mfg.averageCost)));
    check("14c. Жоргүй үйлдвэрлэдэг бүтээгдэхүүний өртөг тодорхойгүй",
      productFinancials({ productType: "MANUFACTURED", sellingPrice: 100, averageCost: 0, recipeCost: null })
        .unitCost === null);

    // ---- 15. Бэлэн бүтээгдэхүүний борлуулалтын ББӨ хэвээр -----------------
    const qtyBefore = new D(fresh.quantity);
    const sale = await postSalesBatch({
      date: new Date(), userId: owner.id,
      items: [{ productId: product.id, quantity: 3, unitPrice: 3500 }],
      payments: { cash: 10500, card: 0, qr: 0, bankTransfer: 0, other: 0 },
    });
    saleIds.push(sale.id);
    const batch = await prisma.saleBatch.findUniqueOrThrow({ where: { id: sale.id } });
    check("15a. ББӨ = 3 × 2050 = 6150 (дундаж өртгөөр царцсан)",
      new D(batch.totalCogs).equals(6150), batch.totalCogs.toString());
    const afterSale = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    check("15b. Борлуулалтаар нөөц 3-аар хасагдав",
      new D(afterSale.quantity).equals(qtyBefore.minus(3)), afterSale.quantity.toString());
    check("15c. Борлуулалт дундаж өртгийг өөрчлөөгүй",
      new D(afterSale.averageCost).equals(2050), afterSale.averageCost.toString());
    check("15d. Борлуулалт сүүлийн авсан үнийг өөрчлөөгүй",
      new D((await getLastPurchase({ productId: product.id }))!.baseUnitCost).equals(2100));

    // ---- Ашгийн өнгө --------------------------------------------------------
    check("Ашгийн өнгө: эерэг ногоон", profitTone(new D(100)) === "positive");
    check("Ашгийн өнгө: сөрөг улаан", profitTone(new D(-1)) === "negative");
    check("Ашгийн өнгө: тэг саармаг", profitTone(new D(0)) === "default");
    check("Ашгийн өнгө: мэдэгдэхгүй бол саармаг", profitTone(null) === "default");
  } finally {
    for (const id of saleIds) {
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: id } });
      await prisma.moneyTransaction.deleteMany({ where: { referenceId: id } });
      await prisma.saleItem.deleteMany({ where: { saleBatchId: id } });
      await prisma.saleBatch.delete({ where: { id } }).catch(() => {});
    }
    for (const id of purchaseIds) {
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: id } });
      await prisma.moneyTransaction.deleteMany({ where: { referenceId: id } });
      await prisma.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await prisma.purchase.delete({ where: { id } }).catch(() => {});
    }
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...saleIds, ...purchaseIds, product.id] } },
    });
    await prisma.inventoryMovement.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } }).catch(() => {});
  }

  console.log(fails === 0 ? "\nБүх шалгалт амжилттай." : `\n${fails} шалгалт унасан.`);
  if (fails > 0) process.exitCode = 1;
}
main().finally(() => prisma.$disconnect());
