import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

/**
 * Мастер өгөгдлийг БҮР МӨСӨН устгах.
 *
 * Дуудагч талд OWNER эрхийг ЗААВАЛ шалгасан байх ёстой.
 *
 * Устгах нь зөвхөн ямар ч түүхэнд ороогүй бичлэгт зөвшөөрөгдөнө. Түүхтэй
 * бичлэгийг идэвхгүй болгоно — устгавал өнгөрсөн баримт, дэвтэр, тайлан
 * утгаа алдана. Шалгалт ба устгалт нэг гүйлгээнд, мөрийг түгжсэн байдлаар
 * явагдана: зэрэгцээ хүсэлт шалгалтын дараа түүх нэмж чадахгүй.
 */

export type UsageBlock = { label: string; count: number };

/** Устгахад саад болж буй холбоосууд. Хоосон бол устгах аюулгүй. */
export async function getRawMaterialUsage(id: string): Promise<UsageBlock[]> {
  const [movements, purchaseItems, recipeItems, countItems] = await Promise.all([
    prisma.inventoryMovement.count({ where: { rawMaterialId: id } }),
    prisma.purchaseItem.count({ where: { rawMaterialId: id } }),
    prisma.recipeItem.count({ where: { rawMaterialId: id } }),
    prisma.inventoryCountItem.count({ where: { rawMaterialId: id } }),
  ]);

  return [
    { label: "нөөцийн хөдөлгөөн", count: movements },
    { label: "худалдан авалтын мөр", count: purchaseItems },
    { label: "жорын мөр", count: recipeItems },
    { label: "тооллогын мөр", count: countItems },
  ].filter((row) => row.count > 0);
}

export async function getProductUsage(id: string): Promise<UsageBlock[]> {
  const [saleItems, movements, purchaseItems, recipeItems] = await Promise.all([
    prisma.saleItem.count({ where: { productId: id } }),
    prisma.inventoryMovement.count({ where: { productId: id } }),
    prisma.purchaseItem.count({ where: { productId: id } }),
    prisma.recipeItem.count({ where: { productId: id } }),
  ]);

  return [
    { label: "борлуулалтын мөр", count: saleItems },
    { label: "нөөцийн хөдөлгөөн", count: movements },
    { label: "худалдан авалтын мөр", count: purchaseItems },
    { label: "жорын мөр", count: recipeItems },
  ].filter((row) => row.count > 0);
}

function blockMessage(name: string, blocks: UsageBlock[]): string {
  const detail = blocks.map((b) => `${b.count} ${b.label}`).join(", ");
  return (
    `"${name}" түүхэнд ашиглагдсан байна (${detail}). ` +
    "Устгахын оронд идэвхгүй болгоно уу — өнгөрсөн баримтууд утгаа алдахгүй."
  );
}

export async function deleteRawMaterial(params: {
  id: string;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "RawMaterial" WHERE id = ${params.id} FOR UPDATE`;

    const material = await tx.rawMaterial.findUnique({ where: { id: params.id } });
    if (!material) throw new Error("Бараа материал олдсонгүй.");

    const [movements, purchaseItems, recipeItems, countItems] = await Promise.all([
      tx.inventoryMovement.count({ where: { rawMaterialId: params.id } }),
      tx.purchaseItem.count({ where: { rawMaterialId: params.id } }),
      tx.recipeItem.count({ where: { rawMaterialId: params.id } }),
      tx.inventoryCountItem.count({ where: { rawMaterialId: params.id } }),
    ]);
    const blocks = [
      { label: "нөөцийн хөдөлгөөн", count: movements },
      { label: "худалдан авалтын мөр", count: purchaseItems },
      { label: "жорын мөр", count: recipeItems },
      { label: "тооллогын мөр", count: countItems },
    ].filter((row) => row.count > 0);
    if (blocks.length > 0) throw new Error(blockMessage(material.name, blocks));

    await tx.rawMaterial.delete({ where: { id: params.id } });

    await writeAudit(
      {
        userId: params.userId,
        action: "RAW_MATERIAL_DELETED",
        entityType: "RawMaterial",
        entityId: params.id,
        oldValue: { sku: material.sku, name: material.name, unit: material.unit },
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}

export async function deleteProduct(params: {
  id: string;
  userId: string;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${params.id} FOR UPDATE`;

    const product = await tx.product.findUnique({ where: { id: params.id } });
    if (!product) throw new Error("Бүтээгдэхүүн олдсонгүй.");

    const [saleItems, movements, purchaseItems] = await Promise.all([
      tx.saleItem.count({ where: { productId: params.id } }),
      tx.inventoryMovement.count({ where: { productId: params.id } }),
      tx.purchaseItem.count({ where: { productId: params.id } }),
    ]);
    const blocks = [
      { label: "борлуулалтын мөр", count: saleItems },
      { label: "нөөцийн хөдөлгөөн", count: movements },
      { label: "худалдан авалтын мөр", count: purchaseItems },
    ].filter((row) => row.count > 0);
    if (blocks.length > 0) throw new Error(blockMessage(product.name, blocks));

    // Жор нь тухайн бүтээгдэхүүний өөрийн тодорхойлолт — түүх биш тул
    // бүтээгдэхүүнтэйгээ хамт устана.
    await tx.recipeItem.deleteMany({ where: { productId: params.id } });
    await tx.product.delete({ where: { id: params.id } });

    await writeAudit(
      {
        userId: params.userId,
        action: "PRODUCT_DELETED",
        entityType: "Product",
        entityId: params.id,
        oldValue: { sku: product.sku, name: product.name, productType: product.productType },
        ipAddress: params.ipAddress,
      },
      tx,
    );
  });
}

/**
 * Жагсаалтын хуудсанд ашиглана: өгөгдсөн ID-уудаас ТҮҮХТЭЙ нь алийг нь вэ.
 * Мөр бүрд тусад нь тоолохын оронд бүлэглэсэн дөрвөн асуулга явуулна.
 */
export async function getUsedRawMaterialIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const [movements, purchaseItems, recipeItems, countItems] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { rawMaterialId: { in: ids } },
      select: { rawMaterialId: true },
      distinct: ["rawMaterialId"],
    }),
    prisma.purchaseItem.findMany({
      where: { rawMaterialId: { in: ids } },
      select: { rawMaterialId: true },
      distinct: ["rawMaterialId"],
    }),
    prisma.recipeItem.findMany({
      where: { rawMaterialId: { in: ids } },
      select: { rawMaterialId: true },
      distinct: ["rawMaterialId"],
    }),
    prisma.inventoryCountItem.findMany({
      where: { rawMaterialId: { in: ids } },
      select: { rawMaterialId: true },
      distinct: ["rawMaterialId"],
    }),
  ]);

  const used = new Set<string>();
  for (const rows of [movements, purchaseItems, recipeItems, countItems]) {
    for (const row of rows) if (row.rawMaterialId) used.add(row.rawMaterialId);
  }
  return used;
}

/** Мөн адил бүтээгдэхүүнд. Жор нь түүх биш тул саад болохгүй. */
export async function getUsedProductIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const [saleItems, movements, purchaseItems] = await Promise.all([
    prisma.saleItem.findMany({
      where: { productId: { in: ids } },
      select: { productId: true },
      distinct: ["productId"],
    }),
    prisma.inventoryMovement.findMany({
      where: { productId: { in: ids } },
      select: { productId: true },
      distinct: ["productId"],
    }),
    prisma.purchaseItem.findMany({
      where: { productId: { in: ids } },
      select: { productId: true },
      distinct: ["productId"],
    }),
  ]);

  const used = new Set<string>();
  for (const rows of [saleItems, movements, purchaseItems]) {
    for (const row of rows) if (row.productId) used.add(row.productId);
  }
  return used;
}
