/**
 * Нийлүүлэгчийн удирдлагын шалгалт.
 *
 * Тест нь өөрийн үүсгэсэн бүх бичлэгээ эцэст нь устгаж, түүхэн өгөгдөлд
 * ХҮРЭХГҮЙ.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";
import {
  createSupplier, updateSupplier, setSupplierActive, deleteSupplier,
  getSupplierUsage, listSuppliers, listSupplierItems, listEligibleItems,
  addSupplierItem, removeSupplierItem,
} from "../src/server/services/suppliers";
import { getSupplierItemPrices } from "../src/server/services/supplier-history";
import { postPurchase, cancelPurchase } from "../src/server/services/purchases";

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

const TAG = `__ТЕСТ-НИЙЛ-${Date.now()}`;

async function main() {
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });
  const manager = await prisma.user.findFirstOrThrow({ where: { role: "MANAGER" } });
  const created: string[] = [];
  const purchaseIds: string[] = [];
  let resaleProductId: string | null = null;

  try {
    // ---- 1-2. OWNER ба MANAGER хоёулаа үүсгэж чадна --------------------
    const a = await createSupplier({ input: { name: `${TAG}-A` }, userId: owner.id });
    created.push(a.id);
    check("1. OWNER нийлүүлэгч үүсгэв", Boolean(a.id));

    const b = await createSupplier({
      input: { name: `${TAG}-B`, phone: "99112233", contactPerson: "Болд", email: "b@example.mn" },
      userId: manager.id,
    });
    created.push(b.id);
    check("2. MANAGER нийлүүлэгч үүсгэв", Boolean(b.id));

    // ---- 3. Хоосон нэр татгалзана ---------------------------------------
    check("3a. Хоосон нэр татгалзсан",
      (await expectThrow(() => createSupplier({ input: { name: "" }, userId: owner.id }))) !== null);
    check("3b. Зөвхөн хоосон зайтай нэр татгалзсан",
      (await expectThrow(() => createSupplier({ input: { name: "   " }, userId: owner.id }))) !== null);
    const dupMsg = await expectThrow(() =>
      createSupplier({ input: { name: `  ${TAG}-a  ` }, userId: owner.id }));
    check("3c. Том/жижиг үсэг, зайгаар давхардсан нэр татгалзсан", dupMsg !== null);

    // ---- 4. Засах --------------------------------------------------------
    await updateSupplier({
      id: b.id,
      input: { name: `${TAG}-B2`, phone: "88112233", contactPerson: "Сараа", email: null, note: "тест" },
      userId: manager.id,
    });
    const edited = await prisma.supplier.findUniqueOrThrow({ where: { id: b.id } });
    check("4. Засвар хадгалагдав",
      edited.name === `${TAG}-B2` && edited.phone === "88112233" && edited.contactPerson === "Сараа");

    // ---- 5-6. Идэвхгүй / идэвхжүүлэх ------------------------------------
    await setSupplierActive({ id: b.id, isActive: false, userId: manager.id });
    check("5. Идэвхгүй боллоо",
      (await prisma.supplier.findUniqueOrThrow({ where: { id: b.id } })).isActive === false);
    await setSupplierActive({ id: b.id, isActive: true, userId: manager.id });
    check("6. Дахин идэвхжлээ",
      (await prisma.supplier.findUniqueOrThrow({ where: { id: b.id } })).isActive === true);

    // ---- 7. MANAGER устгаж чадахгүй (эх кодын баталгаа) ------------------
    const actionSrc = await readFile("src/app/(app)/purchases/suppliers/actions.ts", "utf8");
    /** Функцийн ЯГ биеийг таслаж авна — дараагийн функц рүү халихгүй. */
    const bodyOf = (fn: string): string => {
      const start = actionSrc.indexOf(`export async function ${fn}(`);
      if (start < 0) return "";
      const end = actionSrc.indexOf("\n}\n", start);
      return actionSrc.slice(start, end < 0 ? actionSrc.length : end);
    };
    const delBody = bodyOf("deleteSupplierAction");
    check("7. deleteSupplierAction нь requireOwner()-ээр хамгаалагдсан",
      delBody.includes("await requireOwner()") && !delBody.includes("await requireOperator()"));
    for (const fn of ["createSupplierAction", "updateSupplierAction", "setSupplierActiveAction",
                      "addSupplierItemAction", "removeSupplierItemAction"]) {
      const body = bodyOf(fn);
      check(`7b. ${fn} нь OWNER+MANAGER-т нээлттэй`,
        body.includes("await requireOperator()") && !body.includes("await requireOwner()"));
    }

    // ---- 8. OWNER ашиглагдаагүй нийлүүлэгчийг устгана --------------------
    const throwaway = await createSupplier({ input: { name: `${TAG}-DEL` }, userId: owner.id });
    check("8a. Ашиглалт хоосон", (await getSupplierUsage(throwaway.id)).length === 0);
    await deleteSupplier({ id: throwaway.id, userId: owner.id });
    check("8b. Ашиглагдаагүй нийлүүлэгч устлаа",
      (await prisma.supplier.findUnique({ where: { id: throwaway.id } })) === null);

    // ---- Тестийн бараа: түүхий эд ба бэлэн бүтээгдэхүүн ------------------
    const material = await prisma.rawMaterial.findFirstOrThrow({ where: { isActive: true } });
    const resale = await prisma.product.create({
      data: {
        sku: `__TS${Date.now()}`, name: `${TAG}-кола`, productType: "RESALE",
        unit: "PCS", sellingPrice: 3500, isActive: true,
      },
    });
    resaleProductId = resale.id;
    const manufactured = await prisma.product.findFirstOrThrow({ where: { productType: "MANUFACTURED" } });

    // ---- 10-11. Холбоос нэмэх --------------------------------------------
    await addSupplierItem({ supplierId: a.id, itemKey: `rm:${material.id}`, userId: owner.id });
    check("10. Түүхий эд холбогдов",
      (await listSupplierItems(a.id)).some((i) => i.kind === "rawMaterial"));
    await addSupplierItem({ supplierId: a.id, itemKey: `pr:${resale.id}`, userId: manager.id });
    check("11. Бэлэн бүтээгдэхүүн холбогдов",
      (await listSupplierItems(a.id)).some((i) => i.kind === "product"));

    // ---- 12. Үйлдвэрлэдэг бүтээгдэхүүн холбогдохгүй ----------------------
    const mfgMsg = await expectThrow(() =>
      addSupplierItem({ supplierId: a.id, itemKey: `pr:${manufactured.id}`, userId: owner.id }));
    check("12. Үйлдвэрлэдэг бүтээгдэхүүн холбогдохгүй", mfgMsg !== null, mfgMsg ?? "");
    check("12b. Сонголтын жагсаалтад ч ороогүй",
      !(await listEligibleItems(a.id)).some((i) => i.id === manufactured.id));

    // ---- 13-14. Давхардал хориглогдоно -----------------------------------
    check("13. Түүхий эдийн давхардал хориглогдов",
      (await expectThrow(() =>
        addSupplierItem({ supplierId: a.id, itemKey: `rm:${material.id}`, userId: owner.id }))) !== null);
    check("14. Бүтээгдэхүүний давхардал хориглогдов",
      (await expectThrow(() =>
        addSupplierItem({ supplierId: a.id, itemKey: `pr:${resale.id}`, userId: owner.id }))) !== null);

    // ---- 16-19. Үнэ нь ЗӨВХӨН батлагдсан түүхээс -------------------------
    // 19. Хэзээ ч аваагүй бол үнэ байхгүй
    check("19. Аваагүй бараанд сүүлийн үнэ алга",
      (await getSupplierItemPrices(a.id)).size === 0);

    const stockBefore = await prisma.product.findUniqueOrThrow({ where: { id: resale.id } });
    check("Холбоос нэмэхэд нөөц хөдлөөгүй",
      new D(stockBefore.quantity).equals(0) && new D(stockBefore.averageCost).equals(0));
    check("Холбоос нэмэхэд худалдан авалт үүсээгүй",
      (await prisma.purchase.count({ where: { supplierId: a.id } })) === 0);

    // 16. Хамгийн сүүлийн батлагдсан худалдан авалт
    const p1 = await postPurchase({
      date: new Date("2026-08-01"), supplierId: a.id, paymentMethod: "BANK", userId: owner.id,
      items: [{ productId: resale.id, quantity: 10, unit: "PCS", unitPrice: 2000 }],
    });
    purchaseIds.push(p1.id);
    const p2 = await postPurchase({
      date: new Date("2026-08-10"), supplierId: a.id, paymentMethod: "BANK", userId: owner.id,
      items: [{ productId: resale.id, quantity: 10, unit: "PCS", unitPrice: 2100 }],
    });
    purchaseIds.push(p2.id);
    let prices = await getSupplierItemPrices(a.id);
    check("16. Сүүлийн үнэ хамгийн сүүлийн батлагдсан баримтынх",
      new D(prices.get(`pr:${resale.id}`)!.unitPrice).equals(2100),
      prices.get(`pr:${resale.id}`)!.unitPrice);

    // 18. Цуцлагдсан баримт орохгүй
    const p3 = await postPurchase({
      date: new Date("2026-08-20"), supplierId: a.id, paymentMethod: "BANK", userId: owner.id,
      items: [{ productId: resale.id, quantity: 5, unit: "PCS", unitPrice: 9999 }],
    });
    purchaseIds.push(p3.id);
    check("18a. Цуцлахын өмнө шинэ үнэ харагдана",
      new D((await getSupplierItemPrices(a.id)).get(`pr:${resale.id}`)!.unitPrice).equals(9999));
    await cancelPurchase({ purchaseId: p3.id, userId: owner.id, note: "тест" });
    prices = await getSupplierItemPrices(a.id);
    check("18b. Цуцлагдсан баримт сүүлийн үнэ болохгүй",
      new D(prices.get(`pr:${resale.id}`)!.unitPrice).equals(2100),
      prices.get(`pr:${resale.id}`)!.unitPrice);

    // 17. DRAFT баримт орохгүй
    const draft = await prisma.purchase.create({
      data: {
        purchaseNo: `__D-${Date.now()}`, date: new Date("2026-08-25"), supplierId: a.id,
        paymentMethod: "BANK", totalAmount: 8888, status: "DRAFT", createdById: owner.id,
        items: { create: [{ productId: resale.id, quantity: 1, unit: "PCS", unitPrice: 8888,
                            subtotal: 8888, baseQuantity: 1, baseUnitCost: 8888 }] },
      },
    });
    purchaseIds.push(draft.id);
    prices = await getSupplierItemPrices(a.id);
    check("17. DRAFT баримт сүүлийн үнэ болохгүй",
      new D(prices.get(`pr:${resale.id}`)!.unitPrice).equals(2100),
      prices.get(`pr:${resale.id}`)!.unitPrice);

    // ---- 9. Түүхтэй нийлүүлэгчийг устгахгүй -----------------------------
    const usage = await getSupplierUsage(a.id);
    check("9a. Ашиглалт илэрсэн", usage.length > 0,
      usage.map((u) => `${u.count} ${u.label}`).join(", "));
    const delMsg = await expectThrow(() => deleteSupplier({ id: a.id, userId: owner.id }));
    check("9b. Түүхтэй нийлүүлэгчийг устгахыг хориглов", delMsg !== null, delMsg ?? "");
    check("9c. Хориглосны дараа нийлүүлэгч хэвээр",
      (await prisma.supplier.findUnique({ where: { id: a.id } })) !== null);
    check("9d. Худалдан авалт нь хэвээр",
      (await prisma.purchase.count({ where: { supplierId: a.id } })) === 4);

    // ---- A/B/C. Дараалан олон бараа холбох (UI-ийн алдааны домэйн хувилбар)
    //      Гурван өөр бараа дараалан холбогдох ёстой.
    const extra = await prisma.rawMaterial.findMany({
      where: { isActive: true, id: { not: material.id } },
      take: 2,
      orderBy: { name: "asc" },
    });
    for (const [i, m] of extra.entries()) {
      await addSupplierItem({ supplierId: a.id, itemKey: `rm:${m.id}`, userId: owner.id });
      check(`A/B/C. ${i + 2} дахь бараа дараалан холбогдов`,
        (await listSupplierItems(a.id)).some((x) => x.subject.id === m.id), m.name);
    }
    const afterSeq = await listSupplierItems(a.id);
    check("A/B/C. Нийт 4 бараа холбогдсон", afterSeq.length === 4, `${afterSeq.length}`);

    // ---- F. Салгасан бараа дахин холбогдох боломжтой ----------------------
    const reAdd = afterSeq.find((x) => x.subject.id === extra[0]!.id)!;
    await removeSupplierItem({ supplierItemId: reAdd.id, userId: owner.id });
    check("F. Салгасны дараа сонголтод дахин гарч ирэв",
      (await listEligibleItems(a.id)).some((x) => x.id === extra[0]!.id));
    await addSupplierItem({ supplierId: a.id, itemKey: `rm:${extra[0]!.id}`, userId: manager.id });
    check("F. Салгасан бараа дахин холбогдов",
      (await listSupplierItems(a.id)).some((x) => x.subject.id === extra[0]!.id));

    // ---- 15. Холбоос салгах нь түүхийг устгахгүй -------------------------
    const itemsBefore = await listSupplierItems(a.id);
    const productLink = itemsBefore.find((i) => i.kind === "product")!;
    const purchasesBefore = await prisma.purchase.count({ where: { supplierId: a.id } });
    const purchaseItemsBefore = await prisma.purchaseItem.count({ where: { productId: resale.id } });
    const movementsBefore = await prisma.inventoryMovement.count({ where: { productId: resale.id } });
    const productBefore = await prisma.product.findUniqueOrThrow({ where: { id: resale.id } });

    await removeSupplierItem({ supplierItemId: productLink.id, userId: manager.id });

    check("15a. Холбоос салгагдав",
      !(await listSupplierItems(a.id)).some((i) => i.id === productLink.id));
    check("15b. Худалдан авалт хэвээр",
      (await prisma.purchase.count({ where: { supplierId: a.id } })) === purchasesBefore);
    check("15c. Худалдан авалтын мөр хэвээр",
      (await prisma.purchaseItem.count({ where: { productId: resale.id } })) === purchaseItemsBefore);
    check("15d. Нөөцийн хөдөлгөөн хэвээр",
      (await prisma.inventoryMovement.count({ where: { productId: resale.id } })) === movementsBefore);
    const productAfter = await prisma.product.findUniqueOrThrow({ where: { id: resale.id } });
    check("15e. Үлдэгдэл ба жигнэсэн дундаж өртөг хэвээр",
      new D(productAfter.quantity).equals(new D(productBefore.quantity)) &&
      new D(productAfter.averageCost).equals(new D(productBefore.averageCost)),
      `${productAfter.quantity} / ${productAfter.averageCost}`);
    check("15f. Түүхэн үнэ хэвээр харагдана",
      new D((await getSupplierItemPrices(a.id)).get(`pr:${resale.id}`)!.unitPrice).equals(2100));

    // ---- G/H. Түүхий эдийн холбоос салгахад нөөц, өртөг, түүх хөндөгдөхгүй
    const matBefore = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } });
    const matMovesBefore = await prisma.inventoryMovement.count({ where: { rawMaterialId: material.id } });
    const matPurchaseItemsBefore = await prisma.purchaseItem.count({ where: { rawMaterialId: material.id } });
    const matLink = (await listSupplierItems(a.id)).find((x) => x.subject.id === material.id)!;

    await removeSupplierItem({ supplierItemId: matLink.id, userId: owner.id });

    const matAfter = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } });
    check("G. Түүхий эд өөрөө устаагүй", matAfter !== null);
    check("H. Үлдэгдэл хэвээр",
      new D(matAfter.quantity).equals(new D(matBefore.quantity)), matAfter.quantity.toString());
    check("H. Жигнэсэн дундаж өртөг хэвээр",
      new D(matAfter.averageCost).equals(new D(matBefore.averageCost)), matAfter.averageCost.toString());
    check("H. Сүүлийн авалтын үнэ хэвээр",
      new D(matAfter.lastPurchasePrice ?? 0).equals(new D(matBefore.lastPurchasePrice ?? 0)));
    check("H. Нөөцийн хөдөлгөөн хэвээр",
      (await prisma.inventoryMovement.count({ where: { rawMaterialId: material.id } })) === matMovesBefore);
    check("G. Худалдан авалтын мөр хэвээр",
      (await prisma.purchaseItem.count({ where: { rawMaterialId: material.id } })) === matPurchaseItemsBefore);

    // ---- Жагсаалтын нэгтгэл ---------------------------------------------
    const list = await listSuppliers({ query: TAG });
    const rowA = list.find((r) => r.id === a.id);
    // Зөвхөн БАТЛАГДСАН баримт тоологдоно: p1 + p2. p3 цуцлагдсан, нэг нь DRAFT.
    check("Жагсаалтад зөвхөн батлагдсан худалдан авалт тоологдов",
      rowA?.purchaseCount === 2, `${rowA?.purchaseCount}`);
    // 4 холбоос нэмэгдээд, бүтээгдэхүүн ба түүхий эдийн холбоос салгагдсан.
    check("Жагсаалтад холбогдсон барааны тоо зөв", rowA?.itemCount === 2, `${rowA?.itemCount}`);
    check("Хайлт нэрээр ажиллаж байна", list.length >= 2, `${list.length}`);
    check("Төлөвөөр шүүх ажиллаж байна",
      (await listSuppliers({ query: TAG, status: "inactive" })).length === 0);

    // ---- 25. Аудит -------------------------------------------------------
    const audits = await prisma.auditLog.groupBy({
      by: ["action"],
      where: { action: { startsWith: "SUPPLIER" }, entityId: { in: [...created, throwaway.id] } },
      _count: { _all: true },
    });
    const seen = new Set(audits.map((x) => x.action));
    for (const action of ["SUPPLIER_CREATED", "SUPPLIER_UPDATED", "SUPPLIER_DEACTIVATED",
                          "SUPPLIER_REACTIVATED", "SUPPLIER_DELETED", "SUPPLIER_ITEM_ADDED",
                          "SUPPLIER_ITEM_REMOVED"]) {
      check(`25. Аудитад ${action} бүртгэгдэв`, seen.has(action));
    }
  } finally {
    for (const id of purchaseIds) {
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: id } });
      await prisma.moneyTransaction.deleteMany({ where: { referenceId: id } });
      await prisma.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await prisma.purchase.delete({ where: { id } }).catch(() => {});
    }
    if (resaleProductId) {
      await prisma.inventoryMovement.deleteMany({ where: { productId: resaleProductId } });
      await prisma.supplierItem.deleteMany({ where: { productId: resaleProductId } });
      await prisma.product.delete({ where: { id: resaleProductId } }).catch(() => {});
    }
    for (const id of created) {
      await prisma.supplierItem.deleteMany({ where: { supplierId: id } });
      await prisma.supplier.delete({ where: { id } }).catch(() => {});
    }
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { action: { startsWith: "SUPPLIER" }, entityId: { in: created } },
          { entityId: { in: [...purchaseIds, ...(resaleProductId ? [resaleProductId] : [])] } },
        ],
      },
    });
    await prisma.auditLog.deleteMany({ where: { action: "SUPPLIER_DELETED", note: null, entityType: "Supplier", createdAt: { gte: new Date(Date.now() - 600000) } } });
  }

  console.log(fails === 0 ? "\nБүх шалгалт амжилттай." : `\n${fails} шалгалт унасан.`);
  if (fails > 0) process.exitCode = 1;
}
main().finally(() => prisma.$disconnect());
