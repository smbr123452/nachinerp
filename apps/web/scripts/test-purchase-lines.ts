/**
 * Худалдан авалтын мөрийн ялгах тэмдэг (identity) ба давхардсан мөрийн
 * шалгалт.
 *
 * Ямар алдааг барих вэ: баталгаажуулах модал урьд нь React key болгож
 * БАРААНЫ түлхүүрийг ашигладаг байсан. Нэг нэхэмжлэхэд ижил бараа өөр
 * үнээр хоёр мөр болж орох нь ЗӨВ өгөгдөл тул key давхцаж, React
 * "Encountered two children with the same key" анхааруулга өгдөг байв.
 *
 * Тест нь өөрийн үүсгэсэн бүх бичлэгээ устгаж, түүхэн өгөгдөлд хүрэхгүй.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { buildConfirmLines, lineNumber } from "../src/lib/purchase-lines";
import { postPurchase } from "../src/server/services/purchases";

const prisma = new PrismaClient();
const D = Prisma.Decimal;
let fails = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails += 1;
}

async function main() {
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });
  const stamp = Date.now();
  const purchaseIds: string[] = [];

  const material = await prisma.rawMaterial.create({
    data: { sku: `__PL-M-${stamp}`, name: `__ТЕСТ гурил ${stamp}`, unit: "KG" },
  });
  const resale = await prisma.product.create({
    data: {
      sku: `__PL-P-${stamp}`, name: `__ТЕСТ кола ${stamp}`,
      productType: "RESALE", unit: "PCS", sellingPrice: 3000,
    },
  });

  try {
    // ---- 1. ИЖИЛ бараатай хоёр мөрийн key ДАВХЦАХГҮЙ -------------------
    // Яг энэ тохиолдол л алдааг үүсгэж байсан.
    const duplicateRows = [
      { id: "row-a", itemKey: `rm:${material.id}`, quantity: "5", unitPrice: "4000" },
      { id: "row-b", itemKey: `rm:${material.id}`, quantity: "3", unitPrice: "4500" },
    ];
    const dupLines = buildConfirmLines(duplicateRows);
    const dupKeys = dupLines.map((l) => l.key);
    check("1. Ижил бараатай хоёр мөр хоёулаа үлдэв", dupLines.length === 2);
    check("1b. Тэдгээрийн key ДАВХЦААГҮЙ",
      new Set(dupKeys).size === dupKeys.length, dupKeys.join(", "));
    check("1c. key нь бараагаар БИШ, мөрөөр тодорхойлогдов",
      dupKeys[0] === "row-a" && dupKeys[1] === "row-b");

    // ---- 2. Өөр бараа сонгосон хоёр мөр ---------------------------------
    const mixedLines = buildConfirmLines([
      { id: "r1", itemKey: `rm:${material.id}`, quantity: "2", unitPrice: "1000" },
      { id: "r2", itemKey: `pr:${resale.id}`, quantity: "1", unitPrice: "1500" },
    ]);
    check("2. Түүхий эд + бэлэн бүтээгдэхүүн хоёулаа үлдэв", mixedLines.length === 2);
    check("2b. key давхцаагүй", new Set(mixedLines.map((l) => l.key)).size === 2);

    // ---- 3. Бөглөөгүй мөрүүд алгасагдана --------------------------------
    const sparse = buildConfirmLines([
      { id: "r1", itemKey: "", quantity: "5", unitPrice: "100" },
      { id: "r2", itemKey: `rm:${material.id}`, quantity: "0", unitPrice: "100" },
      { id: "r3", itemKey: `rm:${material.id}`, quantity: "4", unitPrice: "100" },
    ]);
    check("3. Бараагүй ба тэг тоотой мөр алгасагдав",
      sparse.length === 1 && sparse[0].key === "r3");

    // ---- 4. Олон мөр дээр key бүр давтагдашгүй ---------------------------
    const many = buildConfirmLines(
      Array.from({ length: 25 }, (_, i) => ({
        id: `row-${i}`,
        itemKey: `rm:${material.id}`, // ЦӨМ нь ижил бараа
        quantity: "1",
        unitPrice: "100",
      })),
    );
    check("4. 25 мөр бүгд ижил бараатай ч key давхцаагүй",
      many.length === 25 && new Set(many.map((l) => l.key)).size === 25);

    // ---- 5. Тоо задлах дүрэм --------------------------------------------
    check("5. Зай, таслалтай тоо зөв уншигдав",
      lineNumber("1 200") === 1200 && lineNumber("1,5") === 15 && lineNumber("abc") === 0);

    // ---- 6. Мөрийн дугаар эх кодод үнэхээр ашиглагдаж байна --------------
    const formSrc = await readFile("src/app/(app)/purchases/new/PurchaseForm.tsx", "utf8");
    check("6. Хүснэгтийн key нь мөрийн дугаар (index БИШ)",
      formSrc.includes("<Tr key={row.id}>") && !formSrc.includes("<Tr key={index}>"));
    check("6b. Мөр бүр үүсэхдээ дугаар авдаг", formSrc.includes("function newRowId()"));
    check("6c. Формын талбарын нэр index-ээр хэвээр (сервер задлалт)",
      formSrc.includes("items[${index}][itemKey]"));

    // ---- 7. Давхардсан мөр БОДИТ өгөгдөл болж зөв бичигдэнэ --------------
    // Энэ нь зөвхөн харагдацын асуудал байсныг баталгаажуулна.
    const posted = await postPurchase({
      date: new Date(), paymentMethod: "CASH", userId: owner.id,
      idempotencyKey: `__pl-dup-${stamp}`,
      items: [
        { rawMaterialId: material.id, quantity: 5, unit: "KG", unitPrice: 4000 },
        { rawMaterialId: material.id, quantity: 3, unit: "KG", unitPrice: 4500 },
      ],
    });
    purchaseIds.push(posted.id);
    const items = await prisma.purchaseItem.findMany({ where: { purchaseId: posted.id } });
    const moves = await prisma.inventoryMovement.findMany({
      where: { referenceId: posted.id }, orderBy: { createdAt: "asc" },
    });
    const stock = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: material.id } });
    check("7. Хоёр мөр хоёр PurchaseItem үүсгэв", items.length === 2);
    check("7b. Хоёр нөөцийн хөдөлгөөн үүсэв", moves.length === 2);
    check("7c. Үлдэгдэл дараалан нэмэгдэв",
      moves.length === 2 &&
      new D(moves[0].balanceAfter).equals(5) && new D(moves[1].balanceAfter).equals(8));
    check("7d. Жигнэсэн дундаж өртөг зөв — (5×4000 + 3×4500) / 8",
      new D(stock.averageCost).equals(new D(5 * 4000 + 3 * 4500).dividedBy(8)),
      stock.averageCost.toString());
    check("7e. Мөнгөн гүйлгээ ЯГ нэг",
      (await prisma.moneyTransaction.count({ where: { referenceId: posted.id } })) === 1);

    // ---- 8. Давхар илгээлт нэмэлт баримт үүсгэхгүй ------------------------
    const again = await postPurchase({
      date: new Date(), paymentMethod: "CASH", userId: owner.id,
      idempotencyKey: `__pl-dup-${stamp}`,
      items: [
        { rawMaterialId: material.id, quantity: 5, unit: "KG", unitPrice: 4000 },
        { rawMaterialId: material.id, quantity: 3, unit: "KG", unitPrice: 4500 },
      ],
    });
    check("8. Ижил түлхүүр өмнөх баримтыг буцаав",
      again.id === posted.id && again.created === false);
    check("8b. Хөдөлгөөн давхардаагүй",
      (await prisma.inventoryMovement.count({ where: { referenceId: posted.id } })) === 2);
  } finally {
    await prisma.inventoryMovement.deleteMany({ where: { referenceId: { in: purchaseIds } } });
    await prisma.moneyTransaction.deleteMany({ where: { referenceId: { in: purchaseIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: purchaseIds } } });
    await prisma.purchaseItem.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
    await prisma.purchase.deleteMany({ where: { id: { in: purchaseIds } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "__PL-P-" } } });
    await prisma.rawMaterial.deleteMany({ where: { sku: { startsWith: "__PL-M-" } } });
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
