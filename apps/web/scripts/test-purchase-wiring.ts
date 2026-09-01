/** Худалдан авалтын формын itemKey задаргаа ба нийлүүлэгчийн саналын шалгалт. */
import { PrismaClient } from "@prisma/client";
import { purchaseSchema } from "../src/lib/validation";
import { getSupplierSuggestions, getPriceHistory, getLastPriceBySupplier } from "../src/server/services/supplier-history";

const prisma = new PrismaClient();
let fails = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails += 1;
}

async function main() {
  // 1. itemKey задаргаа
  const rm = purchaseSchema.safeParse({
    date: "2026-09-01", paymentMethod: "CASH",
    items: [{ itemKey: "rm:abc123", quantity: "5", unit: "KG", unitPrice: "1000" }],
  });
  check("rm: түлхүүр rawMaterialId болж задарлаа",
    rm.success && rm.data.items[0]!.rawMaterialId === "abc123" && rm.data.items[0]!.productId === null,
    rm.success ? JSON.stringify(rm.data.items[0]) : JSON.stringify(rm.error.issues));

  const pr = purchaseSchema.safeParse({
    date: "2026-09-01", paymentMethod: "CASH",
    items: [{ itemKey: "pr:xyz789", quantity: "2", unit: "PCS", unitPrice: "500" }],
  });
  check("pr: түлхүүр productId болж задарлаа",
    pr.success && pr.data.items[0]!.productId === "xyz789" && pr.data.items[0]!.rawMaterialId === null);

  const bad = purchaseSchema.safeParse({
    date: "2026-09-01", paymentMethod: "CASH",
    items: [{ itemKey: "garbage", quantity: "1", unit: "KG", unitPrice: "1" }],
  });
  check("Буруу түлхүүрийг татгалзлаа", !bad.success);

  // 2. Нийлүүлэгчийн санал бодит түүхээс
  const supplier = await prisma.supplier.findFirst({
    where: { purchases: { some: { status: "POSTED" } } },
  });
  if (!supplier) { check("Түүхтэй нийлүүлэгч олдсонгүй (алгаслаа)", true); }
  else {
    const suggestions = await getSupplierSuggestions(supplier.id);
    check("Нийлүүлэгчийн санал буцлаа", suggestions.length > 0, `${supplier.name}: ${suggestions.length} санал`);
    check("Санал бүр яг нэг субьекттэй",
      suggestions.every((s) => Boolean(s.rawMaterialId) !== Boolean(s.productId)));
    check("Санал огноогоор буурч эрэмбэлэгдсэн",
      suggestions.every((s, i) => i === 0 || suggestions[i - 1]!.lastPurchaseDate >= s.lastPurchaseDate));

    // Сүүлийн үнэ нь үнэхээр хамгийн сүүлийн батлагдсан мөрийнх мөн үү
    const first = suggestions[0]!;
    const latestRow = await prisma.purchaseItem.findFirst({
      where: {
        ...(first.rawMaterialId ? { rawMaterialId: first.rawMaterialId } : { productId: first.productId }),
        purchase: { supplierId: supplier.id, status: "POSTED" },
      },
      orderBy: { purchase: { date: "desc" } },
    });
    check("Саналын үнэ хамгийн сүүлийн батлагдсан мөртэй тохирч байна",
      latestRow !== null && latestRow.unitPrice.toString() === first.lastUnitPrice,
      `${latestRow?.unitPrice} vs ${first.lastUnitPrice}`);

    // Цуцлагдсан баримт саналд орохгүй
    const cancelledItems = await prisma.purchaseItem.count({
      where: { purchase: { supplierId: supplier.id, status: "CANCELLED" } },
    });
    const postedKeys = new Set(
      (await prisma.purchaseItem.findMany({
        where: { purchase: { supplierId: supplier.id, status: "POSTED" } },
        select: { rawMaterialId: true, productId: true },
      })).map((i) => (i.rawMaterialId ? `rm:${i.rawMaterialId}` : `pr:${i.productId}`)),
    );
    check("Санал бүр батлагдсан түүхээс гарсан",
      suggestions.every((s) => postedKeys.has(s.key)),
      `цуцлагдсан мөр: ${cancelledItems}`);

    // 3. Үнийн түүх
    if (first.rawMaterialId) {
      const history = await getPriceHistory({ rawMaterialId: first.rawMaterialId });
      check("Үнийн түүх буцлаа", history.length > 0, `${history.length} бичлэг`);
      check("Үнийн түүх огноогоор буурсан",
        history.every((h, i) => i === 0 || history[i - 1]!.date >= h.date));
      const bySupplier = await getLastPriceBySupplier({ rawMaterialId: first.rawMaterialId });
      check("Нийлүүлэгч тус бүрийн сүүлийн үнэ давхардаагүй",
        new Set(bySupplier.map((b) => b.supplierId)).size === bySupplier.length,
        `${bySupplier.length} нийлүүлэгч`);
    }
  }

  console.log(fails === 0 ? "\nБүх шалгалт амжилттай." : `\n${fails} шалгалт унасан.`);
  if (fails > 0) process.exitCode = 1;
}
main().finally(() => prisma.$disconnect());
