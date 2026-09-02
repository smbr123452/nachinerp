/**
 * Борлуулалт ↔ нөөцийн шалгалт (BUG 1 ба BUG 2).
 *
 * Тест нь өөрийн үүсгэсэн бүх бичлэгээ эцэст нь устгаж, түүхэн өгөгдөлд
 * ХҮРЭХГҮЙ. Шалгалтын мастер өгөгдөл "__SI-" угтвартай.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { postSalesBatch, planSaleConsumption, findShortages } from "../src/server/services/sales";
import { postPurchase } from "../src/server/services/purchases";
import { verifyLedgerConsistency } from "../src/server/services/inventory";
import { buildSaleRequirements, buildSalePreview, stockKey } from "../src/lib/sale-consumption";

const prisma = new PrismaClient();
const D = Prisma.Decimal;
let fails = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails += 1;
}
async function expectThrow(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null; } catch (e) { return (e as Error).message; }
}
const mQty = async (id: string) =>
  new D((await prisma.rawMaterial.findUniqueOrThrow({ where: { id } })).quantity);
const pQty = async (id: string) =>
  new D((await prisma.product.findUniqueOrThrow({ where: { id } })).quantity);
const wac = async (id: string) =>
  new D((await prisma.rawMaterial.findUniqueOrThrow({ where: { id } })).averageCost);

async function main() {
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });
  const manager = await prisma.user.findFirstOrThrow({ where: { role: "MANAGER" } });
  const stamp = Date.now();
  const batchIds: string[] = [];
  const purchaseIds: string[] = [];

  // --- Шалгалтын мастер өгөгдөл ------------------------------------------
  const flour = await prisma.rawMaterial.create({
    data: { sku: `__SI-M1-${stamp}`, name: `__ТЕСТ гурил ${stamp}`, unit: "KG" },
  });
  const milk = await prisma.rawMaterial.create({
    data: { sku: `__SI-M2-${stamp}`, name: `__ТЕСТ сүү ${stamp}`, unit: "LITER" },
  });
  // Хоёр жорд ХОЁУЛАНД нь орох материал — нэгтгэлийг шалгана.
  const shared = await prisma.rawMaterial.create({
    data: { sku: `__SI-M3-${stamp}`, name: `__ТЕСТ элсэн чихэр ${stamp}`, unit: "KG" },
  });
  const cake = await prisma.product.create({
    data: {
      sku: `__SI-P1-${stamp}`, name: `__ТЕСТ бялуу ${stamp}`,
      productType: "MANUFACTURED", unit: "PCS", sellingPrice: 10000,
      recipeItems: {
        create: [
          { rawMaterialId: flour.id, quantity: 0.5, unit: "KG" },
          { rawMaterialId: shared.id, quantity: 0.2, unit: "KG" },
        ],
      },
    },
  });
  const latte = await prisma.product.create({
    data: {
      sku: `__SI-P2-${stamp}`, name: `__ТЕСТ латте ${stamp}`,
      productType: "MANUFACTURED", unit: "PCS", sellingPrice: 5000,
      recipeItems: {
        create: [
          { rawMaterialId: milk.id, quantity: 200, unit: "ML" },
          { rawMaterialId: shared.id, quantity: 0.01, unit: "KG" },
        ],
      },
    },
  });
  const cola = await prisma.product.create({
    data: {
      sku: `__SI-P3-${stamp}`, name: `__ТЕСТ кола ${stamp}`,
      productType: "RESALE", unit: "PCS", sellingPrice: 3000,
    },
  });

  try {
    const seed = await postPurchase({
      date: new Date(), paymentMethod: "BANK", userId: owner.id,
      idempotencyKey: `__si-seed-${stamp}`,
      items: [
        { rawMaterialId: flour.id, quantity: 100, unit: "KG", unitPrice: 2000 },
        { rawMaterialId: milk.id, quantity: 50, unit: "LITER", unitPrice: 3000 },
        { rawMaterialId: shared.id, quantity: 10, unit: "KG", unitPrice: 4000 },
        { productId: cola.id, quantity: 30, unit: "PCS", unitPrice: 1500 },
      ],
    });
    purchaseIds.push(seed.id);

    // ---- 1-3. MANUFACTURED: зөвхөн жорын түүхий эд ----------------------
    const plan = await planSaleConsumption([{ productId: cake.id, quantity: 2, unitPrice: 10000 }]);
    const keys = plan.consumption.map((c) => c.key).sort();
    check("1. MANUFACTURED-ийн шаардлага зөвхөн жорын түүхий эд",
      keys.join(",") === [stockKey("rawMaterial", flour.id), stockKey("rawMaterial", shared.id)].sort().join(","),
      keys.join(","));
    check("2. MANUFACTURED бүтээгдэхүүн өөрөө шаардлага биш",
      !plan.consumption.some((c) => c.key === stockKey("product", cake.id)));
    check("2b. Нэргүй шаардлага байхгүй",
      plan.consumption.every((c) => c.materialName.trim().length > 0));

    // Клиент дүрэм ↔ сервер дүрэм ижил түлхүүр гаргана уу
    const clientProducts = new Map([
      [cake.id, { id: cake.id, name: cake.name, productType: "MANUFACTURED" as const,
        recipe: [{ rawMaterialId: flour.id, baseQuantity: 0.5 }, { rawMaterialId: shared.id, baseQuantity: 0.2 }] }],
    ]);
    const clientKeys = buildSaleRequirements([{ productId: cake.id, quantity: 2 }], clientProducts)
      .map((r) => r.key).sort();
    check("1b. Клиент ба серверийн дүрэм ижил түлхүүр гаргав",
      clientKeys.join(",") === keys.join(","), `${clientKeys.join(",")} vs ${keys.join(",")}`);

    const flourBefore = await mQty(flour.id);
    const sharedBefore = await mQty(shared.id);
    const cakeQtyBefore = await pQty(cake.id);
    const wacBefore = await wac(flour.id);

    const sale1 = await postSalesBatch({
      date: new Date(), userId: owner.id,
      items: [{ productId: cake.id, quantity: 2, unitPrice: 10000 }],
      payments: { cash: 20000, card: 0, qr: 0, bankTransfer: 0, other: 0 },
    });
    batchIds.push(sale1.id);
    check("3. MANUFACTURED-д бүтээгдэхүүний шууд хөдөлгөөн үүсээгүй",
      (await prisma.inventoryMovement.count({
        where: { referenceId: sale1.id, productId: cake.id },
      })) === 0);
    check("3b. Бүтээгдэхүүний үлдэгдэл хөндөгдөөгүй",
      (await pQty(cake.id)).equals(cakeQtyBefore));
    check("4. Жорын түүхий эд зөв хасагдав",
      (await mQty(flour.id)).equals(flourBefore.minus(1)), `гурил ${await mQty(flour.id)}`);
    check("18. Хасалт дундаж өртгийг өөрчлөөгүй", (await wac(flour.id)).equals(wacBefore));

    // ---- 5. Нэг материал хоёр жорд — нэгтгэл ----------------------------
    const sharedNow = await mQty(shared.id);
    const mixPlan = await planSaleConsumption([
      { productId: cake.id, quantity: 2, unitPrice: 10000 },
      { productId: latte.id, quantity: 3, unitPrice: 5000 },
    ]);
    const sharedReq = mixPlan.consumption.find((c) => c.key === stockKey("rawMaterial", shared.id));
    check("5. Хуваалцсан материал нэг мөрөнд нэгтгэгдэв",
      sharedReq !== undefined &&
      mixPlan.consumption.filter((c) => c.key === stockKey("rawMaterial", shared.id)).length === 1 &&
      new D(sharedReq!.baseQuantity).equals(new D("0.43")),
      `шаардлага ${sharedReq?.baseQuantity}`);

    // ---- 6-7. RESALE ба холимог ----------------------------------------
    const colaBefore = await pQty(cola.id);
    const sale2 = await postSalesBatch({
      date: new Date(), userId: owner.id,
      items: [
        { productId: cola.id, quantity: 4, unitPrice: 3000 },
        { productId: latte.id, quantity: 2, unitPrice: 5000 },
      ],
      payments: { cash: 22000, card: 0, qr: 0, bankTransfer: 0, other: 0 },
    });
    batchIds.push(sale2.id);
    check("6. RESALE өөрийн нөөцөөс хасагдав",
      (await pQty(cola.id)).equals(colaBefore.minus(4)));
    check("6b. RESALE-д бүтээгдэхүүний хөдөлгөөн үүссэн",
      (await prisma.inventoryMovement.count({
        where: { referenceId: sale2.id, productId: cola.id },
      })) === 1);
    check("7. Холимог борлуулалт хоёр төрлийг зөв хассан",
      (await prisma.inventoryMovement.count({ where: { referenceId: sale2.id } })) === 3);

    // ---- 8-9. Дутагдал MANAGER-ийг блоклоно -----------------------------
    const bigCake = await expectThrow(() =>
      postSalesBatch({
        date: new Date(), userId: manager.id,
        items: [{ productId: cake.id, quantity: 100000, unitPrice: 10000 }],
        payments: { cash: 1000000000, card: 0, qr: 0, bankTransfer: 0, other: 0 },
      }));
    check("8. MANUFACTURED-ийн жорын дутагдал менежерийг блоклов",
      bigCake !== null && bigCake.includes("Нөөц хүрэлцэхгүй"), bigCake ?? "алдаа гараагүй");
    const bigCola = await expectThrow(() =>
      postSalesBatch({
        date: new Date(), userId: manager.id,
        items: [{ productId: cola.id, quantity: 10000, unitPrice: 3000 }],
        payments: { cash: 30000000, card: 0, qr: 0, bankTransfer: 0, other: 0 },
      }));
    check("9. RESALE-ийн дутагдал менежерийг блоклов",
      bigCola !== null && bigCola.includes("Нөөц хүрэлцэхгүй"), bigCola ?? "алдаа гараагүй");

    // ---- 10. Эзэн ч анхдагчаар блоклогдоно ------------------------------
    const ownerDefault = await expectThrow(() =>
      postSalesBatch({
        date: new Date(), userId: owner.id, allowNegativeStock: false,
        items: [{ productId: cola.id, quantity: 10000, unitPrice: 3000 }],
        payments: { cash: 30000000, card: 0, qr: 0, bankTransfer: 0, other: 0 },
      }));
    check("10. Эзэн зөвшөөрөлгүй бол блоклогдов",
      ownerDefault !== null && ownerDefault.includes("Нөөц хүрэлцэхгүй"));

    // ---- 11. Эзний тодорхой зөвшөөрөл ажиллана --------------------------
    const colaNow = await pQty(cola.id);
    const need = colaNow.plus(3);
    const overrideSale = await postSalesBatch({
      date: new Date(), userId: owner.id, allowNegativeStock: true,
      items: [{ productId: cola.id, quantity: need.toNumber(), unitPrice: 3000 }],
      payments: { cash: need.times(3000).toNumber(), card: 0, qr: 0, bankTransfer: 0, other: 0 },
    });
    batchIds.push(overrideSale.id);
    check("11. Эзний зөвшөөрлөөр борлуулалт батлагдав", Boolean(overrideSale.id));
    check("11b. Үлдэгдэл сөрөг боллоо",
      (await pQty(cola.id)).equals(new D(-3)), (await pQty(cola.id)).toString());

    // ---- 12. Менежерийн хуурамч зөвшөөрөл сервер дээр татгалзана --------
    const actionSrc = await readFile("src/app/(app)/sales/actions.ts", "utf8");
    const guarded =
      actionSrc.includes('user.role === "OWNER"') &&
      /allowNegativeStock\s*&&\s*user\.role\s*!==\s*"OWNER"/.test(actionSrc);
    check("12. Server action нь эзний эрхийг шалгаж байна", guarded);
    // Домэйны түвшинд ч: менежерийн ID-тай зөвшөөрөл дамжуулах нь action-аар
    // зогсоогдоно (үйлчилгээ өөрөө дүр мэдэхгүй — энэ нь давхаргын хуваарилалт).
    check("12b. Үйлчилгээ дүрийн шийдвэрийг action-д үлдээсэн",
      !/(role|OWNER)/.test((await readFile("src/server/services/sales.ts", "utf8"))
        .split("export async function postSalesBatch")[1].slice(0, 1200)));

    // ---- 15. Зөвшөөрөл ТӨЛБӨРИЙН шалгалтыг давахгүй ---------------------
    const payErr = await expectThrow(() =>
      postSalesBatch({
        date: new Date(), userId: owner.id, allowNegativeStock: true,
        items: [{ productId: cola.id, quantity: 1, unitPrice: 3000 }],
        payments: { cash: 2999.6, card: 0, qr: 0, bankTransfer: 0, other: 0 },
      }));
    check("15. Зөвшөөрөл төлбөрийн зөрүүг давж гараагүй",
      payErr !== null && payErr.includes("тэнцэхгүй"), payErr ?? "алдаа гараагүй");
    check("15b. Алдаанд бодит зөрүү харагдана",
      payErr !== null && payErr.includes("Зөрүү"), payErr ?? "");

    // Зөвшөөрөл буруу тоог ч давахгүй
    const qtyErr = await expectThrow(() =>
      postSalesBatch({
        date: new Date(), userId: owner.id, allowNegativeStock: true,
        items: [{ productId: cola.id, quantity: 0, unitPrice: 3000 }],
        payments: { cash: 0, card: 0, qr: 0, bankTransfer: 0, other: 0 },
      }));
    check("15c. Зөвшөөрөл буруу тоо хэмжээг давж гараагүй",
      qtyErr !== null && qtyErr.includes("0-ээс их"), qtyErr ?? "алдаа гараагүй");

    // ---- 14. Тодорхойгүй мөр дутагдал гэж тооцогдохгүй -------------------
    const previewProducts = new Map([
      [cake.id, { id: cake.id, name: cake.name, productType: "MANUFACTURED" as const,
        recipe: [{ rawMaterialId: flour.id, baseQuantity: 0.5 }, { rawMaterialId: "missing-id", baseQuantity: 1 }] }],
    ]);
    const preview = buildSalePreview(
      [{ productId: cake.id, quantity: 1 }],
      previewProducts,
      new Map([[stockKey("rawMaterial", flour.id), {
        key: stockKey("rawMaterial", flour.id), name: "гурил", quantity: 100, unit: "кг",
      }]]),
    );
    const unresolvedRow = preview.find((r) => !r.resolved);
    check("14. Үлдэгдэл олдоогүй мөр тусад нь тэмдэглэгдэв", unresolvedRow !== undefined);
    check("14b. Тэр мөр ДУТАГДАЛ гэж тооцогдоогүй",
      unresolvedRow !== undefined && unresolvedRow.short === false);
    check("14c. Бүх шийдэгдсэн мөр нэртэй",
      preview.filter((r) => r.resolved).every((r) => r.name.length > 0));

    // ---- 16-17. Эцсийн үлдэгдэл ба хөдөлгөөн зөв ------------------------
    const drift = await verifyLedgerConsistency(prisma);
    check("16. Нөөц ↔ дэвтрийн инвариант хэвээр", drift.length === 0,
      drift.map((r) => `${r.name}: ${r.stored} vs ${r.ledger}`).join("; "));
    const allMoves = await prisma.inventoryMovement.findMany({
      where: { referenceId: { in: batchIds } },
    });
    check("17. Бүх хөдөлгөөн SALE_CONSUMPTION_OUT ба сөрөг тэмдэгтэй",
      allMoves.every((m) => m.movementType === "SALE_CONSUMPTION_OUT" && new D(m.quantity).lessThan(0)));
    check("17b. MANUFACTURED бүтээгдэхүүнд хөдөлгөөн үүсээгүй",
      allMoves.every((m) => m.productId !== cake.id && m.productId !== latte.id));

    // ---- 18. ББӨ шалгалт -------------------------------------------------
    const b1 = await prisma.saleBatch.findUniqueOrThrow({
      where: { id: sale1.id }, include: { items: true },
    });
    const expectedUnitCost = new D("0.5").times(2000).plus(new D("0.2").times(4000));
    check("18b. ББӨ жорын өртгөөс зөв бодогдов",
      new D(b1.items[0].unitCost).equals(expectedUnitCost),
      `${b1.items[0].unitCost} vs ${expectedUnitCost}`);
    check("18c. Багцын ББӨ мөрүүдийн нийлбэртэй тэнцэв",
      new D(b1.totalCogs).equals(
        b1.items.reduce((s, i) => s.plus(new D(i.totalCost)), new D(0)).toDecimalPlaces(2)));

    // ---- 19. Аудит --------------------------------------------------------
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: "SaleBatch", entityId: overrideSale.id, action: "SALE_FINALIZED" },
    });
    const av = audit.newValue as Record<string, unknown>;
    check("19. Аудитад зөвшөөрөл тэмдэглэгдэв", av.negativeStockOverride === true);
    const subjects = av.negativeStockSubjects as { name: string; beforeQuantity: string; requiredQuantity: string; afterQuantity: string }[] | undefined;
    check("19b. Аудитад нөлөөлсөн бараа бүртгэгдэв",
      Array.isArray(subjects) && subjects.length > 0 && subjects[0].name.includes("кола"),
      JSON.stringify(subjects));
    check("19c. Аудитад өмнөх / шаардлагатай / дараах тоо байна",
      Array.isArray(subjects) &&
      subjects.every((x) => x.beforeQuantity !== undefined && x.requiredQuantity !== undefined && x.afterQuantity !== undefined));
    const normalAudit = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: "SaleBatch", entityId: sale1.id, action: "SALE_FINALIZED" },
    });
    check("19d. Энгийн борлуулалтад зөвшөөрөл тэмдэглэгдээгүй",
      (normalAudit.newValue as Record<string, unknown>).negativeStockOverride === false);

    // ---- 20. Давхар илгээлт (борлуулалтад түлхүүр байхгүй — зан төлөв) ---
    const colaQtyBeforeDup = await pQty(cola.id);
    const dupA = await postSalesBatch({
      date: new Date(), userId: owner.id, allowNegativeStock: true,
      items: [{ productId: cola.id, quantity: 1, unitPrice: 3000 }],
      payments: { cash: 3000, card: 0, qr: 0, bankTransfer: 0, other: 0 },
    });
    batchIds.push(dupA.id);
    check("20. Борлуулалт бүр тусдаа баримт үүсгэнэ (idempotency түлхүүргүй)",
      (await pQty(cola.id)).equals(colaQtyBeforeDup.minus(1)));
    check("20b. Нэг баримтад нэг л хөдөлгөөн",
      (await prisma.inventoryMovement.count({ where: { referenceId: dupA.id } })) === 1);
    check("20c. Нэг баримтад нэг л мөнгөн гүйлгээ",
      (await prisma.moneyTransaction.count({ where: { referenceId: dupA.id } })) === 1);
  } finally {
    // ---- Цэвэрлэгээ -----------------------------------------------------
    await prisma.moneyTransaction.deleteMany({ where: { referenceId: { in: [...batchIds, ...purchaseIds] } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...batchIds, ...purchaseIds] } } });
    await prisma.saleItem.deleteMany({ where: { saleBatchId: { in: batchIds } } });
    await prisma.saleBatch.deleteMany({ where: { id: { in: batchIds } } });
    await prisma.inventoryMovement.deleteMany({
      where: {
        OR: [
          { rawMaterial: { sku: { startsWith: "__SI-" } } },
          { product: { sku: { startsWith: "__SI-" } } },
        ],
      },
    });
    await prisma.purchaseItem.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
    await prisma.purchase.deleteMany({ where: { id: { in: purchaseIds } } });
    await prisma.recipeItem.deleteMany({ where: { product: { sku: { startsWith: "__SI-" } } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "__SI-" } } });
    await prisma.rawMaterial.deleteMany({ where: { sku: { startsWith: "__SI-" } } });
  }

  console.log(fails === 0 ? "\nБүх шалгалт амжилттай." : `\n${fails} шалгалт унасан.`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
