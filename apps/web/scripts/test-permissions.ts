/**
 * Эрх ба устгалтын аюулгүй байдлын шалгалт.
 *
 * Server action-ууд нь сесс шаарддаг тул энд ХОЁР зүйлийг шалгана:
 *   1) Үйлчилгээний давхаргын түүхийн хамгаалалт (бодит өгөгдөл дээр).
 *   2) Устгах action бүр requireOwner() дуудаж байгаа эсэх (эх код дээр).
 */
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import {
  deleteRawMaterial, deleteProduct,
  getRawMaterialUsage, getProductUsage,
  getUsedRawMaterialIds, getUsedProductIds,
} from "../src/server/services/master-data";

const prisma = new PrismaClient();
let fails = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails += 1;
}

/** Устгах бүх action заавал requireOwner()-ээр хамгаалагдсан байх ёстой. */
const OWNER_ONLY_ACTIONS: { file: string; fn: string }[] = [
  { file: "src/app/(app)/materials/actions.ts", fn: "deleteRawMaterialAction" },
  { file: "src/app/(app)/products/actions.ts", fn: "deleteProductAction" },
  { file: "src/app/(app)/categories-actions.ts", fn: "deleteCategoryAction" },
  { file: "src/app/(app)/purchases/attachment-actions.ts", fn: "deletePurchaseAttachmentAction" },
];

async function main() {
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });

  // --- 1. Эх код: устгах action бүр requireOwner() дуудаж байна уу
  for (const { file, fn } of OWNER_ONLY_ACTIONS) {
    const source = await readFile(file, "utf8");
    const start = source.indexOf(`export async function ${fn}(`);
    const body = start >= 0 ? source.slice(start, start + 900) : "";
    check(
      `${fn} нь requireOwner()-ээр хамгаалагдсан`,
      start >= 0 && body.includes("await requireOwner()") && !body.includes("await requireOperator()"),
    );
  }

  // --- 2. Түүхтэй материалыг устгах боломжгүй
  const usedMaterial = await prisma.rawMaterial.findFirst({
    where: { movements: { some: {} } },
  });
  if (usedMaterial) {
    const usage = await getRawMaterialUsage(usedMaterial.id);
    check("Түүхтэй материалын ашиглалт илэрсэн", usage.length > 0,
      usage.map((u) => `${u.count} ${u.label}`).join(", "));

    let blocked = false; let msg = "";
    try { await deleteRawMaterial({ id: usedMaterial.id, userId: owner.id }); }
    catch (e) { blocked = true; msg = (e as Error).message; }
    check("Түүхтэй материалыг устгахыг хориглов", blocked, msg);
    check("Хориглосны дараа материал хэвээр байна",
      (await prisma.rawMaterial.findUnique({ where: { id: usedMaterial.id } })) !== null);

    const used = await getUsedRawMaterialIds([usedMaterial.id]);
    check("Бөөнөөр шалгах нь мөн ашиглагдсан гэж үзэв", used.has(usedMaterial.id));
  }

  // --- 3. Түүхтэй бүтээгдэхүүнийг устгах боломжгүй
  const usedProduct = await prisma.product.findFirst({ where: { saleItems: { some: {} } } });
  if (usedProduct) {
    const usage = await getProductUsage(usedProduct.id);
    check("Түүхтэй бүтээгдэхүүний ашиглалт илэрсэн", usage.length > 0,
      usage.map((u) => `${u.count} ${u.label}`).join(", "));

    let blocked = false; let msg = "";
    try { await deleteProduct({ id: usedProduct.id, userId: owner.id }); }
    catch (e) { blocked = true; msg = (e as Error).message; }
    check("Түүхтэй бүтээгдэхүүнийг устгахыг хориглов", blocked, msg);
    check("Хориглосны дараа бүтээгдэхүүн хэвээр байна",
      (await prisma.product.findUnique({ where: { id: usedProduct.id } })) !== null);
    check("Жор нь хэвээр байна",
      (await prisma.recipeItem.count({ where: { productId: usedProduct.id } })) > 0);

    const used = await getUsedProductIds([usedProduct.id]);
    check("Бөөнөөр шалгах нь мөн ашиглагдсан гэж үзэв", used.has(usedProduct.id));
  }

  // --- 4. Түүхгүй бичлэгийг устгаж болно
  const freshMaterial = await prisma.rawMaterial.create({
    data: { sku: `__TM${Date.now()}`, name: `__ТЕСТ материал`, unit: "KG" },
  });
  check("Түүхгүй материал ашиглалтгүй", (await getRawMaterialUsage(freshMaterial.id)).length === 0);
  await deleteRawMaterial({ id: freshMaterial.id, userId: owner.id });
  check("Түүхгүй материал устлаа",
    (await prisma.rawMaterial.findUnique({ where: { id: freshMaterial.id } })) === null);

  const freshProduct = await prisma.product.create({
    data: { sku: `__TP${Date.now()}`, name: `__ТЕСТ бүтээгдэхүүн`, sellingPrice: 100 },
  });
  await deleteProduct({ id: freshProduct.id, userId: owner.id });
  check("Түүхгүй бүтээгдэхүүн устлаа",
    (await prisma.product.findUnique({ where: { id: freshProduct.id } })) === null);

  // --- 5. Аудит
  check("Устгалт аудитад бүртгэгдэв",
    (await prisma.auditLog.count({
      where: { action: { in: ["RAW_MATERIAL_DELETED", "PRODUCT_DELETED"] } },
    })) >= 2);

  await prisma.auditLog.deleteMany({
    where: {
      action: { in: ["RAW_MATERIAL_DELETED", "PRODUCT_DELETED"] },
      entityId: { in: [freshMaterial.id, freshProduct.id] },
    },
  });

  console.log(fails === 0 ? "\nБүх шалгалт амжилттай." : `\n${fails} шалгалт унасан.`);
  if (fails > 0) process.exitCode = 1;
}
main().finally(() => prisma.$disconnect());
